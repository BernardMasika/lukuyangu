/**
 * The ledger: one chronological view of readings + purchases + outages.
 *
 * A LUKU meter counts DOWN, so a reading alone cannot tell you how much you
 * used once a top-up lands in the middle. Every consumption question in this
 * app is really the same question over the same merged timeline, so it is
 * answered once, here, and read by /api/stats, the dashboard and analytics.
 *
 * Units are accounted FIFO: the units already on the meter burn before the ones
 * you just bought. That is what makes "this purchase lasted X days" honest when
 * you top up before the old units are finished.
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
): { units: number; estimated: boolean; hasData: boolean } {
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  let units = 0;
  let estimated = false;
  let hasData = false;

  for (const seg of segments) {
    const segStart = ms(seg.from);
    const segEnd = ms(seg.to);
    if (segEnd <= startMs || segStart >= endMs) continue;

    hasData = true;
    const overlapStart = Math.max(segStart, startMs);
    const overlapEnd = Math.min(segEnd, endMs);
    const full = segEnd - segStart;

    if (overlapStart <= segStart && overlapEnd >= segEnd) {
      units += seg.consumption;
    } else if (full > 0) {
      units += seg.consumption * ((overlapEnd - overlapStart) / full);
      estimated = true;
    }
  }

  return { units: Math.round(units * 10) / 10, estimated, hasData };
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

// --- Cumulative consumption curve -------------------------------------------

interface CumPoint {
  at: number;
  cum: number;
}

function cumulativeCurve(segments: Segment[]): CumPoint[] {
  if (segments.length === 0) return [];
  const points: CumPoint[] = [{ at: ms(segments[0].from), cum: 0 }];
  let running = 0;
  for (const seg of segments) {
    running += seg.consumption;
    points.push({ at: ms(seg.to), cum: running });
  }
  return points;
}

/** When did cumulative consumption reach `target` kWh? Linearly interpolated
 *  between the two readings that bracket it. Null if it has not got there yet. */
function timeAtCum(
  points: CumPoint[],
  target: number
): { at: string; estimated: boolean; after: string; before: string } | null {
  if (points.length === 0) return null;

  if (target <= points[0].cum) {
    const iso = new Date(points[0].at).toISOString();
    return { at: iso, estimated: false, after: iso, before: iso };
  }

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (b.cum < target) continue;

    const span = b.cum - a.cum;
    const at = span > 0 ? a.at + ((target - a.cum) / span) * (b.at - a.at) : b.at;
    return {
      at: new Date(at).toISOString(),
      // Only exact when it lands on a reading we actually took.
      estimated: Math.abs(at - b.at) > MS_PER_HOUR,
      after: new Date(a.at).toISOString(),
      before: new Date(b.at).toISOString(),
    };
  }

  return null;
}

export interface PurchaseLifetime {
  purchaseId: number;
  units: number;
  amount_tzs: number;
  /** false while older units are still being burned ahead of these ones */
  started: boolean;
  /** when these particular units actually started being drawn (FIFO), null
   *  while the purchase is still queued behind older units */
  startedAt: string | null;
  /** when they ran out, or null if still running */
  exhaustedAt: string | null;
  /** true when exhaustedAt was interpolated rather than observed */
  exhaustedEstimated: boolean;
  /** the window the depletion must have happened inside */
  exhaustedAfter: string | null;
  exhaustedBefore: string | null;
  /** days these units covered, or days so far if still running */
  days: number;
  running: boolean;
  /** how long the purchase sat unused before its units were reached */
  idleDaysBeforeStart: number;
  /** units of this particular purchase not yet burned */
  unitsRemaining: number;
  tzsPerUnit: number;
  vendor: string;
}

/**
 * How long each purchase actually lasted, FIFO.
 *
 * Top up with 3 units still on the meter and those 3 burn first, so the new
 * purchase does not start its life at the moment you bought it. That gap is
 * `idleDaysBeforeStart`, and it is why the old "days since purchase" number
 * read wrong.
 */
export function purchaseLifetimes(
  segments: Segment[],
  purchases: PurchaseRow[],
  openingBalance: number,
  now: Date = new Date()
): PurchaseLifetime[] {
  const points = cumulativeCurve(segments);
  if (points.length === 0) return [];

  const ordered = [...purchases].sort(
    (a, b) => ms(a.created_at) - ms(b.created_at)
  );
  const firstReadingMs = points[0].at;
  const consumedSoFar = points[points.length - 1].cum;

  // Lot boundaries on the cumulative curve: the opening balance burns first,
  // then each purchase in the order it landed.
  let lowerBound = openingBalance;
  const out: PurchaseLifetime[] = [];

  for (const p of ordered) {
    // Purchases made before the first reading are already inside the opening
    // balance; they have no separate lot.
    if (ms(p.created_at) < firstReadingMs) continue;

    const upperBound = lowerBound + p.units;
    const startPoint = timeAtCum(points, lowerBound);
    const endPoint = timeAtCum(points, upperBound);
    const purchaseMs = ms(p.created_at);

    // Queued behind older units: bought, but not a single kWh of it drawn yet.
    // This is the case that used to print a misleading "lasting N days".
    const started = startPoint !== null;
    const startedMs = started
      ? // You cannot burn units you have not bought yet.
        Math.max(purchaseMs, ms(startPoint.at))
      : null;
    const endedMs = endPoint ? ms(endPoint.at) : null;
    const days =
      startedMs !== null
        ? ((endedMs ?? now.getTime()) - startedMs) / MS_PER_DAY
        : 0;

    out.push({
      purchaseId: p.id,
      units: p.units,
      amount_tzs: p.amount_tzs,
      started,
      startedAt: startedMs !== null ? new Date(startedMs).toISOString() : null,
      exhaustedAt: endedMs !== null ? new Date(endedMs).toISOString() : null,
      exhaustedEstimated: endPoint?.estimated ?? false,
      exhaustedAfter: endPoint?.after ?? null,
      exhaustedBefore: endPoint?.before ?? null,
      days: Math.max(0, Math.round(days * 10) / 10),
      running: endedMs === null,
      idleDaysBeforeStart:
        startedMs !== null
          ? Math.max(
              0,
              Math.round(((startedMs - purchaseMs) / MS_PER_DAY) * 10) / 10
            )
          : Math.max(
              0,
              Math.round(((now.getTime() - purchaseMs) / MS_PER_DAY) * 10) / 10
            ),
      unitsRemaining:
        Math.round(
          Math.min(p.units, Math.max(0, upperBound - consumedSoFar)) * 10
        ) / 10,
      tzsPerUnit: p.units > 0 ? Math.round((p.amount_tzs / p.units) * 10) / 10 : 0,
      vendor: p.vendor || "",
    });

    lowerBound = upperBound;
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
