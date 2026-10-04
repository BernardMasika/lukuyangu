export const TZ = "Africa/Dar_es_Salaam";

export type TimePeriod = "alfajiri" | "asubuhi" | "mchana" | "jioni" | "usiku";

/** Extract the hour (0-23) in EAT from an ISO string */
export function getHourEAT(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
}

/** Map an ISO timestamp to a Swahili time-of-day period (EAT) */
export function getTimePeriod(iso: string): TimePeriod {
  return periodOfHour(getHourEAT(iso));
}

/** Swahili time-of-day period for an EAT hour (0-23) */
export function periodOfHour(h: number): TimePeriod {
  if (h >= 4 && h <= 5) return "alfajiri";
  if (h >= 6 && h <= 11) return "asubuhi";
  if (h >= 12 && h <= 15) return "mchana";
  if (h >= 16 && h <= 18) return "jioni";
  return "usiku"; // 19-3
}

/** Roll a 24-slot hour array (from the ledger's `hourlyProfile`) up into periods. */
export function byPeriod(perHour: number[]): Record<TimePeriod, number> {
  const out: Record<TimePeriod, number> = {
    alfajiri: 0, asubuhi: 0, mchana: 0, jioni: 0, usiku: 0,
  };
  perHour.forEach((v, h) => (out[periodOfHour(h)] += v));
  return out;
}

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

/** Midnight in Dar es Salaam for the EAT day that `at` falls in.
 *  SQL `date('now')` is UTC, which flips the day three hours early here, so
 *  every "today" window is built in JS from this instead. */
export function startOfDayEAT(at: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+03:00`);
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

// Moved to lib/ledger.ts so the ledger has no imports and can be unit tested
// with `node --test` directly. Re-exported here for existing callers.
export { calcOutageDurationDays } from "./ledger";

/** Calculate consumption between two consecutive readings.
 *  LUKU meters count DOWN. If current < previous => consumption.
 *  If current > previous => top-up happened. */
