/**
 * The investigation board: detected spikes merged with what the user has
 * written about them. Pure, with type-only imports, so `node --test` runs it
 * the same way it runs the ledger.
 */
import type { Segment, Spike } from "./ledger.ts";

/** Appliances the user named for this house, plus generic outcomes. Never
 *  extend this with guesses: unknown loads are the user's to name. */
export const STARTER_CAUSES = [
  "fridge",
  "multicooker",
  "pc",
  "guests",
  "unknown",
  "falseAlarm",
] as const;

export const MAX_NOTES = 2000;
export const MAX_TAG = 40;
export const MAX_CAUSES = 12;

export type Status = "open" | "solved";

export interface InvestigationRow {
  id: number;
  seg_from: string;
  seg_to: string;
  status: Status;
  causes: string[];
  notes: string;
  /** the evidence as it was when first saved, null if none was sent */
  snapshot: Spike | null;
  created_at: string;
  updated_at: string;
}

export interface Pin {
  /** 1 = oldest, so numbers stay put as new pins arrive */
  number: number;
  from: string;
  to: string;
  status: "new" | Status;
  /** live numbers when the segment still exists, else the snapshot */
  evidence: Spike | null;
  /** saved, segment still exists, but it no longer passes the spike rule */
  belowThreshold: boolean;
  /** saved, but a bounding reading was edited or deleted */
  readingsChanged: boolean;
  row: InvestigationRow | null;
}

export interface InvestigationInput {
  seg_from: string;
  seg_to: string;
  status: Status;
  causes: string[];
  notes: string;
  snapshot: Spike | null;
}

const keyOf = (from: string, to: string) => `${from}|${to}`;

/** Saved rows first (they never vanish), then untouched spikes, oldest first. */
export function mergeBoard(
  spikes: Spike[],
  segments: Segment[],
  rows: InvestigationRow[],
  evidenceFor: (seg: Segment) => Spike | null
): Pin[] {
  const spikeByKey = new Map(spikes.map((s): [string, Spike] => [keyOf(s.from, s.to), s]));
  const segByKey = new Map(segments.map((s): [string, Segment] => [keyOf(s.from, s.to), s]));
  const seen = new Set<string>();
  const pins: Omit<Pin, "number">[] = [];

  for (const row of rows) {
    const key = keyOf(row.seg_from, row.seg_to);
    seen.add(key);
    const spike = spikeByKey.get(key);
    const seg = segByKey.get(key);
    const live = seg ? evidenceFor(seg) : null;
    pins.push({
      from: row.seg_from,
      to: row.seg_to,
      status: row.status,
      evidence: spike ?? live ?? row.snapshot,
      // Only "below" when there is a live threshold to be below.
      belowThreshold: !spike && live !== null,
      readingsChanged: seg === undefined,
      row,
    });
  }

  for (const s of spikes) {
    if (seen.has(keyOf(s.from, s.to))) continue;
    pins.push({
      from: s.from,
      to: s.to,
      status: "new",
      evidence: s,
      belowThreshold: false,
      readingsChanged: false,
      row: null,
    });
  }

  return pins
    .sort((a, b) => Date.parse(a.from) - Date.parse(b.from))
    .map((p, i) => ({ ...p, number: i + 1 }));
}

/** Trim, collapse spaces, drop case-insensitive duplicates, and fold anything
 *  matching a starter key onto it. Null when a tag is empty or too long. */
export function normalizeCauses(raw: string[]): string[] | null {
  const starters = new Map(
    STARTER_CAUSES.map((c): [string, string] => [c.toLowerCase(), c])
  );
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    const tag = c.trim().replace(/\s+/g, " ");
    if (tag.length === 0 || tag.length > MAX_TAG) return null;
    const lower = tag.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(starters.get(lower) ?? tag);
  }
  return out;
}

const isIso = (v: unknown): v is string =>
  typeof v === "string" && !Number.isNaN(Date.parse(v));

/** Everything PUT accepts, checked before anything is written. */
export function parseInvestigationInput(
  body: unknown
): { ok: true; value: InvestigationInput } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail("body must be an object");
  }
  const b = body as Record<string, unknown>;

  if (!isIso(b.seg_from) || !isIso(b.seg_to)) {
    return fail("seg_from and seg_to must be ISO timestamps");
  }
  if (b.status !== "open" && b.status !== "solved") {
    return fail("status must be open or solved");
  }
  if (typeof b.notes !== "string" || b.notes.length > MAX_NOTES) {
    return fail(`notes must be text of at most ${MAX_NOTES} characters`);
  }
  if (!Array.isArray(b.causes) || !b.causes.every((c) => typeof c === "string")) {
    return fail("causes must be a list of text tags");
  }
  const causes = normalizeCauses(b.causes as string[]);
  if (causes === null) return fail(`each cause must be 1 to ${MAX_TAG} characters`);
  if (causes.length > MAX_CAUSES) return fail(`at most ${MAX_CAUSES} causes`);
  if (b.status === "solved" && causes.length === 0) {
    return fail("a solved pin needs at least one cause");
  }

  const snapshot =
    typeof b.snapshot === "object" && b.snapshot !== null && !Array.isArray(b.snapshot)
      ? (b.snapshot as Spike)
      : null;

  return {
    ok: true,
    value: {
      seg_from: b.seg_from,
      seg_to: b.seg_to,
      status: b.status,
      causes,
      notes: b.notes,
      snapshot,
    },
  };
}

function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== "string") return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/** A database row, read defensively: a bad JSON column must not take the
 *  whole board down. */
export function parseRow(raw: Record<string, unknown>): InvestigationRow {
  const causes = parseJson<unknown>(raw.causes, []);
  const snapshot = parseJson<unknown>(raw.snapshot, null);
  return {
    id: Number(raw.id),
    seg_from: String(raw.seg_from),
    seg_to: String(raw.seg_to),
    status: raw.status === "solved" ? "solved" : "open",
    causes: Array.isArray(causes) ? causes.filter((c) => typeof c === "string") : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
    // `{}` is what a save without evidence stores: no numbers to show.
    snapshot:
      snapshot && typeof snapshot === "object" && "from" in snapshot
        ? (snapshot as Spike)
        : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
  };
}

/** Tags the user invented, offered as chips on every pin. */
export function customTags(rows: InvestigationRow[]): string[] {
  const starters = new Set<string>(STARTER_CAUSES);
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const c of row.causes) {
      if (starters.has(c)) continue;
      if (!seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
