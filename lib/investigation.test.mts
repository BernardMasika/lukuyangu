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
