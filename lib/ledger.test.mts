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
  estimateOutageEnds,
  hourlyProfile,
  monthComparison,
  weeklyChanges,
  currentBurnRate,
  eatWeekStart,
  eatMonthStart,
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

test("a top-up merges into the balance: the old purchase ends, the new one runs", () => {
  // The meter shows 1.05, a 23.8 token goes in, the display reads 24.85. It
  // does not queue the new units behind the old ones.
  const readings = [r(1, 20, D(1)), r(2, 1.05, D(10)), r(3, 24.85, D(10, 0, 2))];
  const purchases = [p(1, 23.8, D(1, 0, 5)), p(2, 23.8, D(10, 0, 1))];

  const segments = buildSegments(readings, purchases);
  const [first, second] = purchaseLifetimes(segments, purchases, 20, new Date(D(11)));

  assert.equal(first.running, false);
  assert.equal(first.exhaustedAt, null); // topped up, never ran dry
  assert.equal(first.days, 9); // purchase to purchase

  assert.equal(second.running, true);
  assert.equal(second.startedAt, D(10, 0, 1));
  assert.equal(second.unitsRemaining, 24.9); // the merged balance
});

test("a purchase that runs the meter dry ends there, not at the next top-up", () => {
  const readings = [
    r(1, 20, D(1)),
    r(2, 10, D(2)), // 10/day
    r(3, 0, D(4)), // empty somewhere in here
    r(4, 30, D(5)),
  ];
  const purchases = [p(1, 0.001, D(1, 0, 1)), p(2, 30, D(4, 12))];
  const segments = buildSegments(readings, purchases);
  const [first] = purchaseLifetimes(segments, purchases, 20, new Date(D(6)));

  // 10 units at 10/day from D2: ran out around D3, not at D4.12.
  assert.equal(first.exhaustedEstimated, true);
  const off = Math.abs(new Date(first.exhaustedAt!).getTime() - Date.parse(D(3)));
  assert.ok(off < 60_000, `got ${first.exhaustedAt}`);
});

test("an outage end logged on coming home is pulled back to when the meter woke up", () => {
  // 2.4/day = 0.1 per hour. Cut at 01:00, logged back at 13:00, but the
  // segment used 0.1 (before the cut) + 0.3 more: three hours of power.
  const readings = [r(1, 10, D(1)), r(2, 9.6, D(1, 13))];
  const outages = [{ id: 7, start_at: D(1, 1), end_at: D(1, 13) }];
  const segments = buildSegments(readings, [], outages);
  const [est] = estimateOutageEnds(segments, outages, 2.4);

  assert.equal(est.outageId, 7);
  assert.equal(est.estimatedEnd, D(1, 10));
  assert.equal(est.unitsAfter, 0.3);

  // A meter that did not move agrees with the logged end: nothing to offer.
  const still = buildSegments([r(1, 10, D(1)), r(2, 9.9, D(1, 13))], [], outages);
  assert.deepEqual(estimateOutageEnds(still, outages, 2.4), []);

  // Never logged as over at all: the first reading that shows use settles it.
  const open = [{ id: 8, start_at: D(1, 1), end_at: null }];
  const [ongoing] = estimateOutageEnds(segments, open, 2.4);
  assert.equal(ongoing.loggedEnd, null);
  assert.equal(ongoing.estimatedEnd, D(1, 10));
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

test("a window's rate divides by the days it covers, not by a different set", () => {
  // The dashboard's 7-day average added a prorated slice of a straddling
  // segment on top, but only divided by segments that started inside.
  const readings = [r(1, 30, D(1)), r(2, 20, D(5)), r(3, 18, D(6))];
  const segments = buildSegments(readings, []);
  const w = consumptionBetween(segments, new Date(D(4)), new Date(D(6)));

  assert.equal(w.units, 4.5); // 2.5 prorated + 2
  assert.equal(w.days, 2);
  assert.equal(w.activeDays, 2);
});

test("the hour profile splits a stretch across the hours it spans", () => {
  // 00:00 to 10:00 EAT is 21:00 to 07:00 UTC the day before.
  const readings = [r(1, 10, D(1, 21)), r(2, 5, D(2, 7))];
  const { units, hours } = hourlyProfile(buildSegments(readings, []));

  for (let h = 0; h < 10; h++) assert.ok(Math.abs(units[h] - 0.5) < 1e-9, `hour ${h}`);
  assert.equal(units[10], 0);
  assert.equal(hours.reduce((a, b) => a + b, 0), 10);

  // A stretch longer than a day says how much, not when: left out.
  const long = buildSegments([r(1, 10, D(1)), r(2, 5, D(3))], []);
  assert.equal(hourlyProfile(long).units.reduce((a, b) => a + b, 0), 0);
});

test("months compare per day of data, so a short month is not read as a drop", () => {
  // 9 days of September at 1.5/day, 3 days of October at 3/day.
  const readings = [r(1, 50, D(21, 21)), r(2, 36.5, D(30, 21)), r(3, 27.5, D(33, 21))];
  const now = new Date(D(33, 21)); // 4 Oct 00:00 EAT
  const m = monthComparison(buildSegments(readings, []), now);

  assert.equal(m.lastPerDay, 1.5);
  assert.equal(m.thisPerDay, 3);
  assert.equal(m.deltaPct, 100); // the old totals said "down 33%"
});

test("weeks are EAT Mondays and a week in progress is never compared", () => {
  // Monday 7 Sept 00:00 EAT is Sunday 6 Sept 21:00 UTC.
  assert.equal(eatWeekStart(new Date(D(9, 12))).toISOString(), D(6, 21));
  // 30 Sept 23:00 EAT is still September; 01:00 EAT the next hour is October.
  assert.equal(eatMonthStart(new Date(D(30, 20)), 1).toISOString(), D(30, 21));
  assert.equal(eatMonthStart(new Date(D(30, 22))).toISOString(), D(30, 21));

  // Six whole weeks at 10/day, then a sixth week double that, then 2 days in.
  const readings = [r(1, 1000, D(6, 21))];
  let bal = 1000;
  for (let w = 1; w <= 6; w++) {
    bal -= w === 6 ? 140 : 70;
    readings.push(r(w + 1, bal, D(6 + 7 * w, 21)));
  }
  readings.push(r(9, bal - 2, D(6 + 42 + 2, 21)));
  const { changes, completeWeeks } = weeklyChanges(
    buildSegments(readings, []),
    new Date(D(6 + 42 + 2, 21))
  );

  assert.equal(completeWeeks, 6);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].direction, "above");
  assert.equal(changes[0].deviation, 100);
});

test("a multi-day unlogged stretch (time away) does not set the daily rate", () => {
  // 3/day at home, then five days away at 1/day, then home again.
  const readings = [
    r(1, 100, D(1)),
    r(2, 97, D(2)),
    r(3, 94, D(3)),
    r(4, 89, D(8)), // the away bridge
    r(5, 86, D(9)),
  ];
  const burn = currentBurnRate(buildSegments(readings, []), new Date(D(9)));
  assert.ok(burn !== null && Math.abs(burn.rate - 3) < 1e-9, `got ${burn?.rate}`);
});
