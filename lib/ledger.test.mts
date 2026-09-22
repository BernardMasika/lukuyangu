/**
 * Run with `npm test` (node --test, no framework, no dependencies).
 *
 * These cases are the ones from the feature-request doc, written down as
 * arithmetic so a regression shows up as a failure rather than as a confusing
 * number on the dashboard.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSegments,
  consumptionBetween,
  purchaseLifetimes,
  burnRateFrom,
  detectMissingPurchases,
  detectSuspectedOutages,
  detectLoggingGaps,
  expectedReadingRange,
  type ReadingRow,
  type PurchaseRow,
} from "./ledger.ts";

/** September 2026, UTC. `D(2, 6)` is the 2nd at 06:00. */
const D = (day: number, hour = 0, minute = 0) =>
  new Date(Date.UTC(2026, 8, day, hour, minute)).toISOString();

const r = (id: number, reading: number, at: string): ReadingRow => ({
  id,
  reading,
  created_at: at,
});

const p = (
  id: number,
  units: number,
  at: string,
  amount = 10000,
  vendor = ""
): PurchaseRow => ({ id, units, amount_tzs: amount, vendor, created_at: at });

test("today's usage accumulates across a top-up instead of resetting to zero", () => {
  // The reported bug: log a purchase and the day's usage went to 0, because
  // the old code only did firstReading - lastReading.
  const readings = [
    r(1, 20, D(22, 6)),
    r(2, 10, D(22, 9)),
    r(3, 55, D(22, 12)),
  ];
  const purchases = [p(1, 50, D(22, 10))];

  const segments = buildSegments(readings, purchases);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].consumption, 10); // 20 -> 10
  assert.equal(segments[1].consumption, 5); // 10 + 50 - 55

  const today = consumptionBetween(
    segments,
    new Date(D(22, 0)),
    new Date(D(23, 0))
  );
  assert.equal(today.units, 15);
  assert.equal(today.estimated, false);
});

test("a purchase made while old units remain has not started yet", () => {
  // Bought 50 units with 17 still on the meter. Those 17 burn first, so the
  // new purchase is queued, not running, and must not report a lifetime.
  const readings = [r(1, 20, D(1)), r(2, 17, D(2)), r(3, 67, D(2, 1))];
  const purchases = [p(1, 50, D(2, 0, 30))];

  const segments = buildSegments(readings, purchases);
  const lifetimes = purchaseLifetimes(segments, purchases, 20, new Date(D(2, 2)));

  assert.equal(lifetimes.length, 1);
  assert.equal(lifetimes[0].started, false);
  assert.equal(lifetimes[0].startedAt, null);
  assert.equal(lifetimes[0].days, 0);
  assert.equal(lifetimes[0].unitsRemaining, 50);
});

test("FIFO gives each purchase a real lifetime and infers when it ran out", () => {
  const readings = [
    r(1, 20, D(1)),
    r(2, 2, D(2)), // cum 18
    r(3, 32, D(2, 1)), // 2 + 30 - 32, cum 18
    r(4, 4, D(6)), // cum 46
    r(5, 44, D(6, 1)), // 4 + 40 - 44, cum 46
    r(6, 20, D(10)), // cum 70
  ];
  const purchases = [p(1, 30, D(2, 0, 30)), p(2, 40, D(6, 0, 30))];

  const segments = buildSegments(readings, purchases);
  const lifetimes = purchaseLifetimes(segments, purchases, 20, new Date(D(10)));

  // Lots on the cumulative curve: opening 0-20, p1 20-50, p2 50-90.
  const [first, second] = lifetimes;

  assert.equal(first.started, true);
  assert.notEqual(first.exhaustedAt, null);
  // Depletion fell between two readings, so it is interpolated, not observed.
  assert.equal(first.exhaustedEstimated, true);
  assert.ok(
    first.days > 4 && first.days < 4.7,
    `expected ~4.4 days, got ${first.days}`
  );
  // It sat on the meter a while before its units were reached.
  assert.ok(first.idleDaysBeforeStart > 0);

  assert.equal(second.started, true);
  assert.equal(second.running, true);
  assert.equal(second.exhaustedAt, null);
  assert.equal(second.unitsRemaining, 20); // 90 - 70

  // The moment one purchase runs out is the moment the next starts.
  assert.equal(first.exhaustedAt, second.startedAt);
});

test("purchases made before the first reading fold into the opening balance", () => {
  const readings = [r(1, 50, D(5)), r(2, 40, D(6))];
  const purchases = [p(1, 60, D(1))];
  const segments = buildSegments(readings, purchases);
  assert.equal(purchaseLifetimes(segments, purchases, 50).length, 0);
});

test("a reading that jumps up with no purchase is flagged, not swallowed", () => {
  const readings = [r(1, 20, D(1)), r(2, 60, D(2))];
  const segments = buildSegments(readings, []);

  assert.equal(segments[0].suspect, true);
  assert.equal(segments[0].consumption, 0); // never negative
  assert.deepEqual(detectMissingPurchases(segments), [
    { from: D(1), to: D(2), units: 40 },
  ]);
});

test("mistype guard rejects a reading higher than any purchase explains", () => {
  const readings = [r(1, 42.1, D(1))];

  const noPurchase = expectedReadingRange(readings, [], 5, new Date(D(2)));
  assert.ok(noPurchase);
  // 120 after a 42.1 balance is impossible without a top-up.
  assert.equal(noPurchase.ceiling, 42.1);
  assert.ok(120 > noPurchase.plausibleHigh);
  assert.equal(noPurchase.expected, 37.1); // 42.1 - 5/day

  // Log the purchase and the same reading becomes legitimate.
  const withPurchase = expectedReadingRange(
    readings,
    [p(1, 90, D(1, 12))],
    5,
    new Date(D(2))
  );
  assert.ok(withPurchase);
  assert.equal(withPurchase.ceiling, 132.1);
  assert.equal(withPurchase.pendingUnits, 90);
  assert.ok(120 <= withPurchase.plausibleHigh);
});

test("a flat stretch of meter is offered as a possible unlogged outage", () => {
  const readings = [
    r(1, 100, D(1)),
    r(2, 99.5, D(1, 6)), // 0.5 kWh in 6h: something was off
    r(3, 90, D(2)), // normal draw
  ];
  const segments = buildSegments(readings, []);
  const suspected = detectSuspectedOutages(segments, 10);

  assert.equal(suspected.length, 1);
  assert.equal(suspected[0].from, D(1));
  assert.equal(suspected[0].to, D(1, 6));
});

test("an already-logged outage is not re-offered as a suspected one", () => {
  const readings = [r(1, 100, D(1)), r(2, 99.5, D(1, 6))];
  const outages = [{ start_at: D(1, 1), end_at: D(1, 5) }];
  const segments = buildSegments(readings, [], outages);

  assert.equal(segments[0].outageHours, 4);
  assert.equal(segments[0].activeHours, 2);
  assert.deepEqual(detectSuspectedOutages(segments, 10), []);
});

test("a logging gap keeps its exact total but reports what happened inside", () => {
  const readings = [r(1, 20, D(1)), r(2, 45, D(9))];
  const purchases = [p(1, 60, D(4))];
  const segments = buildSegments(readings, purchases);
  const lifetimes = purchaseLifetimes(segments, purchases, 20, new Date(D(9)));
  const gaps = detectLoggingGaps(segments, lifetimes);

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].days, 8);
  assert.equal(gaps[0].consumption, 35); // 20 + 60 - 45, still exact
  assert.equal(gaps[0].purchaseCount, 1);
  // The opening 20 units must have run out somewhere in there.
  assert.equal(gaps[0].depletionsInside, 0); // the opening lot is not a purchase
  assert.equal(lifetimes[0].started, true);
});

test("a window that cuts a segment in half is prorated and says so", () => {
  const readings = [r(1, 100, D(1)), r(2, 80, D(3))];
  const segments = buildSegments(readings, []);
  const half = consumptionBetween(segments, new Date(D(2)), new Date(D(4)));

  assert.equal(half.units, 10);
  assert.equal(half.estimated, true);
  assert.equal(half.hasData, true);
});

test("a segment bridging a long break must not be averaged into a recent rate", () => {
  // Log, stop for five months, log again. The bridging segment ENDS recently
  // but SPANS the whole gap, so windowing on its end date spreads a few kWh
  // over months and collapses the burn rate to nearly zero.
  const readings = [
    r(1, 40, D(1)),
    r(2, 10, D(4)), // 30 kWh over 3 days = 10/day
    r(3, 9.5, D(160)), // the bridge: 0.5 kWh over 156 days
    r(4, 4.5, D(161)), // 5 kWh over 1 day
  ];
  const segments = buildSegments(readings, []);
  const now = new Date(D(161));
  const cutoff = now.getTime() - 30 * 86_400_000;

  const byEnd = segments.filter((s) => new Date(s.to).getTime() >= cutoff);
  const byStart = segments.filter((s) => new Date(s.from).getTime() >= cutoff);

  // Without the long-segment guard the bridge buries the real rate. This is
  // what the dashboard was doing: 0.03 kWh/day, and a runs-out date in 2055.
  const unguarded = burnRateFrom(byEnd, 3, 3, Number.POSITIVE_INFINITY);
  assert.ok(unguarded !== null && unguarded.rate < 1, `got ${unguarded?.rate}`);

  // Windowing on the start date drops the bridge before it can do damage, and
  // too little is left to be sure, so it declines rather than guessing.
  assert.equal(burnRateFrom(byStart), null);

  // And the full-history fallback must survive the same bridge: it drops any
  // segment too long to describe a daily rate, so the answer reflects the days
  // that were actually logged (10/day and 5/day), not the hole between them.
  const fallback = burnRateFrom(segments);
  assert.ok(
    fallback !== null && fallback.rate > 8 && fallback.rate < 10,
    `expected ~8.75 kWh/day, got ${fallback?.rate}`
  );
});

test("one reading is not enough to build a ledger", () => {
  assert.deepEqual(buildSegments([r(1, 20, D(1))], []), []);
  assert.equal(expectedReadingRange([], [], 5), null);
});
