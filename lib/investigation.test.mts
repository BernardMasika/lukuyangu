import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSegments, spikeEvidence, type Spike } from "./ledger.ts";
import {
  mergeBoard,
  parseInvestigationInput,
  normalizeCauses,
  parseRow,
  customTags,
  isReadingPair,
  causeDraws,
  MAX_NOTES,
  MAX_CAUSES,
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
  origin: "auto",
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
    "generator",
    "water pump",
  ]);
});

test("a custom tag typed in another case on another pin is the same chip", () => {
  // Review finding: "Generator" saved on pin A, "generator" typed on pin B
  // showed two chips. Custom tags are stored lowercase, so they cannot drift.
  assert.deepEqual(normalizeCauses(["Generator"]), ["generator"]);
  assert.deepEqual(
    customTags([row({ causes: ["Generator"] }), row({ causes: ["generator"] })]),
    ["generator"]
  );
});

test("pin keys must be exact ISO strings, so one stretch cannot get two rows", () => {
  const base = { status: "open", causes: [], notes: "" };
  for (const loose of ["Oct 4 2026", "2026", "2026-10-01T17:00:00Z"]) {
    const res = parseInvestigationInput({ ...base, seg_from: loose, seg_to: D(1, 19) });
    assert.equal(res.ok, false, loose);
  }
});

test("a snapshot keeps only Spike fields of the right type, or nothing", () => {
  // Review finding: a crafted snapshot with an object in `rate` crashed the
  // whole board once its segment vanished, and any size was stored.
  const crafted = { ...spike, rate: { boom: 1 }, junk: "x".repeat(10_000) };
  const res = parseInvestigationInput({
    seg_from: D(1, 17),
    seg_to: D(1, 19),
    status: "open",
    causes: [],
    notes: "",
    snapshot: crafted,
  });
  assert.ok(res.ok);
  assert.equal(res.value.snapshot, null);

  const clean = parseInvestigationInput({
    seg_from: D(1, 17),
    seg_to: D(1, 19),
    status: "open",
    causes: [],
    notes: "",
    snapshot: { ...spike, junk: "x".repeat(10_000) },
  });
  assert.ok(clean.ok);
  assert.deepEqual(clean.value.snapshot, spike); // extra keys dropped

  // The same check guards rows already in the database.
  const stored = parseRow({ ...row({}), causes: "[]", snapshot: JSON.stringify(crafted) });
  assert.equal(stored.snapshot, null);
});

test("the causes cap applies to what was sent, before any clean-up work", () => {
  // A million copies of "pc" used to be trimmed one by one, then collapse to a
  // single tag and pass. The raw list is capped first.
  const res = parseInvestigationInput({
    seg_from: D(1, 17),
    seg_to: D(1, 19),
    status: "open",
    causes: new Array(MAX_CAUSES + 1).fill("pc"),
    notes: "",
  });
  assert.equal(res.ok, false);
});

test("a new pin must be exactly two consecutive readings", () => {
  // `between` is every reading timestamp in [from, to], oldest first.
  assert.equal(isReadingPair([D(1, 17), D(1, 19)], D(1, 17), D(1, 19)), true);
  assert.equal(isReadingPair([D(1, 17), D(1, 18), D(1, 19)], D(1, 17), D(1, 19)), false); // a reading inside
  assert.equal(isReadingPair([D(1, 17)], D(1, 17), D(1, 19)), false); // no closing reading
  assert.equal(isReadingPair([], D(5, 1), D(5, 3)), false); // invented stretch
  assert.equal(isReadingPair([D(1, 17), D(1, 19)], D(1, 19), D(1, 17)), false); // reversed
});

test("a stretch you pinned yourself is labelled yours and never 'below threshold'", () => {
  const calm = row({ seg_from: D(1, 19), seg_to: D(1, 21), origin: "manual" });
  const [pin] = mergeBoard([], segments, [calm], evidenceFor);
  assert.equal(pin.manual, true);
  assert.equal(pin.belowThreshold, false);
  assert.equal(pin.evidence?.ratio, 1); // live numbers still shown

  const [auto] = mergeBoard([spike], segments, [], evidenceFor);
  assert.equal(auto.manual, false);
});

test("origin is read and validated, defaulting to auto", () => {
  const base = { seg_from: D(1, 17), seg_to: D(1, 19), status: "open", causes: [], notes: "" };
  const plain = parseInvestigationInput(base);
  assert.ok(plain.ok && plain.value.origin === "auto");
  const manual = parseInvestigationInput({ ...base, origin: "manual" });
  assert.ok(manual.ok && manual.value.origin === "manual");
  assert.equal(parseInvestigationInput({ ...base, origin: "robot" }).ok, false);

  assert.equal(parseRow({ id: 1, seg_from: "a", seg_to: "b", origin: "manual" }).origin, "manual");
  assert.equal(parseRow({ id: 1, seg_from: "a", seg_to: "b" }).origin, "auto"); // rows from before the column
});

test("causeDraws: dips and spikes both measure a draw, ambiguous pins are skipped", () => {
  const ev = (extraKwh: number, activeHours: number) =>
    ({ ...spike, extraKwh, activeHours }) as Spike;
  const pin = (causes: string[], evidence: Spike | null) =>
    ({ evidence, row: row({ causes }) }) as Parameters<typeof causeDraws>[0][number];

  const draws = causeDraws([
    pin(["pc"], ev(-0.7, 7)), // PC off overnight: 0.1 kWh an hour saved
    pin(["pc"], ev(0.3, 3)), // PC on hard: 0.1 kWh an hour extra
    pin(["pc", "fridge"], ev(2, 2)), // two causes: cannot split, skipped
    pin(["pc", "unknown"], ev(2, 2)), // something else too: skipped
    pin(["falseAlarm"], ev(1, 1)), // not a load
    pin(["pc"], null), // no numbers
    pin(["multicooker"], ev(0.9, 1)),
  ]);

  assert.deepEqual(draws, [
    { cause: "multicooker", kwhPerHour: 0.9, pins: 1, hours: 1 },
    { cause: "pc", kwhPerHour: 0.1, pins: 2, hours: 10 },
  ]);
});
