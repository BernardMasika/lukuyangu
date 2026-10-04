# Investigation Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin abrupt usage spikes on an `/investigate` board where the user writes
notes, tags causes and marks each pin solved.

**Architecture:**
- Spike detection is a pure ledger function (`detectSpikes`) over ledger
  segments against the current burn rate.
- Board merging and input validation live in a new pure module,
  `lib/investigation.ts`, which has type-only imports.
- A new Turso table `investigations` stores the user's notes. Rows are created
  lazily on first save and keyed by the segment's two reading timestamps.
- `/api/investigations` serves the merged board. `/api/stats` exposes
  `newSpikes` for a Dashboard card.

**Tech Stack:** Next.js 16.2.1 App Router, React 19, TypeScript, Tailwind v4,
Turso/libSQL (`@libsql/client`), `node --test` with type stripping (Node 24).

**Spec:** `docs/superpowers/specs/2026-10-04-investigation-board-design.md`

## Global Constraints

- **Next.js 16.2.1 is not the Next.js you know.** Read the relevant guide in
  `node_modules/next/dist/docs/01-app/` before writing any new Next.js pattern.
  Route handler params are `Promise<{ id: string }>` and must be awaited.
- Every API route exports `dynamic = "force-dynamic"`.
- `lib/ledger.ts` has **no imports**. `lib/investigation.ts` may only use
  `import type`, which Node's type stripping erases, so `npm test` can run both
  directly.
- All user-facing strings go in `lib/i18n.ts` as `{ sw, en }` pairs, with
  `{varName}` interpolation via `tr()`. **Use commas, never em dashes.**
- All timestamps are ISO 8601 strings. EAT is fixed UTC+3 (Tanzania has no DST).
- The app never guesses causes or appliances. The starter causes are `fridge`,
  `multicooker`, `pc` (appliances the user named), plus `guests`, `unknown`,
  `falseAlarm`.
- Spike defaults: `minRatio = 2`, `minExtraKwh = 0.5`, `minActiveHours = 1`,
  `maxSegmentDays = 2`. The baseline is `currentBurnRate(segments).rate`.
- No new dependencies. Mobile-first, dark mode default, TANESCO blue `#003399`,
  no horizontal scroll at 375px.
- **Commit messages carry no AI attribution of any kind** (no Co-Authored-By,
  no "Generated with").
- Gates for every task:
  - `npm test` passes.
  - `npx tsc --noEmit -p .` is clean.
  - `npm run lint` shows no new problems. The baseline is 4 problems, all in
    `app/settings/page.tsx`, `components/ConsumptionChart.tsx`,
    `components/InstallBanner.tsx` and `components/Providers.tsx`.

## Review Focus

1. **Double-tapped Save, or two tabs saving the same pin.** This must still
   leave exactly one row. Handled by the UNIQUE `(seg_from, seg_to)` upsert and
   checked in Task 3 step 6.
2. **Messy custom tags** (`" PC "`, `"pc"`, `"Guests"` vs `"guests"`) must not
   create duplicate chips. A custom tag matching a starter key must become that
   key. Covered by the `normalizeCauses` tests in Task 2.
3. **Hostile or oversized input to PUT** (non-string notes, 10k-char notes, a
   non-array `causes`, a bad timestamp, invalid JSON) must return a 400 with a
   message and never write. Covered by the `parseInvestigationInput` tests in
   Task 2 and a curl check in Task 3.
4. **No baseline yet** (fewer than 3 readings over 3 days) while saved rows
   exist. The board must still list the rows using their snapshots and must
   not crash. Covered by a `mergeBoard` test in Task 2 and the empty-state
   branch in Task 4.
5. **A saved pin whose snapshot is empty** (`{}`, from a client that sent none)
   **and whose readings changed.** The card must still render, showing
   "numbers unavailable" and the notes. Covered by the `parseRow` and
   `mergeBoard` tests in Task 2 and the `evidence === null` branch in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/ledger.ts` (modify) | `Spike`, `SpikeOptions`, `spikeEvidence()`, `detectSpikes()` |
| `lib/ledger.test.mts` (modify) | `detectSpikes` tests |
| `lib/investigation.ts` (create) | Row/Pin types, `mergeBoard()`, `parseInvestigationInput()`, `normalizeCauses()`, `parseRow()`, `customTags()`, `STARTER_CAUSES` |
| `lib/investigation.test.mts` (create) | Tests for the above |
| `lib/db.ts` (modify) | `investigations` table in `initDb()` |
| `app/api/investigations/route.ts` (create) | `GET` board, `PUT` upsert |
| `app/api/investigations/[id]/route.ts` (create) | `DELETE` |
| `app/api/stats/route.ts` (modify) | `newSpikes` |
| `lib/i18n.ts` (modify) | board, pin, cause and detection strings |
| `components/PinCard.tsx` (create) | one pin: evidence, notes, causes, solve/reopen/clear |
| `app/investigate/page.tsx` (create) | fetch, timeline strip, open/solved lists, empty state |
| `components/Providers.tsx` (modify) | `Stats.newSpikes` type |
| `components/Detections.tsx` (modify) | "New usage spike pinned" card |
| `app/analytics/page.tsx` (modify) | "Investigation board →" link |
| `CLAUDE.md` (modify) | document table, routes, page |

---

### Task 1: Spike detection in the ledger

**Files:**
- Modify: `lib/ledger.ts` (append a `// --- Spikes` section after `weeklyChanges`, before `export interface PurchaseLifetime`)
- Test: `lib/ledger.test.mts`

**Interfaces:**
- Consumes: `Segment` (fields `from, to, hours, activeHours, outageHours, consumption, rate, purchaseIds`), plus the private `eatDayStartMs(t)`, `ms(iso)`, `MS_PER_HOUR` and `MS_PER_DAY` already in `lib/ledger.ts`.
- Produces:
  - `interface Spike { from: string; to: string; hours: number; activeHours: number; consumption: number; rate: number; baseline: number; ratio: number; extraKwh: number; outageOverlap: boolean; purchaseInside: boolean; overnight: boolean }`
  - `interface SpikeOptions { minRatio?: number; minExtraKwh?: number; minActiveHours?: number; maxSegmentDays?: number }`
  - `spikeEvidence(seg: Segment, baseline: number): Spike | null`
  - `detectSpikes(segments: Segment[], baseline: number, opts?: SpikeOptions): Spike[]`

- [ ] **Step 1: Write the failing tests**

Add `detectSpikes` and `spikeEvidence` to the import list at the top of
`lib/ledger.test.mts`:

```ts
  currentBurnRate,
  detectSpikes,
  spikeEvidence,
  eatWeekStart,
```

Append to `lib/ledger.test.mts`:

```ts
// Baseline 2.4 kWh/day = 0.1 kWh per hour keeps the arithmetic readable.
// EAT is UTC+3, so D(1, 17) is 20:00 EAT on the 1st.
const one = (kwh: number, from: string, to: string, outages = [] as { start_at: string; end_at: string }[]) =>
  buildSegments([r(1, 10, from), r(2, 10 - kwh, to)], [], outages);

test("a stretch well above normal is a spike, with its evidence", () => {
  const [spike] = detectSpikes(one(1, D(1, 17), D(1, 19)), 2.4); // 1 kWh in 2h
  assert.equal(spike.rate, 12);
  assert.equal(spike.ratio, 5);
  assert.equal(spike.extraKwh, 0.8); // 1 - 0.1 * 2
  assert.equal(spike.outageOverlap, false);
  assert.equal(spike.purchaseInside, false);
  assert.equal(spike.overnight, false); // 20:00-22:00 EAT
});

test("each threshold rejects on its own", () => {
  // 1.99x over 6h: 1.194 kWh is 4.776/day and +0.594 kWh, so only the ratio fails.
  assert.deepEqual(detectSpikes(one(1.194, D(1, 17), D(1, 23)), 2.4), []);
  // +0.49 kWh: 0.69 over 2h is 3.45x, but only 0.49 above normal.
  assert.deepEqual(detectSpikes(one(0.69, D(1, 17), D(1, 19)), 2.4), []);
  // 59 minutes: plenty above normal, too short to call.
  assert.deepEqual(detectSpikes(one(1, D(1, 17), D(1, 17, 59)), 2.4), []);
  // Over 2 days: a bridge across a logging break, not a rate.
  assert.deepEqual(detectSpikes(one(20, D(1, 17), D(3, 18)), 2.4), []);
  // No baseline: nothing to compare against.
  assert.deepEqual(detectSpikes(one(1, D(1, 17), D(1, 19)), 0), []);
});

test("a stretch mostly lost to an outage is judged on its powered hours", () => {
  // 10h stretch, 9h outage: 0.9 kWh in 1 powered hour is 21.6/day.
  const segs = one(0.9, D(1, 10), D(1, 20), [{ start_at: D(1, 11), end_at: D(1, 20) }]);
  const [spike] = detectSpikes(segs, 2.4);
  assert.equal(spike.activeHours, 1);
  assert.equal(spike.outageOverlap, true);
  assert.equal(spike.extraKwh, 0.8);
});

test("overnight and purchase flags come from the segment, not a guess", () => {
  // 23:00 to 01:00 EAT crosses midnight.
  const [night] = detectSpikes(one(1, D(1, 20), D(1, 22)), 2.4);
  assert.equal(night.overnight, true);

  const withTopUp = buildSegments(
    [r(1, 10, D(1, 17)), r(2, 19, D(1, 19))],
    [p(1, 10, D(1, 18))]
  ); // 10 + 10 - 19 = 1 kWh used
  assert.equal(detectSpikes(withTopUp, 2.4)[0].purchaseInside, true);

  // spikeEvidence works on any segment, spike or not, for "below threshold now".
  const calm = spikeEvidence(one(0.2, D(1, 17), D(1, 19))[0], 2.4);
  assert.equal(calm?.ratio, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `SyntaxError: The requested module './ledger.ts' does not provide an export named 'detectSpikes'`.

- [ ] **Step 3: Implement**

In `lib/ledger.ts`, insert directly before `export interface PurchaseLifetime {`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 22 tests (18 existing + 4 new), 0 fail.

- [ ] **Step 5: Check against live data**

Run:
```bash
cat > scripts/_spikes.mts <<'EOF'
import { createClient } from "@libsql/client";
import { buildSegments, currentBurnRate, detectSpikes } from "../lib/ledger.ts";
const db = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
const q = async (s: string) => (await db.execute(s)).rows as any[];
const [r, p, o] = await Promise.all([q("SELECT * FROM readings ORDER BY created_at"), q("SELECT * FROM purchases"), q("SELECT start_at,end_at FROM outages")]);
const seg = buildSegments(r, p, o);
console.log(detectSpikes(seg, currentBurnRate(seg)!.rate));
EOF
node --env-file=.env.local scripts/_spikes.mts 2>/dev/null; rm scripts/_spikes.mts
```
Expected: one spike with `from` on 2026-10-03T21:39 UTC (04 Oct 00:39 EAT), `rate` about 7.0 and `ratio` about 2.3, per the spec's live check. If readings have been added since 2026-10-04, more spikes may appear. That's fine as long as each one passes all four thresholds.

- [ ] **Step 6: Commit**

```bash
git add lib/ledger.ts lib/ledger.test.mts
git commit -m "Detect usage spikes against the burn rate"
```

---

### Task 2: Board merging and input validation

**Files:**
- Create: `lib/investigation.ts`
- Test: `lib/investigation.test.mts` (picked up by `npm test`, whose glob is `lib/*.test.mts`)

**Interfaces:**
- Consumes: the `Segment` and `Spike` types from Task 1 (type-only import).
- Produces:
  - `const STARTER_CAUSES: readonly ["fridge", "multicooker", "pc", "guests", "unknown", "falseAlarm"]`
  - `type Status = "open" | "solved"`
  - `interface InvestigationRow { id: number; seg_from: string; seg_to: string; status: Status; causes: string[]; notes: string; snapshot: Spike | null; created_at: string; updated_at: string }`
  - `interface Pin { number: number; from: string; to: string; status: "new" | Status; evidence: Spike | null; belowThreshold: boolean; readingsChanged: boolean; row: InvestigationRow | null }`
  - `interface InvestigationInput { seg_from: string; seg_to: string; status: Status; causes: string[]; notes: string; snapshot: Spike | null }`
  - `mergeBoard(spikes: Spike[], segments: Segment[], rows: InvestigationRow[], evidenceFor: (seg: Segment) => Spike | null): Pin[]`
  - `parseInvestigationInput(body: unknown): { ok: true; value: InvestigationInput } | { ok: false; error: string }`
  - `normalizeCauses(raw: string[]): string[] | null`
  - `parseRow(raw: Record<string, unknown>): InvestigationRow`
  - `customTags(rows: InvestigationRow[]): string[]`
  - `const MAX_NOTES = 2000`, `const MAX_TAG = 40`, `const MAX_CAUSES = 12`

- [ ] **Step 1: Write the failing tests**

Create `lib/investigation.test.mts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegments, spikeEvidence, type Spike } from "./ledger.ts";
import {
  mergeBoard,
  parseInvestigationInput,
  normalizeCauses,
  parseRow,
  customTags,
  MAX_NOTES,
  type InvestigationRow,
} from "./investigation.ts";

const D = (day: number, hour = 0) =>
  new Date(Date.UTC(2026, 9, day, hour)).toISOString();

// Three readings, two segments: 1-2 Oct (a spike) and 2-3 Oct (calm).
const segments = buildSegments(
  [
    { id: 1, reading: 10, created_at: D(1, 17) },
    { id: 2, reading: 9, created_at: D(1, 19) },
    { id: 3, reading: 8.8, created_at: D(1, 21) },
  ],
  []
);
const evidenceFor = (s: (typeof segments)[number]) => spikeEvidence(s, 2.4);
const spike = evidenceFor(segments[0]) as Spike;

const row = (over: Partial<InvestigationRow>): InvestigationRow => ({
  id: 1,
  seg_from: D(1, 17),
  seg_to: D(1, 19),
  status: "open",
  causes: [],
  notes: "",
  snapshot: spike,
  created_at: D(2),
  updated_at: D(2),
  ...over,
});

test("an untouched spike is a new pin; a saved one carries its row", () => {
  const [fresh] = mergeBoard([spike], segments, [], evidenceFor);
  assert.equal(fresh.status, "new");
  assert.equal(fresh.row, null);
  assert.equal(fresh.number, 1);

  const [saved] = mergeBoard([spike], segments, [row({ notes: "PC on" })], evidenceFor);
  assert.equal(saved.status, "open");
  assert.equal(saved.row?.notes, "PC on");
  assert.equal(saved.belowThreshold, false);
  assert.equal(saved.readingsChanged, false);
});

test("a saved pin that no longer passes stays, labelled, with live numbers", () => {
  const calm = row({ seg_from: D(1, 19), seg_to: D(1, 21) });
  const [pin] = mergeBoard([], segments, [calm], evidenceFor);
  assert.equal(pin.belowThreshold, true);
  assert.equal(pin.readingsChanged, false);
  assert.equal(pin.evidence?.ratio, 1);
});

test("a saved pin whose readings changed falls back to its snapshot", () => {
  const orphan = row({ seg_from: D(5, 1), seg_to: D(5, 3) });
  const [pin] = mergeBoard([], segments, [orphan], evidenceFor);
  assert.equal(pin.readingsChanged, true);
  assert.deepEqual(pin.evidence, spike);

  // No snapshot either: still a pin, just without numbers.
  const bare = row({ seg_from: D(5, 1), seg_to: D(5, 3), snapshot: null });
  assert.equal(mergeBoard([], segments, [bare], evidenceFor)[0].evidence, null);
});

test("with no baseline yet, saved rows still show from their snapshots", () => {
  const [pin] = mergeBoard([], segments, [row({})], () => null);
  assert.equal(pin.belowThreshold, false); // no baseline, no threshold
  assert.equal(pin.readingsChanged, false);
  assert.deepEqual(pin.evidence, spike);
});

test("pins are numbered oldest first", () => {
  const later = { ...spike, from: D(3, 1), to: D(3, 3) };
  const pins = mergeBoard([later, spike], segments, [], evidenceFor);
  assert.deepEqual(pins.map((p) => [p.number, p.from]), [[1, D(1, 17)], [2, D(3, 1)]]);
});

test("causes are trimmed, deduplicated and folded onto starter keys", () => {
  assert.deepEqual(normalizeCauses([" PC ", "pc", "Guests", "water  pump", "Water pump"]), [
    "pc",
    "guests",
    "water pump",
  ]);
  assert.equal(normalizeCauses(["  "]), null);
  assert.equal(normalizeCauses(["x".repeat(41)]), null);
});

test("PUT input is validated before anything is written", () => {
  const good = {
    seg_from: D(1, 17),
    seg_to: D(1, 19),
    status: "open",
    causes: [],
    notes: "",
  };
  assert.equal(parseInvestigationInput(good).ok, true);

  const bad: unknown[] = [
    null,
    "text",
    { ...good, seg_from: "yesterday" },
    { ...good, status: "closed" },
    { ...good, notes: 42 },
    { ...good, notes: "x".repeat(MAX_NOTES + 1) },
    { ...good, causes: "pc" },
    { ...good, causes: [1] },
    { ...good, status: "solved", causes: [] }, // solved needs a cause
  ];
  for (const b of bad) {
    const res = parseInvestigationInput(b);
    assert.equal(res.ok, false, JSON.stringify(b)?.slice(0, 60));
  }

  const solved = parseInvestigationInput({ ...good, status: "solved", causes: [" PC "] });
  assert.ok(solved.ok && solved.value.causes[0] === "pc");
});

test("rows from the database parse defensively", () => {
  const parsed = parseRow({
    id: 3,
    seg_from: D(1, 17),
    seg_to: D(1, 19),
    status: "solved",
    causes: '["pc","water pump"]',
    notes: "n",
    snapshot: "{}",
    created_at: D(2),
    updated_at: D(2),
  });
  assert.deepEqual(parsed.causes, ["pc", "water pump"]);
  assert.equal(parsed.snapshot, null); // {} carries no numbers

  const broken = parseRow({ id: 4, seg_from: "a", seg_to: "b", status: "weird", causes: "not json", snapshot: "nope" });
  assert.equal(broken.status, "open");
  assert.deepEqual(broken.causes, []);
  assert.equal(broken.snapshot, null);

  assert.deepEqual(customTags([parsed, row({ causes: ["guests", "Generator"] })]), [
    "Generator",
    "water pump",
  ]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module '.../lib/investigation.ts'`.

- [ ] **Step 3: Implement**

Create `lib/investigation.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 30 tests, 0 fail. If `node --test` rejects the type-only
import, confirm the line reads exactly `import type { Segment, Spike } from "./ledger.ts";`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/investigation.ts lib/investigation.test.mts
git commit -m "Merge spikes with saved investigations and validate input"
```

---

### Task 3: Table, API routes and `newSpikes`

**Files:**
- Modify: `lib/db.ts` (inside the `initDb()` `executeMultiple` string, after the `settings` table)
- Create: `app/api/investigations/route.ts`
- Create: `app/api/investigations/[id]/route.ts`
- Modify: `app/api/stats/route.ts`
- Modify: `components/Providers.tsx` (`Stats` interface)

**Interfaces:**
- Consumes: `buildSegments`, `currentBurnRate`, `detectSpikes`, `spikeEvidence` and the `ReadingRow` / `PurchaseRow` / `OutageRow` types from `@/lib/ledger`; `mergeBoard`, `parseRow`, `parseInvestigationInput` and `customTags` from `@/lib/investigation`.
- Produces:
  - `GET /api/investigations` returns `{ pins: Pin[]; strip: { from: string; to: string; hours: number; rate: number | null }[]; baseline: number | null; customTags: string[]; tzsPerKwh: number }`.
  - `PUT /api/investigations` takes an `InvestigationInput` body and returns `InvestigationRow`, or 400 `{ error }`.
  - `DELETE /api/investigations/[id]` returns `{ ok: true }`.
  - `/api/stats` gains `newSpikes: { from: string; to: string; ratio: number; extraKwh: number }[]`.

- [ ] **Step 1: Read the Next 16 route handler guide**

Run: `ls node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/ | grep -i route`
Then read the `route` file it lists. Confirm that dynamic params arrive as a
Promise. The existing `app/api/outages/[id]/route.ts` is the in-repo pattern.

- [ ] **Step 2: Add the table**

In `lib/db.ts`, inside `initDb()`'s SQL string, directly after the
`CREATE TABLE IF NOT EXISTS settings (...)` statement, add:

```sql
    -- One row per spike the user has written about. Untouched spikes have no
    -- row; they live only in the ledger's output.
    CREATE TABLE IF NOT EXISTS investigations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seg_from TEXT NOT NULL,
      seg_to TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      causes TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      snapshot TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (seg_from, seg_to)
    );
```

- [ ] **Step 3: Create the board and upsert route**

Create `app/api/investigations/route.ts`:

```ts
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import {
  buildSegments,
  currentBurnRate,
  detectSpikes,
  spikeEvidence,
  type ReadingRow,
  type PurchaseRow,
  type OutageRow,
} from "@/lib/ledger";
import {
  customTags,
  mergeBoard,
  parseInvestigationInput,
  parseRow,
} from "@/lib/investigation";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

/** The board: detected spikes merged with saved notes, plus the last 30 days
 *  of segment rates for the timeline strip. */
export async function GET() {
  const [readingsRes, purchasesRes, outagesRes, rowsRes] = await Promise.all([
    db.execute({ sql: "SELECT * FROM readings ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT * FROM purchases ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT start_at, end_at FROM outages", args: [] }),
    db.execute({ sql: "SELECT * FROM investigations", args: [] }),
  ]);
  const readings = readingsRes.rows as unknown as ReadingRow[];
  const purchases = purchasesRes.rows as unknown as PurchaseRow[];
  const outages = outagesRes.rows as unknown as OutageRow[];
  const rows = rowsRes.rows.map((r) =>
    parseRow(r as unknown as Record<string, unknown>)
  );

  const now = new Date();
  const segments = buildSegments(readings, purchases, outages);
  const burn = currentBurnRate(segments, now);
  const baseline = burn ? burn.rate : null;
  const spikes = baseline !== null ? detectSpikes(segments, baseline) : [];
  const pins = mergeBoard(spikes, segments, rows, (s) =>
    baseline !== null ? spikeEvidence(s, baseline) : null
  );

  const cutoff = now.getTime() - 30 * DAY;
  const strip = segments
    .filter((s) => new Date(s.to).getTime() >= cutoff)
    .map((s) => ({
      from: s.from,
      to: s.to,
      hours: Math.round(s.hours * 100) / 100,
      rate: s.rate === null ? null : Math.round(s.rate * 10) / 10,
    }));

  const units = purchases.reduce((sum, p) => sum + p.units, 0);
  const spent = purchases.reduce((sum, p) => sum + p.amount_tzs, 0);

  return NextResponse.json({
    pins,
    strip,
    baseline: baseline !== null ? Math.round(baseline * 100) / 100 : null,
    customTags: customTags(rows),
    tzsPerKwh: units > 0 ? Math.round((spent / units) * 10) / 10 : 0,
  });
}

/** Create or update the notes on one pin. The pair of reading timestamps is
 *  the key, so a double-tapped Save still leaves exactly one row. */
export async function PUT(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const parsed = parseInvestigationInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const v = parsed.value;
  const now = new Date().toISOString();

  // The snapshot is written once, on insert: it records the numbers as they
  // were when the user started investigating.
  await db.execute({
    sql: `INSERT INTO investigations
            (seg_from, seg_to, status, causes, notes, snapshot, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (seg_from, seg_to) DO UPDATE SET
            status = excluded.status,
            causes = excluded.causes,
            notes = excluded.notes,
            updated_at = excluded.updated_at`,
    args: [
      v.seg_from,
      v.seg_to,
      v.status,
      JSON.stringify(v.causes),
      v.notes,
      JSON.stringify(v.snapshot ?? {}),
      now,
      now,
    ],
  });

  const saved = await db.execute({
    sql: "SELECT * FROM investigations WHERE seg_from = ? AND seg_to = ?",
    args: [v.seg_from, v.seg_to],
  });
  return NextResponse.json(
    parseRow(saved.rows[0] as unknown as Record<string, unknown>)
  );
}
```

- [ ] **Step 4: Create the delete route**

Create `app/api/investigations/[id]/route.ts`:

```ts
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Forget a pin's notes. If the stretch is still a spike it comes back as new. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) {
    return NextResponse.json({ error: "id must be a positive integer" }, { status: 400 });
  }
  await db.execute({ sql: "DELETE FROM investigations WHERE id = ?", args: [n] });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Add `newSpikes` to stats**

In `app/api/stats/route.ts`:

1. Add `detectSpikes,` to the `@/lib/ledger` import list.
2. Add a fourth query to the `Promise.all` and destructure it as `investigationsResult`:
   ```ts
   db.execute({ sql: "SELECT seg_from, seg_to FROM investigations", args: [] }),
   ```
3. After the `const outageEnds = ...` line, add:
   ```ts
   // Spikes the user has not written anything on yet: the Dashboard's prompt
   // to open the investigation board.
   const investigated = new Set(
     (investigationsResult.rows as unknown as { seg_from: string; seg_to: string }[]).map(
       (r) => `${r.seg_from}|${r.seg_to}`
     )
   );
   const newSpikes =
     burnRate !== null
       ? detectSpikes(segments, burnRate)
           .filter((s) => !investigated.has(`${s.from}|${s.to}`))
           .map(({ from, to, ratio, extraKwh }) => ({ from, to, ratio, extraKwh }))
       : [];
   ```
4. Add `newSpikes,` after `outageEnds,` in the returned JSON.

In `components/Providers.tsx`, inside `interface Stats`, after the
`outageEnds: {...}[];` member, add:

```ts
  newSpikes: { from: string; to: string; ratio: number; extraKwh: number }[];
```

- [ ] **Step 6: Verify the API on the dev server**

Note that this writes to the real Turso database, the only one configured. Every
row these steps create is deleted again in sub-step 8.

1. Start the server: `npx next dev -p 3123` (in the background).
2. Create the table: `curl -s localhost:3123/api/setup`. Expected: `{"ok":true,...}`.
3. Read the board:
   `curl -s localhost:3123/api/investigations | python -c "import json,sys; d=json.load(sys.stdin); print(d['baseline'], d['tzsPerKwh'], len(d['strip']), [(p['number'],p['status'],p['from']) for p in d['pins']])"`
   Expected: a baseline around 3.07, `tzsPerKwh` 420.2, a non-empty strip, and at least one pin with status `new`.
4. Upsert twice; there must still be one row:
   ```bash
   F=<from of pin 1>; T=<to of pin 1>
   for i in 1 2; do curl -s -X PUT localhost:3123/api/investigations -H 'Content-Type: application/json' \
     -d "{\"seg_from\":\"$F\",\"seg_to\":\"$T\",\"status\":\"open\",\"causes\":[\" PC \"],\"notes\":\"test $i\"}"; echo; done
   ```
   Expected: both responses have the same `id`, the second shows `"notes":"test 2"`, and `"causes":["pc"]`.
5. Bad input returns 400 and writes nothing:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT localhost:3123/api/investigations -H 'Content-Type: application/json' -d "{\"seg_from\":\"$F\",\"seg_to\":\"$T\",\"status\":\"solved\",\"causes\":[],\"notes\":\"\"}"
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT localhost:3123/api/investigations -H 'Content-Type: application/json' -d 'not json'
   ```
   Expected: `400` twice.
6. Readings-changed orphan:
   ```bash
   curl -s -X PUT localhost:3123/api/investigations -H 'Content-Type: application/json' \
     -d '{"seg_from":"2026-01-01T00:00:00.000Z","seg_to":"2026-01-01T02:00:00.000Z","status":"open","causes":[],"notes":"orphan"}'
   curl -s localhost:3123/api/investigations | python -c "import json,sys; print([(p['readingsChanged'],p['evidence']) for p in json.load(sys.stdin)['pins'] if p['row'] and p['row']['notes']=='orphan'])"
   ```
   Expected: `[(True, None)]`.
7. Stats: `curl -s localhost:3123/api/stats | python -c "import json,sys; print(json.load(sys.stdin)['newSpikes'])"`
   Expected: pin 1's window is absent, because it now has a row.
8. Clean up: DELETE both test rows by the ids returned above:
   `curl -s -X DELETE localhost:3123/api/investigations/<id>` for each. Then confirm with step 3 that pin 1 is `new` again and the orphan is gone.
9. Stop the dev server.

- [ ] **Step 7: Gates and commit**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: tests pass, tsc is clean, lint still shows 4 problems.

```bash
git add lib/db.ts app/api/investigations app/api/stats/route.ts components/Providers.tsx
git commit -m "Store investigations and serve the spike board"
```

---

### Task 4: The board page and pin cards

**Files:**
- Modify: `lib/i18n.ts` (add keys directly before the `"detect.title"` line)
- Create: `components/PinCard.tsx`
- Create: `app/investigate/page.tsx`

**Interfaces:**
- Consumes: `GET`/`PUT /api/investigations`, `DELETE /api/investigations/[id]` (Task 3); the `Pin`, `STARTER_CAUSES` and `MAX_NOTES` exports from `@/lib/investigation` (Task 2); `useLang` from `@/components/Providers`; `tr` from `@/lib/i18n`; `formatDateTimeEAT` and `getTimePeriod` from `@/lib/utils`; the default export of `@/components/ConfirmModal` (`{ open, onConfirm, onCancel }`).
- Produces: the `/investigate` route; `PinCard({ pin, tzsPerKwh, customTags, onChanged })`.

- [ ] **Step 1: Add the strings**

In `lib/i18n.ts`, directly before `  "detect.title":`, add:

```ts
  "investigate.title": { sw: "Ubao wa Uchunguzi", en: "Investigation Board" },
  "investigate.description": {
    sw: "Vipindi ambavyo matumizi yalipanda ghafla. Andika unachoshuku, kisha funga kwa sababu.",
    en: "Stretches where usage jumped. Write down what you suspect, then close each one with a cause.",
  },
  "investigate.open": { sw: "Wazi", en: "Open" },
  "investigate.solved": { sw: "Zimetatuliwa ({count})", en: "Solved ({count})" },
  "investigate.empty": {
    sw: "Hakuna mpando. Kawaida ni {baseline} kWh/siku; alama inaonekana kipindi kinapofikia mara 2 ya hiyo kwa saa moja au zaidi.",
    en: "No spikes. Normal is {baseline} kWh/day; a pin appears when a stretch runs 2× that for an hour or more.",
  },
  "investigate.noBaseline": {
    sw: "Bado hakuna kiwango cha kawaida. Sajili usomaji 3 ndani ya siku 3.",
    en: "No normal rate yet. Log 3 readings across 3 days.",
  },
  "investigate.normal": { sw: "kawaida {baseline} kWh/siku", en: "normal {baseline} kWh/day" },
  "investigate.notLogged": { sw: "haijasajiliwa", en: "not logged" },
  "investigate.stripLabel": {
    sw: "Kiwango cha matumizi siku 30 zilizopita, alama {count}",
    en: "Usage rate over the last 30 days, {count} pins",
  },
  "investigate.loadFailed": { sw: "Imeshindwa kupakia ubao.", en: "Could not load the board." },
  "pin.ratio": { sw: "mara {ratio} ya kawaida", en: "{ratio}× normal" },
  "pin.extra": { sw: "+{kwh} kWh zaidi ya kawaida, takriban TZS {tzs}", en: "+{kwh} kWh above normal, about TZS {tzs}" },
  "pin.noNumbers": { sw: "Takwimu hazipatikani", en: "Numbers unavailable" },
  "pin.new": { sw: "Mpya", en: "New" },
  "pin.belowThreshold": { sw: "Chini ya kizingiti sasa", en: "Below threshold now" },
  "pin.readingsChanged": { sw: "Usomaji umebadilika", en: "Readings changed" },
  "pin.outage": { sw: "kukatika kwa umeme", en: "outage overlapped" },
  "pin.purchase": { sw: "ununuzi ndani", en: "purchase inside" },
  "pin.overnight": { sw: "usiku kucha", en: "spans the night" },
  "pin.notes": { sw: "Maelezo", en: "Notes" },
  "pin.notesPlaceholder": { sw: "Unashuku nini? Nini kilikuwa kinawaka?", en: "What do you suspect? What was running?" },
  "pin.causes": { sw: "Sababu", en: "Causes" },
  "pin.addTag": { sw: "+ yako", en: "+ own tag" },
  "pin.tagPlaceholder": { sw: "mf. pampu ya maji", en: "e.g. water pump" },
  "pin.add": { sw: "Ongeza", en: "Add" },
  "pin.save": { sw: "Hifadhi", en: "Save" },
  "pin.saved": { sw: "Imehifadhiwa", en: "Saved" },
  "pin.saveFailed": { sw: "Haikuhifadhiwa, jaribu tena.", en: "Not saved, try again." },
  "pin.markSolved": { sw: "Imetatuliwa", en: "Mark solved" },
  "pin.needCause": { sw: "Chagua sababu kwanza", en: "Pick a cause first" },
  "pin.reopen": { sw: "Fungua tena", en: "Reopen" },
  "pin.clear": { sw: "Futa maelezo", en: "Clear notes" },
  "cause.fridge": { sw: "Friji", en: "Fridge" },
  "cause.multicooker": { sw: "Jiko la umeme", en: "Multicooker" },
  "cause.pc": { sw: "Kompyuta", en: "PC" },
  "cause.guests": { sw: "Wageni", en: "Guests" },
  "cause.unknown": { sw: "Haijulikani", en: "Unknown" },
  "cause.falseAlarm": { sw: "Sio tatizo", en: "False alarm" },
```

- [ ] **Step 2: Create the pin card**

Create `components/PinCard.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useLang } from "./Providers";
import ConfirmModal from "./ConfirmModal";
import { tr } from "@/lib/i18n";
import { formatDateTimeEAT, getTimePeriod } from "@/lib/utils";
import { MAX_NOTES, STARTER_CAUSES, type Pin, type Status } from "@/lib/investigation";

const chip =
  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors";
const chipOn = "border-[#003399] bg-[#003399] text-white";
const chipOff =
  "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

/**
 * One pin: the evidence, then the user's investigation. Saving sends the whole
 * state (notes, causes, status) so the row always matches what is on screen.
 */
export default function PinCard({
  pin,
  tzsPerKwh,
  customTags,
  onChanged,
}: {
  pin: Pin;
  tzsPerKwh: number;
  customTags: string[];
  onChanged: () => void;
}) {
  const { lang } = useLang();
  const [notes, setNotes] = useState(pin.row?.notes ?? "");
  const [causes, setCauses] = useState<string[]>(pin.row?.causes ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const e = pin.evidence;
  const status: Status = pin.status === "solved" ? "solved" : "open";
  const label = (c: string) =>
    (STARTER_CAUSES as readonly string[]).includes(c) ? tr(`cause.${c}`, lang) : c;
  const allTags = [
    ...STARTER_CAUSES,
    ...customTags,
    ...causes.filter(
      (c) => !(STARTER_CAUSES as readonly string[]).includes(c) && !customTags.includes(c)
    ),
  ];

  const save = async (nextStatus: Status) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/investigations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seg_from: pin.from,
          seg_to: pin.to,
          status: nextStatus,
          causes,
          notes,
          snapshot: pin.evidence,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMessage("saved");
      onChanged();
    } catch {
      setMessage("failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    if (!pin.row) return;
    setBusy(true);
    try {
      await fetch(`/api/investigations/${pin.row.id}`, { method: "DELETE" });
      // The card keeps its key, so wipe the local state it was showing.
      setNotes("");
      setCauses([]);
      setMessage(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (c: string) =>
    setCauses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const addTag = () => {
    const tag = tagDraft.trim().replace(/\s+/g, " ").slice(0, 40);
    if (tag && !causes.some((c) => c.toLowerCase() === tag.toLowerCase())) {
      setCauses((prev) => [...prev, tag]);
    }
    setTagDraft("");
  };

  return (
    <div
      id={`pin-${pin.number}`}
      className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Evidence */}
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-sm font-bold text-white">
          {pin.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            {formatDateTimeEAT(pin.from)} → {formatDateTimeEAT(pin.to)}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {tr(`period.${getTimePeriod(pin.from)}`, lang)} →{" "}
            {tr(`period.${getTimePeriod(pin.to)}`, lang)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pin.status === "new" && (
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                {tr("pin.new", lang)}
              </span>
            )}
            {pin.belowThreshold && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {tr("pin.belowThreshold", lang)}
              </span>
            )}
            {pin.readingsChanged && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {tr("pin.readingsChanged", lang)}
              </span>
            )}
          </div>
        </div>
      </div>

      {e ? (
        <div className="mt-3 space-y-0.5 text-sm">
          <p className="font-medium text-zinc-800 dark:text-zinc-100">
            {e.rate} kWh/{lang === "sw" ? "siku" : "day"} ·{" "}
            <span className="text-orange-600 dark:text-orange-400">
              {tr("pin.ratio", lang, { ratio: e.ratio })}
            </span>
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("pin.extra", lang, {
              kwh: e.extraKwh,
              tzs: Math.round(e.extraKwh * tzsPerKwh).toLocaleString(),
            })}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {e.outageOverlap && <ContextChip text={tr("pin.outage", lang)} />}
            {e.purchaseInside && <ContextChip text={tr("pin.purchase", lang)} />}
            {e.overnight && <ContextChip text={tr("pin.overnight", lang)} />}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs italic text-zinc-400 dark:text-zinc-500">
          {tr("pin.noNumbers", lang)}
        </p>
      )}

      {/* Investigation */}
      <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {tr("pin.notes", lang)}
        <textarea
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          maxLength={MAX_NOTES}
          rows={3}
          placeholder={tr("pin.notesPlaceholder", lang)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-[#003399] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
        />
      </label>

      <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {tr("pin.causes", lang)}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {allTags.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={causes.includes(c)}
            onClick={() => toggle(c)}
            className={`${chip} ${causes.includes(c) ? chipOn : chipOff}`}
          >
            {label(c)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={tagDraft}
          onChange={(ev) => setTagDraft(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && addTag()}
          maxLength={40}
          placeholder={tr("pin.tagPlaceholder", lang)}
          aria-label={tr("pin.addTag", lang)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#003399] focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
        />
        <button type="button" onClick={addTag} className={`${chip} ${chipOff}`}>
          {tr("pin.add", lang)}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(status)}
          className="rounded-md bg-[#003399] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#002277] disabled:opacity-50"
        >
          {tr("pin.save", lang)}
        </button>
        {status === "open" ? (
          <button
            type="button"
            disabled={busy || causes.length === 0}
            title={causes.length === 0 ? tr("pin.needCause", lang) : undefined}
            onClick={() => save("solved")}
            className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            {tr("pin.markSolved", lang)}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => save("open")}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {tr("pin.reopen", lang)}
          </button>
        )}
        {pin.row && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmClear(true)}
            className="ml-auto rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            {tr("pin.clear", lang)}
          </button>
        )}
        <span role="status" className="text-xs">
          {message === "saved" && (
            <span className="text-emerald-600 dark:text-emerald-400">{tr("pin.saved", lang)}</span>
          )}
          {message === "failed" && (
            <span className="text-red-500 dark:text-red-400">{tr("pin.saveFailed", lang)}</span>
          )}
        </span>
      </div>

      <ConfirmModal
        open={confirmClear}
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function ContextChip({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {text}
    </span>
  );
}
```

- [ ] **Step 3: Create the page**

Create `app/investigate/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/components/Providers";
import PinCard from "@/components/PinCard";
import { tr } from "@/lib/i18n";
import { formatDateEAT } from "@/lib/utils";
import type { Pin } from "@/lib/investigation";

interface StripItem {
  from: string;
  to: string;
  hours: number;
  rate: number | null;
}

interface Board {
  pins: Pin[];
  strip: StripItem[];
  baseline: number | null;
  customTags: string[];
  tzsPerKwh: number;
}

/** Investigation board. Fetches its own data rather than going through the
 *  Providers cache: it is the only reader, and notes must always be fresh. */
export default function Investigate() {
  const { lang } = useLang();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/investigations")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Board>;
      })
      .then((data) => {
        if (!alive) return;
        setBoard(data);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [version]);

  const refresh = () => setVersion((v) => v + 1);

  const open = board
    ? board.pins.filter((p) => p.status !== "solved").sort((a, b) => b.number - a.number)
    : [];
  const solved = board
    ? board.pins.filter((p) => p.status === "solved").sort((a, b) => b.number - a.number)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{tr("investigate.title", lang)}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {tr("investigate.description", lang)}
        </p>
      </div>

      {failed && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {tr("investigate.loadFailed", lang)}
        </p>
      )}

      {board && board.strip.length > 0 && board.baseline !== null && (
        <Strip board={board} lang={lang} />
      )}

      {board && board.pins.length === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          {board.baseline !== null
            ? tr("investigate.empty", lang, { baseline: board.baseline })
            : tr("investigate.noBaseline", lang)}
        </p>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {tr("investigate.open", lang)}
          </h2>
          {open.map((pin) => (
            <PinCard
              key={`${pin.from}|${pin.to}`}
              pin={pin}
              tzsPerKwh={board!.tzsPerKwh}
              customTags={board!.customTags}
              onChanged={refresh}
            />
          ))}
        </section>
      )}

      {solved.length > 0 && (
        <details className="group space-y-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {tr("investigate.solved", lang, { count: solved.length })}
          </summary>
          <div className="mt-3 space-y-3">
            {solved.map((pin) => (
              <PinCard
                key={`${pin.from}|${pin.to}`}
                pin={pin}
                tzsPerKwh={board!.tzsPerKwh}
                customTags={board!.customTags}
                onChanged={refresh}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Thirty days of segments: width follows duration, height follows rate. A
 * stretch over a day is drawn as a fixed hatched block, so a week away does
 * not squeeze everything else into a sliver.
 */
function Strip({ board, lang }: { board: Board; lang: "sw" | "en" }) {
  const baseline = board.baseline ?? 0;
  const maxRate = Math.max(baseline * 2.5, ...board.strip.map((s) => s.rate ?? 0), 1);
  const pinAt = new Map(
    board.pins
      .filter((p) => !p.readingsChanged)
      .map((p): [string, number] => [`${p.from}|${p.to}`, p.number])
  );

  const jump = (n: number) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`pin-${n}`)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div
        role="img"
        aria-label={tr("investigate.stripLabel", lang, { count: pinAt.size })}
        className="relative h-28 w-full"
      >
        <div className="absolute inset-x-0 bottom-0 top-6 flex items-end gap-px">
          {board.strip.map((s) => {
            const gap = s.hours > 24;
            const n = pinAt.get(`${s.from}|${s.to}`);
            return (
              <div
                key={s.from}
                className="relative h-full min-w-px"
                style={{ flexGrow: gap ? 6 : Math.max(s.hours, 0.3), flexBasis: 0 }}
              >
                {gap ? (
                  <div
                    aria-hidden
                    title={tr("investigate.notLogged", lang)}
                    className="absolute inset-0 rounded-sm text-zinc-300 dark:text-zinc-700"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 6px)",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden
                    className={`absolute inset-x-0 bottom-0 rounded-t-sm ${
                      n ? "bg-orange-500" : "bg-[#003399] dark:bg-blue-500"
                    }`}
                    style={{ height: `${Math.min(1, (s.rate ?? 0) / maxRate) * 100}%` }}
                  />
                )}
                {n !== undefined && (
                  <button
                    type="button"
                    onClick={() => jump(n)}
                    aria-label={`${n}`}
                    className="absolute -top-6 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white"
                  >
                    {n}
                  </button>
                )}
              </div>
            );
          })}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500"
            style={{ bottom: `${(baseline / maxRate) * 100}%` }}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>{formatDateEAT(board.strip[0].from)}</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          - - {tr("investigate.normal", lang, { baseline })}
        </span>
        <span>{formatDateEAT(board.strip[board.strip.length - 1].to)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Check that the `Lang` type matches**

Run: `grep -n "type Lang\|Lang =" components/Providers.tsx lib/i18n.ts`
If `Lang` is exported, replace `lang: "sw" | "en"` in `Strip` with that type
and import it. Otherwise leave the literal union as written.

- [ ] **Step 5: Gates**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: tests pass, tsc is clean, lint still shows 4 problems. If the
`react-hooks/set-state-in-effect` rule flags the page, look at where the
setState calls are. They must sit only inside the `.then` callbacks, never
synchronously in the effect body.

- [ ] **Step 6: Commit**

```bash
git add lib/i18n.ts components/PinCard.tsx app/investigate/page.tsx
git commit -m "Add the investigation board page and pin cards"
```

---

### Task 5: Entry points and docs

**Files:**
- Modify: `components/Detections.tsx`
- Modify: `app/analytics/page.tsx` (after the `<VendorRates />` line)
- Modify: `lib/i18n.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `stats.newSpikes` (Task 3); the `/investigate` route (Task 4).
- Produces: user-visible routes into the board.

- [ ] **Step 1: Add the strings**

In `lib/i18n.ts`, directly before `  "detect.title":`, add:

```ts
  "detect.spikeTitle": { sw: "Mpando wa matumizi umewekwa alama", en: "New usage spike pinned" },
  "detect.spikeBody": {
    sw: "{from} hadi {to} ilikuwa mara {ratio} ya kawaida, +{kwh} kWh.",
    en: "{from} to {to} ran {ratio}× your normal rate, +{kwh} kWh.",
  },
  "detect.spikeMore": { sw: "na mingine {count}", en: "and {count} more" },
  "detect.spikeAction": { sw: "Fungua ubao", en: "Open board" },
  "analytics.boardLink": { sw: "Ubao wa uchunguzi →", en: "Investigation board →" },
```

- [ ] **Step 2: Add the Dashboard card**

In `components/Detections.tsx`:

1. After the line `const ends = stats.outageEnds.filter(...)` block, add:
   ```ts
   const spikes = (stats.newSpikes ?? []).filter(
     (s) => !dismissed.includes(`spike:${s.from}:${s.to}`)
   );
   ```
2. Extend the early-return condition with `&& spikes.length === 0`.
3. Directly after `{tr("detect.title", lang)}</p>`, render the newest spike as
   one card:
   ```tsx
   {spikes.length > 0 && (() => {
     const s = spikes[spikes.length - 1];
     const key = `spike:${s.from}:${s.to}`;
     return (
       <Card
         key={key}
         tone="orange"
         title={tr("detect.spikeTitle", lang)}
         body={
           tr("detect.spikeBody", lang, {
             from: formatDateTimeEAT(s.from),
             to: formatDateTimeEAT(s.to),
             ratio: s.ratio,
             kwh: s.extraKwh,
           }) +
           (spikes.length > 1
             ? " " + tr("detect.spikeMore", lang, { count: spikes.length - 1 })
             : "")
         }
       >
         <Link href="/investigate" className={actionClass}>
           {tr("detect.spikeAction", lang)}
         </Link>
         <button onClick={() => dismiss(key)} className={quietClass}>
           {tr("detect.dismiss", lang)}
         </button>
       </Card>
     );
   })()}
   ```
   `Link` is already imported in this file.

- [ ] **Step 3: Add the Analytics link**

In `app/analytics/page.tsx`, add `import Link from "next/link";` with the other
imports. Directly after `<VendorRates />`, add:

```tsx
      <Link
        href="/investigate"
        className="block rounded-xl border border-zinc-200 bg-white p-4 text-sm font-medium text-[#003399] hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-blue-400 dark:hover:bg-zinc-800"
      >
        {tr("analytics.boardLink", lang)}
      </Link>
```

- [ ] **Step 4: Update CLAUDE.md**

1. Under `app/api/`, after the `outages/` line, add:
   `  - \`investigations/\` + \`[id]/\` — Investigation board: GET merged board (spikes + saved notes + 30-day strip), PUT upsert by (seg_from, seg_to), DELETE`
2. Under `lib/`, after the `ledger.ts` entry, add:
   `  - \`investigation.ts\` — Board merging (\`mergeBoard\`), PUT validation, cause tags. Type-only imports so \`node --test\` runs it.`
3. Under `components/`, add:
   `  - \`PinCard.tsx\` — One investigation pin: evidence, notes, cause chips, solve/reopen/clear`
4. Under `## Database Schema`, change "Four tables" to "Five tables" and add:
   `- **investigations** — \`id\` INTEGER PK, \`seg_from\`/\`seg_to\` TEXT (UNIQUE pair, the segment's reading timestamps), \`status\` ('open'|'solved'), \`causes\` JSON TEXT, \`notes\` TEXT, \`snapshot\` JSON TEXT (evidence at first save), \`created_at\`, \`updated_at\`. Rows are created lazily on first save.`
5. Under `## Key Domain Logic`, add:
   `- Spikes (\`detectSpikes()\`): a segment at >= 2× the burn rate, >= 0.5 kWh above it, >= 1 powered hour, <= 2 days long. Evidence only; the user names the cause. Starter causes are only appliances the user named (fridge, multicooker, PC) plus guests/unknown/false alarm.`
6. Under `## Pages`, add:
   `- **Investigate** (\`/investigate\`) — Not a nav tab; linked from the Dashboard spike card and Analytics. 30-day rate strip with numbered pins, open/solved pin cards with notes and causes.`

- [ ] **Step 5: Gates and commit**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: tests pass, tsc is clean, lint still shows 4 problems.

```bash
git add components/Detections.tsx app/analytics/page.tsx lib/i18n.ts CLAUDE.md
git commit -m "Link the investigation board from the dashboard and analytics"
```

---

### Task 6: Drive it in the browser, then the ship gate

**Files:** whatever this task's findings require. A fix lands in the file that owns the behaviour.

- [ ] **Step 1: Start the app**

Run `npx next dev -p 3123` in the background, then hit `curl -s localhost:3123/api/setup`.

- [ ] **Step 2: Drive the board in Chrome at phone width**

1. Load the browser tools in one ToolSearch call (`tabs_context_mcp`, `tabs_create_mcp`, `navigate`, `computer`, `read_page`, `resize_window`, `read_console_messages`).
2. Open a new tab and resize it to 390×844.
3. Visit `/` and confirm the "New usage spike pinned" card shows with an "Open board" link.
4. Follow the link to `/investigate`. Confirm:
   - The strip renders, with orange pin markers and a dashed baseline.
   - The hatched "not logged" block appears if the 30-day window holds a gap over a day.
   - There is no horizontal scroll.
5. Tap pin ① in the strip. The page scrolls to its card.
6. Type a note, tap Save, and see "Saved". Reload: the note persists, and the "New" badge is gone.
7. Add own tag `test tag`, select it, and tap Mark solved. The card moves under "Solved (1)".
8. Expand Solved and tap Reopen. The card returns to Open.
9. Tap Clear notes and confirm. The pin is "New" again, and the Dashboard card reappears.
10. Toggle the language to Swahili in Settings and revisit. Every string is translated and none is a raw key such as `pin.save`.
11. Read the console messages with pattern `Error|Warning`. Expected: none from these pages.
12. Leave the database as it was. Any pin touched only for testing must be cleared (step 9) before finishing.

- [ ] **Step 3: Ship gate**

Invoke `impeccable:audit` on `/investigate`, together with `components/PinCard.tsx`. The user approved this on 2026-10-04.
- Fix every finding of critical or high severity.
- List medium and low findings in the report without fixing them, unless a fix is one line.

- [ ] **Step 4: Final gates and commit**

Run: `npm test && npx tsc --noEmit -p . && npm run lint`
Expected: tests pass, tsc is clean, lint still shows 4 problems.
Stop the dev server.

```bash
git add -A
git commit -m "Polish the investigation board after browser check and audit"
```
(Skip the commit if the audit and browser pass changed nothing.)
