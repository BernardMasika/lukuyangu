/**
 * The ledger: one chronological view of readings + purchases + outages.
 *
 * A LUKU meter counts DOWN, so a reading alone cannot tell you how much you
 * used once a top-up lands in the middle. Every consumption question in this
 * app is really the same question over the same merged timeline, so it is
 * answered once, here, and read by /api/stats, the dashboard and analytics.
 *
 * A top-up merges into the balance on the meter (the display jumps to old +
 * new), so a purchase lives from the moment it lands until the next one.
 */

export interface ReadingRow {
  id: number;
  reading: number;
  created_at: string;
}

export interface PurchaseRow {
  id: number;
  units: number;
  amount_tzs: number;
  vendor?: string;
  created_at: string;
}

export interface OutageRow {
  id?: number;
  start_at: string;
  end_at: string | null;
}

export interface Segment {
  /** ISO timestamp of the reading that opens the segment */
  from: string;
  /** ISO timestamp of the reading that closes it */
  to: string;
  startBalance: number;
  endBalance: number;
  /** units credited by purchases landing inside (from, to] */
  purchasedUnits: number;
  purchaseIds: number[];
  /** startBalance + purchasedUnits - endBalance, clamped at 0 */
  consumption: number;
  hours: number;
  outageHours: number;
  /** hours the meter could actually have been drawing power */
  activeHours: number;
  /** kWh per active day, null when the segment has no active time */
  rate: number | null;
  /** true when the arithmetic came out negative: a top-up or a typo is missing */
  suspect: boolean;
  /** how many units are unaccounted for when suspect */
  unaccountedUnits: number;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

function ms(iso: string): number {
  return new Date(iso).getTime();
}

/** Sum outage durations (in days) that overlap a time window.
 *  Clamps each outage to the window boundaries. Skips ongoing outages.
 *  Lives here so the ledger stays dependency-free and testable on its own;
 *  `lib/utils` re-exports it for the callers that already import it there. */
export function calcOutageDurationDays(
  outages: { start_at: string; end_at: string | null }[],
  windowStart: Date,
  windowEnd: Date
): number {
  let totalMs = 0;
  for (const o of outages) {
    if (!o.end_at) continue; // skip ongoing
    const oStart = new Date(o.start_at);
    const oEnd = new Date(o.end_at);
    const clampedStart = oStart < windowStart ? windowStart : oStart;
    const clampedEnd = oEnd > windowEnd ? windowEnd : oEnd;
    if (clampedStart < clampedEnd) {
      totalMs += clampedEnd.getTime() - clampedStart.getTime();
    }
  }
  return totalMs / MS_PER_DAY;
}

/** Merge readings, purchases and outages into consecutive consumption segments. */
export function buildSegments(
  readings: ReadingRow[],
  purchases: PurchaseRow[],
  outages: OutageRow[] = []
): Segment[] {
  const sorted = [...readings].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  if (sorted.length < 2) return [];

  const segments: Segment[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const fromMs = ms(prev.created_at);
    const toMs = ms(curr.created_at);

    // A purchase landing exactly on the opening reading belongs to the previous
    // segment, so the window is half-open: (from, to].
    const inWindow = purchases.filter((p) => {
      const t = ms(p.created_at);
      return t > fromMs && t <= toMs;
    });
    const purchasedUnits = inWindow.reduce((sum, p) => sum + p.units, 0);

    const raw = prev.reading + purchasedUnits - curr.reading;
    const hours = (toMs - fromMs) / MS_PER_HOUR;
    const outageHours =
      calcOutageDurationDays(outages, new Date(fromMs), new Date(toMs)) * 24;
    const activeHours = Math.max(0, hours - outageHours);

    segments.push({
      from: prev.created_at,
      to: curr.created_at,
      startBalance: prev.reading,
      endBalance: curr.reading,
      purchasedUnits,
      purchaseIds: inWindow.map((p) => p.id),
      consumption: Math.max(0, raw),
      hours,
      outageHours,
      activeHours,
      // Two readings a minute apart (logging a token) divide by almost zero and
      // produce a nonsense daily rate, so anything under 6 minutes has none.
      rate: activeHours >= 0.1 ? Math.max(0, raw) / (activeHours / 24) : null,
      suspect: raw < -0.05,
      unaccountedUnits: raw < -0.05 ? Math.round(-raw * 10) / 10 : 0,
    });
  }

  return segments;
}

/** Consumption inside an arbitrary window. Segments that straddle a boundary
 *  are prorated by elapsed time, so the answer is an estimate rather than a
 *  blank. */
export function consumptionBetween(
  segments: Segment[],
  windowStart: Date,
  windowEnd: Date
): {
  units: number;
  estimated: boolean;
  hasData: boolean;
  /** days of the window the readings actually cover */
  days: number;
  /** the same, with outage hours removed: divide by this for a burn rate */
  activeDays: number;
} {
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  let units = 0;
  let estimated = false;
  let hasData = false;
  let coveredMs = 0;
  let activeHours = 0;

  for (const seg of segments) {
    const segStart = ms(seg.from);
    const segEnd = ms(seg.to);
    if (segEnd <= startMs || segStart >= endMs) continue;

    hasData = true;
    const overlapStart = Math.max(segStart, startMs);
    const overlapEnd = Math.min(segEnd, endMs);
    const full = segEnd - segStart;

    coveredMs += overlapEnd - overlapStart;
    if (overlapStart <= segStart && overlapEnd >= segEnd) {
      units += seg.consumption;
      activeHours += seg.activeHours;
    } else if (full > 0) {
      const fraction = (overlapEnd - overlapStart) / full;
      units += seg.consumption * fraction;
      activeHours += seg.activeHours * fraction;
      estimated = true;
    }
  }

  return {
    units: Math.round(units * 10) / 10,
    estimated,
    hasData,
    days: Math.round((coveredMs / MS_PER_DAY) * 100) / 100,
    activeDays: Math.round((activeHours / 24) * 100) / 100,
  };
}

/**
 * Burn rate over the segments given, in kWh per ACTIVE day.
 *
 * The old version walked raw readings and silently dropped any pair that
 * contained a top-up, so every purchase punched a hole in the average. Segments
 * already have the purchase credited, so nothing is dropped now.
 *
 * Still needs 3 readings across 3 days before it will commit to a number.
 */
export function burnRateFrom(
  segments: Segment[],
  minReadings = 3,
  minDays = 3,
  maxSegmentDays = 14
): { rate: number; activeDays: number; consumption: number } | null {
  // Drop the bridge across a long break. Stop logging for five months and that
  // one segment carries a few kWh spread over the whole gap, which is not a
  // daily rate, it is an artefact. Averaged in, it buries every real segment
  // and pushes the "runs out" date years out.
  const usable = segments.filter((s) => s.hours / 24 <= maxSegmentDays);
  if (usable.length < minReadings - 1) return null;

  const spanDays =
    (ms(usable[usable.length - 1].to) - ms(usable[0].from)) / MS_PER_DAY;
  if (spanDays < minDays) return null;

  let consumption = 0;
  let activeHours = 0;
  for (const seg of usable) {
    consumption += seg.consumption;
    activeHours += seg.activeHours;
  }

  const activeDays = activeHours / 24;
  if (activeDays <= 0) return null;

  return {
    rate: consumption / activeDays,
    activeDays: Math.round(activeDays * 10) / 10,
    consumption: Math.round(consumption * 10) / 10,
  };
}

/** Per-day consumption for the last `days` days, oldest first. Days are cut at
 *  midnight in Dar es Salaam, and a day with no reading either side comes back
 *  as null rather than a misleading zero. */
export function dailySeries(
  segments: Segment[],
  days = 30,
  now: Date = new Date()
): { date: string; units: number | null }[] {
  const out: { date: string; units: number | null }[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const dayEnd = new Date(now.getTime() - i * MS_PER_DAY);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Dar_es_Salaam",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(dayEnd);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const date = `${get("year")}-${get("month")}-${get("day")}`;

    const start = new Date(`${date}T00:00:00+03:00`);
    const end = new Date(start.getTime() + MS_PER_DAY);
    const window = consumptionBetween(segments, start, end > now ? now : end);
    out.push({ date, units: window.hasData ? window.units : null });
  }

  return out;
}

/** The burn rate every page shows: the last 30 days, or all history when that
 *  is too thin to commit to. Lives here so stats, the summary and the AI
 *  insight cannot each pick their own window and disagree.
 *
 *  The window matches on `from`, not `to`. After a break in logging the
 *  bridging segment ends inside the window but starts months earlier, and
 *  counting it drags the rate to nearly zero. */
export function currentBurnRate(
  segments: Segment[],
  now: Date = new Date(),
  // An unlogged stretch longer than this is usually time away: the total is
  // real, but it is not the daily habit the runway should be projected from.
  // (24-30 Sept 2026 ran at 1.1/day with the house empty and dragged the rate
  // from 3.1 to 2.1.) Raise it if you log less than every couple of days.
  maxSegmentDays = 2
): ReturnType<typeof burnRateFrom> {
  const cutoff = now.getTime() - 30 * MS_PER_DAY;
  const recent = segments.filter((s) => ms(s.from) >= cutoff);
  return (
    burnRateFrom(recent, 3, 3, maxSegmentDays) ??
    burnRateFrom(segments, 3, 3, maxSegmentDays)
  );
}

// --- Calendar windows in Dar es Salaam ---------------------------------------
// Tanzania has no daylight saving, so EAT is a fixed UTC+3 and calendar maths
// needs no Intl here (which keeps the ledger import-free and testable).

const EAT_OFFSET_MS = 3 * MS_PER_HOUR;

function eatDayStartMs(t: number): number {
  return Math.floor((t + EAT_OFFSET_MS) / MS_PER_DAY) * MS_PER_DAY - EAT_OFFSET_MS;
}

/** YYYY-MM-DD of the EAT calendar day `at` falls in. */
export function eatDateKey(at: Date): string {
  return new Date(at.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** Monday 00:00 EAT of the week `at` falls in. */
export function eatWeekStart(at: Date): Date {
  const day = eatDayStartMs(at.getTime());
  const dow = new Date(day + EAT_OFFSET_MS).getUTCDay(); // 0 = Sunday
  return new Date(day - ((dow + 6) % 7) * MS_PER_DAY);
}

/** The 1st at 00:00 EAT, `offset` months from the month `at` falls in. */
export function eatMonthStart(at: Date, offset = 0): Date {
  const local = new Date(at.getTime() + EAT_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + offset, 1) -
      EAT_OFFSET_MS
  );
}

/**
 * Units and elapsed hours by EAT hour of day (index 0-23).
 *
 * Each segment is split across the hours it actually spans, so a stretch from
 * 00:39 to 10:25 is shared between night and morning instead of being dumped on
 * whichever end the reading happened to land. Segments longer than a day are
 * left out: they say how much was used, not when.
 */
export function hourlyProfile(
  segments: Segment[],
  windowStart?: Date,
  windowEnd?: Date,
  maxSegmentHours = 24
): { units: number[]; hours: number[] } {
  const units = new Array<number>(24).fill(0);
  const hours = new Array<number>(24).fill(0);
  const lo = windowStart ? windowStart.getTime() : -Infinity;
  const hi = windowEnd ? windowEnd.getTime() : Infinity;

  for (const seg of segments) {
    if (seg.hours > maxSegmentHours) continue;
    const from = ms(seg.from);
    const to = ms(seg.to);
    const full = to - from;
    if (full <= 0) continue;

    // ponytail: spread evenly by elapsed time, outage hours included. Weight by
    // active time if outages start skewing the profile.
    const end = Math.min(to, hi);
    for (let t = Math.max(from, lo); t < end; ) {
      // EAT is a whole-hour offset, so UTC hour boundaries are EAT ones too.
      const next = Math.min(end, (Math.floor(t / MS_PER_HOUR) + 1) * MS_PER_HOUR);
      const h = new Date(t + EAT_OFFSET_MS).getUTCHours();
      units[h] += seg.consumption * ((next - t) / full);
      hours[h] += (next - t) / MS_PER_HOUR;
      t = next;
    }
  }

  return { units, hours };
}

/**
 * This month against last, per day of data.
 *
 * Totals are useless here: four days of October against a whole September
 * always reads as "down", even when the daily use doubled.
 */
export function monthComparison(segments: Segment[], now: Date = new Date()) {
  const thisStart = eatMonthStart(now);
  const thisMonth = consumptionBetween(segments, thisStart, now);
  const lastMonth = consumptionBetween(segments, eatMonthStart(now, -1), thisStart);
  const perDay = (w: { units: number; days: number }) =>
    w.days >= 1 ? Math.round((w.units / w.days) * 10) / 10 : null;
  const thisPerDay = perDay(thisMonth);
  const lastPerDay = perDay(lastMonth);

  return {
    thisMonth,
    lastMonth,
    thisPerDay,
    lastPerDay,
    deltaPct:
      thisPerDay !== null && lastPerDay !== null && lastPerDay > 0
        ? Math.round(((thisPerDay - lastPerDay) / lastPerDay) * 100)
        : null,
  };
}

export interface WeekChange {
  weekStart: string;
  consumption: number;
  baseline: number;
  deviation: number;
  direction: "above" | "below";
}

/**
 * Weeks that moved 20% or more against the four before them.
 *
 * Only whole weeks (Monday to Monday, EAT) that the readings cover end to end
 * count. A half-finished week against full ones always looks like a collapse.
 */
export function weeklyChanges(
  segments: Segment[],
  now: Date = new Date(),
  baselineWeeks = 4,
  thresholdPct = 20
): { changes: WeekChange[]; completeWeeks: number } {
  if (segments.length === 0) return { changes: [], completeWeeks: 0 };

  const week = 7 * MS_PER_DAY;
  const first = ms(segments[0].from);
  const last = Math.min(ms(segments[segments.length - 1].to), now.getTime());

  let ws = eatWeekStart(new Date(first)).getTime();
  if (ws < first) ws += week;
  const weeks: { start: number; units: number }[] = [];
  for (; ws + week <= last; ws += week) {
    weeks.push({
      start: ws,
      units: consumptionBetween(segments, new Date(ws), new Date(ws + week)).units,
    });
  }

  const changes: WeekChange[] = [];
  for (let i = baselineWeeks; i < weeks.length; i++) {
    const prior = weeks.slice(i - baselineWeeks, i);
    const baseline = prior.reduce((sum, w) => sum + w.units, 0) / baselineWeeks;
    if (baseline <= 0) continue;
    const deviation = ((weeks[i].units - baseline) / baseline) * 100;
    if (Math.abs(deviation) < thresholdPct) continue;
    changes.push({
      weekStart: new Date(weeks[i].start).toISOString(),
      consumption: weeks[i].units,
      baseline: Math.round(baseline * 10) / 10,
      deviation: Math.round(deviation * 10) / 10,
      direction: deviation > 0 ? "above" : "below",
    });
  }

  return { changes: changes.reverse(), completeWeeks: weeks.length };
}

// --- Spikes ------------------------------------------------------------------

export interface Spike {
  from: string;
  to: string;
  hours: number;
  activeHours: number;
  consumption: number;
  /** kWh per active day */
  rate: number;
  baseline: number;
  /** rate / baseline */
  ratio: number;
  /** used beyond what the baseline would have used in the same powered hours */
  extraKwh: number;
  outageOverlap: boolean;
  purchaseInside: boolean;
  /** touches any hour between 00:00 and 04:00 EAT */
  overnight: boolean;
}

export interface SpikeOptions {
  minRatio?: number;
  minExtraKwh?: number;
  minActiveHours?: number;
  maxSegmentDays?: number;
}

/** The evidence for one segment against a baseline, spike or not. Null when
 *  the segment has no rate (under 6 powered minutes) or there is no baseline. */
export function spikeEvidence(seg: Segment, baseline: number): Spike | null {
  if (seg.rate === null || baseline <= 0) return null;

  const fromMs = ms(seg.from);
  const toMs = ms(seg.to);
  let overnight = false;
  for (let d = eatDayStartMs(fromMs); d < toMs; d += MS_PER_DAY) {
    if (fromMs < d + 4 * MS_PER_HOUR && toMs > d) {
      overnight = true;
      break;
    }
  }

  return {
    from: seg.from,
    to: seg.to,
    hours: Math.round(seg.hours * 10) / 10,
    activeHours: Math.round(seg.activeHours * 10) / 10,
    consumption: Math.round(seg.consumption * 100) / 100,
    rate: Math.round(seg.rate * 10) / 10,
    baseline: Math.round(baseline * 100) / 100,
    ratio: Math.round((seg.rate / baseline) * 10) / 10,
    extraKwh:
      Math.round((seg.consumption - (baseline * seg.activeHours) / 24) * 100) / 100,
    outageOverlap: seg.outageHours > 0,
    purchaseInside: seg.purchaseIds.length > 0,
    overnight,
  };
}

/**
 * Stretches that ran well above normal: the pins on the investigation board.
 *
 * All four must hold, judged on unrounded numbers: the rate is at least
 * `minRatio` times the baseline, it used `minExtraKwh` more than the baseline
 * would have, it had `minActiveHours` of power, and it is not a bridge across
 * a logging break. Evidence only. What caused it is the user's call.
 */
export function detectSpikes(
  segments: Segment[],
  baseline: number,
  opts: SpikeOptions = {}
): Spike[] {
  const {
    minRatio = 2,
    minExtraKwh = 0.5,
    minActiveHours = 1,
    maxSegmentDays = 2,
  } = opts;
  if (baseline <= 0) return [];

  return segments
    .filter(
      (s) =>
        s.rate !== null &&
        s.hours / 24 <= maxSegmentDays &&
        s.activeHours >= minActiveHours &&
        s.rate >= minRatio * baseline &&
        s.consumption - (baseline * s.activeHours) / 24 >= minExtraKwh
    )
    .map((s) => spikeEvidence(s, baseline) as Spike);
}

export interface PurchaseLifetime {
  purchaseId: number;
  units: number;
  amount_tzs: number;
  /** when the purchase landed on the meter */
  startedAt: string | null;
  /** when the meter actually hit zero on these units, null if it never did
   *  (topped up first, or still running) */
  exhaustedAt: string | null;
  /** true when exhaustedAt was interpolated rather than observed */
  exhaustedEstimated: boolean;
  /** the window the depletion must have happened inside */
  exhaustedAfter: string | null;
  exhaustedBefore: string | null;
  /** days from this purchase to the next top-up (or to running out), or days
   *  so far if it is the current one */
  days: number;
  running: boolean;
  /** the current one: the whole balance on the meter (leftover + top-up),
   *  because the meter merges them. 0 for finished purchases. */
  unitsRemaining: number;
  tzsPerUnit: number;
  vendor: string;
}

/**
 * How long each purchase lasted, top-up style.
 *
 * A LUKU meter does not queue tokens: enter one with 1 unit left and the
 * display jumps to 1 + 23.8. So a purchase lives from the moment it lands
 * until the next one lands (its leftover rolls into the new balance), or
 * until the meter genuinely hits zero, whichever comes first.
 */
export function purchaseLifetimes(
  segments: Segment[],
  purchases: PurchaseRow[],
  // ponytail: unused since the FIFO model went, kept so callers stay put.
  _openingBalance: number,
  now: Date = new Date()
): PurchaseLifetime[] {
  if (segments.length === 0) return [];

  const firstReadingMs = ms(segments[0].from);
  const last = segments[segments.length - 1];
  const lastReadingMs = ms(last.to);

  // Purchases made before the first reading are already inside the opening
  // balance; they have no separate life.
  const ordered = purchases
    .filter((p) => ms(p.created_at) >= firstReadingMs)
    .sort((a, b) => ms(a.created_at) - ms(b.created_at));

  // What the meter holds now: the last reading plus anything bought since.
  const balanceNow =
    last.endBalance +
    ordered
      .filter((p) => ms(p.created_at) > lastReadingMs)
      .reduce((sum, p) => sum + p.units, 0);

  return ordered.map((p, i) => {
    const startMs = ms(p.created_at);
    const nextMs = i + 1 < ordered.length ? ms(ordered[i + 1].created_at) : null;

    // Did the meter read empty before the next top-up?
    const idx = segments.findIndex(
      (s) =>
        ms(s.to) > startMs &&
        (nextMs === null || ms(s.to) <= nextMs) &&
        s.endBalance <= 0.05
    );
    const empty = idx !== -1 ? segments[idx] : null;
    let exhaustedMs: number | null = null;
    let estimated = false;
    if (empty) {
      exhaustedMs = ms(empty.to);
      // A zero reading only says it ran out somewhere in (from, to]. Project
      // the balance forward at the previous segment's rate to place it.
      const prevRate = segments[idx - 1]?.rate;
      if (empty.hours > 1 && prevRate) {
        const hoursLeft =
          ((empty.startBalance + empty.purchasedUnits) / prevRate) * 24;
        exhaustedMs = Math.min(
          exhaustedMs,
          ms(empty.from) + hoursLeft * MS_PER_HOUR
        );
        estimated = true;
      }
    }

    const endMs = exhaustedMs ?? nextMs;
    const running = endMs === null;
    const days = ((endMs ?? now.getTime()) - startMs) / MS_PER_DAY;

    return {
      purchaseId: p.id,
      units: p.units,
      amount_tzs: p.amount_tzs,
      startedAt: p.created_at,
      exhaustedAt: exhaustedMs !== null ? new Date(exhaustedMs).toISOString() : null,
      exhaustedEstimated: estimated,
      exhaustedAfter: empty ? empty.from : null,
      exhaustedBefore: empty ? empty.to : null,
      days: Math.max(0, Math.round(days * 10) / 10),
      running,
      unitsRemaining: running ? Math.round(Math.max(0, balanceNow) * 10) / 10 : 0,
      tzsPerUnit: p.units > 0 ? Math.round((p.amount_tzs / p.units) * 10) / 10 : 0,
      vendor: p.vendor || "",
    };
  });
}

// --- Outage end inference ----------------------------------------------------

export interface OutageEndEstimate {
  outageId: number;
  start_at: string;
  /** what was logged, null for an outage still marked ongoing */
  loggedEnd: string | null;
  /** when the meter says power most likely came back */
  estimatedEnd: string;
  /** units the meter used after the power returned */
  unitsAfter: number;
}

/**
 * When did the power really come back?
 *
 * You were out, so the end got logged when you came home, or never. But the
 * meter kept counting: whatever it used inside the segment beyond what the
 * pre-cut stretch explains was drawn after the power returned. At the usual
 * burn rate that many units take N hours, so the power came back N hours
 * before the closing reading. An estimate, so the UI offers it as a question.
 */
export function estimateOutageEnds(
  segments: Segment[],
  outages: OutageRow[],
  baselineRate: number,
  // Closer to the logged end than this is noise, not a correction.
  minShiftHours = 0.5
): OutageEndEstimate[] {
  if (baselineRate <= 0) return [];
  const perHour = baselineRate / 24;
  const preCutUnits = (s: Segment, startMs: number) =>
    Math.max(0, (startMs - ms(s.from)) / MS_PER_HOUR) * perHour;
  const out: OutageEndEstimate[] = [];

  for (const o of outages) {
    if (o.id === undefined) continue;
    const startMs = ms(o.start_at);
    const endMs = o.end_at ? ms(o.end_at) : null;

    // The segment the outage ended in: the one holding the logged end, or for
    // an ongoing outage the first one after the cut that shows real use.
    const seg = segments.find((s) => {
      if (ms(s.to) <= startMs) return false;
      if (endMs !== null) return ms(s.from) < endMs && endMs <= ms(s.to);
      return s.consumption - preCutUnits(s, startMs) > 0.05;
    });
    if (!seg) continue;

    const unitsAfter = seg.consumption - preCutUnits(seg, startMs);
    if (unitsAfter <= 0.05) continue; // the meter agrees with the logged end

    const segTo = ms(seg.to);
    const estimatedMs = Math.max(
      startMs,
      ms(seg.from),
      segTo - (unitsAfter / perHour) * MS_PER_HOUR
    );
    if (((endMs ?? segTo) - estimatedMs) / MS_PER_HOUR < minShiftHours) continue;

    out.push({
      outageId: o.id,
      start_at: o.start_at,
      loggedEnd: o.end_at,
      estimatedEnd: new Date(estimatedMs).toISOString(),
      unitsAfter: Math.round(unitsAfter * 100) / 100,
    });
  }

  return out;
}

// --- Detections --------------------------------------------------------------

export interface MissingPurchase {
  from: string;
  to: string;
  /** roughly how many units appeared out of nowhere */
  units: number;
}

/** A reading that jumped UP with no purchase recorded means a top-up was never
 *  logged (or a digit was fat-fingered). Either way it needs a human. */
export function detectMissingPurchases(segments: Segment[]): MissingPurchase[] {
  return segments
    .filter((s) => s.suspect)
    .map((s) => ({ from: s.from, to: s.to, units: s.unaccountedUnits }));
}

export interface SuspectedOutage {
  from: string;
  to: string;
  hours: number;
  /** what the rate was, against what it normally is */
  rate: number;
  baseline: number;
}

/**
 * Stretches where the meter barely moved. A power cut you were not home for
 * leaves exactly this trace: real elapsed time, almost no units gone.
 * Presented as a question, never as a fact, because "nobody was home" looks
 * identical from the meter's side.
 */
export function detectSuspectedOutages(
  segments: Segment[],
  baselineRate: number,
  minHours = 3,
  maxHours = 24
): SuspectedOutage[] {
  if (baselineRate <= 0) return [];

  return segments
    .filter(
      (s) =>
        s.outageHours === 0 &&
        s.activeHours >= minHours &&
        // A TANESCO cut lasts hours. A quiet stretch of days means you were
        // away, and that is already reported as a logging gap.
        s.activeHours <= maxHours &&
        s.rate !== null &&
        s.rate < baselineRate * 0.35
    )
    .map((s) => ({
      from: s.from,
      to: s.to,
      hours: Math.round(s.hours * 10) / 10,
      rate: Math.round((s.rate ?? 0) * 10) / 10,
      baseline: Math.round(baselineRate * 10) / 10,
    }));
}

export interface LoggingGap {
  from: string;
  to: string;
  days: number;
  /** consumption across the gap is still known: both ends are real readings */
  consumption: number;
  purchaseCount: number;
  /** purchases whose units were fully burned inside the gap */
  depletionsInside: number;
}

/** Stretches where no reading was taken for a while. The consumption total is
 *  still exact (both ends are readings) but the shape inside is guesswork, so
 *  the UI should say so rather than draw a confident line. */
export function detectLoggingGaps(
  segments: Segment[],
  lifetimes: PurchaseLifetime[],
  minDays = 3
): LoggingGap[] {
  return segments
    .filter((s) => s.hours / 24 >= minDays)
    .map((s) => {
      const fromMs = ms(s.from);
      const toMs = ms(s.to);
      const depletionsInside = lifetimes.filter((l) => {
        if (!l.exhaustedAt) return false;
        const t = ms(l.exhaustedAt);
        return t > fromMs && t <= toMs;
      }).length;

      return {
        from: s.from,
        to: s.to,
        days: Math.round((s.hours / 24) * 10) / 10,
        consumption: Math.round(s.consumption * 10) / 10,
        purchaseCount: s.purchaseIds.length,
        depletionsInside,
      };
    });
}

export interface ExpectedReading {
  /** where the meter should read right now on the current burn rate */
  expected: number | null;
  /** the highest a reading can legitimately be without a purchase */
  ceiling: number;
  /** below this, consumption is implausibly fast */
  plausibleLow: number;
  /** above this, the meter went up more than any purchase explains */
  plausibleHigh: number;
  lastReading: number;
  lastAt: string;
  hoursSince: number;
  /** units bought since the last reading that legitimately raise the ceiling */
  pendingUnits: number;
}

/**
 * The band a new reading should fall inside. Feeds the mistype guard: after a
 * 42.1 unit purchase you cannot suddenly read 120, and the app knows that
 * before you have to go and delete the entry.
 */
export function expectedReadingRange(
  readings: ReadingRow[],
  purchases: PurchaseRow[],
  burnRate: number | null,
  at: Date = new Date()
): ExpectedReading | null {
  const sorted = [...readings].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const last = sorted[sorted.length - 1];
  if (!last) return null;

  const lastMs = ms(last.created_at);
  const atMs = at.getTime();
  if (atMs <= lastMs) return null;

  const pendingUnits = purchases
    .filter((p) => ms(p.created_at) > lastMs && ms(p.created_at) <= atMs)
    .reduce((sum, p) => sum + p.units, 0);

  const ceiling = last.reading + pendingUnits;
  const days = (atMs - lastMs) / MS_PER_DAY;
  const expected = burnRate !== null ? Math.max(0, ceiling - burnRate * days) : null;

  // A generous band: three times the normal burn is still believable (a hot
  // weekend, guests, a water pump running). Beyond that, ask.
  const drift = burnRate !== null ? burnRate * days * 3 : ceiling;

  return {
    expected: expected !== null ? Math.round(expected * 10) / 10 : null,
    ceiling: Math.round(ceiling * 10) / 10,
    plausibleLow: Math.max(0, Math.round((ceiling - drift) * 10) / 10),
    plausibleHigh: Math.round(ceiling * 10) / 10,
    lastReading: last.reading,
    lastAt: last.created_at,
    hoursSince: Math.round(((atMs - lastMs) / MS_PER_HOUR) * 10) / 10,
    pendingUnits: Math.round(pendingUnits * 10) / 10,
  };
}
