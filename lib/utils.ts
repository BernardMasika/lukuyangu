export const TZ = "Africa/Dar_es_Salaam";

export function formatDateEAT(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatDateTimeEAT(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function nowEAT(): string {
  return new Date().toISOString();
}

/** Convert ISO string to datetime-local input value in EAT (YYYY-MM-DDTHH:mm) */
export function isoToDatetimeLocal(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Convert datetime-local value (EAT) to ISO 8601 UTC string */
export function datetimeLocalToISO(local: string): string {
  // datetime-local gives us "YYYY-MM-DDTHH:mm" in EAT (UTC+3)
  return new Date(local + ":00+03:00").toISOString();
}

/** Calculate consumption between two consecutive readings.
 *  LUKU meters count DOWN. If current < previous => consumption.
 *  If current > previous => top-up happened. */
export function calcConsumption(
  previous: number,
  current: number,
  purchaseUnits?: number
): { consumption: number; topUpDetected: boolean } {
  if (current < previous) {
    return { consumption: previous - current, topUpDetected: false };
  }
  if (current > previous) {
    if (purchaseUnits !== undefined) {
      const consumption = previous + purchaseUnits - current;
      return { consumption: Math.max(0, consumption), topUpDetected: true };
    }
    return { consumption: 0, topUpDetected: true };
  }
  return { consumption: 0, topUpDetected: false };
}

/** Compute daily burn rate from readings over last 7 days.
 *  Returns null if insufficient data (<3 readings or <3 days). */
export function calcBurnRate(
  readings: { reading: number; created_at: string }[]
): number | null {
  if (readings.length < 3) return null;

  const sorted = [...readings].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const firstDate = new Date(sorted[0].created_at);
  const lastDate = new Date(sorted[sorted.length - 1].created_at);
  const daySpan =
    (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daySpan < 3) return null;

  let totalConsumption = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1].reading;
    const curr = sorted[i].reading;
    if (curr < prev) {
      totalConsumption += prev - curr;
    }
    // skip top-ups for burn rate calc (would need purchase matching)
  }

  return daySpan > 0 ? totalConsumption / daySpan : null;
}

/** Predict days remaining given current balance and burn rate */
export function calcDaysRemaining(
  currentReading: number,
  burnRate: number
): number | null {
  if (burnRate <= 0 || currentReading <= 0) return null;
  return currentReading / burnRate;
}

/** Get week number (ISO) for a date */
export function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** Get start of week (Monday) for a date */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Group readings by week and compute weekly consumption */
export function weeklyConsumption(
  readings: { reading: number; created_at: string }[]
): Map<string, { consumption: number; readingCount: number; weekStart: Date }> {
  const sorted = [...readings].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const weeks = new Map<
    string,
    { readings: { reading: number; created_at: string }[]; weekStart: Date }
  >();

  for (const r of sorted) {
    const date = new Date(r.created_at);
    const key = getWeekKey(date);
    if (!weeks.has(key)) {
      weeks.set(key, { readings: [], weekStart: getWeekStart(date) });
    }
    weeks.get(key)!.readings.push(r);
  }

  const result = new Map<
    string,
    { consumption: number; readingCount: number; weekStart: Date }
  >();

  for (const [key, week] of weeks) {
    if (week.readings.length < 2) continue;
    let consumption = 0;
    for (let i = 1; i < week.readings.length; i++) {
      const prev = week.readings[i - 1].reading;
      const curr = week.readings[i].reading;
      if (curr < prev) consumption += prev - curr;
    }
    result.set(key, {
      consumption,
      readingCount: week.readings.length,
      weekStart: week.weekStart,
    });
  }

  return result;
}

/** Detect weeks with consumption deviating >=20% from 4-week rolling baseline */
export function detectChanges(
  readings: { reading: number; created_at: string }[]
): {
  weekStart: Date;
  consumption: number;
  baseline: number;
  deviation: number;
  direction: "above" | "below";
}[] {
  const weeks = weeklyConsumption(readings);
  const weekKeys = [...weeks.keys()].sort();

  if (weekKeys.length < 5) return [];

  const flagged: {
    weekStart: Date;
    consumption: number;
    baseline: number;
    deviation: number;
    direction: "above" | "below";
  }[] = [];

  for (let i = 4; i < weekKeys.length; i++) {
    const baselineWeeks = weekKeys.slice(i - 4, i);
    const baselineSum = baselineWeeks.reduce(
      (sum, k) => sum + (weeks.get(k)?.consumption ?? 0),
      0
    );
    const baseline = baselineSum / baselineWeeks.length;

    if (baseline === 0) continue;

    const current = weeks.get(weekKeys[i])!;
    const deviation =
      ((current.consumption - baseline) / baseline) * 100;

    if (Math.abs(deviation) >= 20) {
      flagged.push({
        weekStart: current.weekStart,
        consumption: current.consumption,
        baseline: Math.round(baseline * 10) / 10,
        deviation: Math.round(deviation * 10) / 10,
        direction: deviation > 0 ? "above" : "below",
      });
    }
  }

  return flagged.reverse(); // most recent first
}
