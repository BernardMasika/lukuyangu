/**
 * Print the ledger for the live database, segment by segment.
 *
 *   npm run inspect
 *
 * This is the "show your working" tool. When a number on the dashboard looks
 * wrong, this shows every reading pair, what was credited to it, and how each
 * purchase lifetime was derived, so the arithmetic can be argued with.
 */

import { createClient } from "@libsql/client";
import {
  buildSegments,
  burnRateFrom,
  consumptionBetween,
  purchaseLifetimes,
  detectMissingPurchases,
  detectSuspectedOutages,
  detectLoggingGaps,
  type ReadingRow,
  type PurchaseRow,
  type OutageRow,
} from "../lib/ledger.ts";

const TZ = "Africa/Dar_es_Salaam";
const fmt = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "—";

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const [readings, purchases, outages] = await Promise.all([
  db
    .execute("SELECT * FROM readings ORDER BY created_at ASC")
    .then((r) => r.rows as unknown as ReadingRow[]),
  db
    .execute("SELECT * FROM purchases ORDER BY created_at ASC")
    .then((r) => r.rows as unknown as PurchaseRow[]),
  db
    .execute("SELECT start_at, end_at FROM outages")
    .then((r) => r.rows as unknown as OutageRow[]),
]);

console.log(
  `\n${readings.length} readings, ${purchases.length} purchases, ${outages.length} outages\n`
);

const segments = buildSegments(readings, purchases, outages);

console.log("SEGMENTS  (start + bought - end = used)");
console.log("-".repeat(96));
for (const s of segments) {
  const flag = s.suspect ? `  !! ${s.unaccountedUnits} units unaccounted` : "";
  const bought = s.purchasedUnits > 0 ? `+${s.purchasedUnits}` : "    ";
  const out = s.outageHours > 0 ? ` (outage ${s.outageHours.toFixed(1)}h)` : "";
  console.log(
    `${fmt(s.from)} -> ${fmt(s.to)}  ${s.startBalance.toFixed(1).padStart(7)} ${bought.padStart(7)} ` +
      `-> ${s.endBalance.toFixed(1).padStart(7)}  = ${s.consumption.toFixed(1).padStart(6)} kWh  ` +
      `over ${s.hours.toFixed(1).padStart(6)}h  ${(s.rate ?? 0).toFixed(1).padStart(6)} kWh/day${out}${flag}`
  );
}

const burn = burnRateFrom(segments);
console.log("\nBURN RATE");
console.log("-".repeat(96));
console.log(
  burn
    ? `${burn.rate.toFixed(2)} kWh per active day  (${burn.consumption} kWh over ${burn.activeDays} active days)`
    : "not enough data (needs 3 readings across 3 days)"
);

const openingBalance = readings.length > 0 ? readings[0].reading : 0;
const lifetimes = purchaseLifetimes(segments, purchases, openingBalance);

console.log("\nPURCHASE LIFETIMES  (FIFO: old units burn first)");
console.log("-".repeat(96));
for (const l of lifetimes) {
  if (!l.started) {
    console.log(
      `#${l.purchaseId}  ${l.units} kWh @ TZS ${l.tzsPerUnit}/unit  ` +
        `QUEUED, not started after ${l.idleDaysBeforeStart}d, ${l.unitsRemaining} kWh still unburned`
    );
    continue;
  }
  const ended = l.exhaustedAt
    ? `ran out ${fmt(l.exhaustedAt)}${l.exhaustedEstimated ? " (estimated)" : ""}`
    : `running, ${l.unitsRemaining} kWh left`;
  console.log(
    `#${l.purchaseId}  ${l.units} kWh @ TZS ${l.tzsPerUnit}/unit  ` +
      `started ${fmt(l.startedAt)}  ${ended}  lasted ${l.days}d` +
      (l.idleDaysBeforeStart > 0 ? `  (sat ${l.idleDaysBeforeStart}d first)` : "")
  );
}

console.log("\nTODAY");
console.log("-".repeat(96));
const now = new Date();
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(now);
const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
const dayStart = new Date(`${g("year")}-${g("month")}-${g("day")}T00:00:00+03:00`);
const today = consumptionBetween(segments, dayStart, now);
console.log(
  today.hasData
    ? `${today.units} kWh since midnight EAT${today.estimated ? " (part estimated)" : ""}`
    : "no readings today"
);

console.log("\nFLAGS");
console.log("-".repeat(96));
const missing = detectMissingPurchases(segments);
const suspected = burn ? detectSuspectedOutages(segments, burn.rate) : [];
const gaps = detectLoggingGaps(segments, lifetimes);

for (const m of missing)
  console.log(`missing purchase? ~${m.units} kWh appeared ${fmt(m.from)} -> ${fmt(m.to)}`);
for (const s of suspected)
  console.log(
    `unlogged outage?  ${fmt(s.from)} -> ${fmt(s.to)}  ${s.rate} vs ${s.baseline} kWh/day over ${s.hours}h`
  );
for (const gp of gaps)
  console.log(
    `logging gap       ${fmt(gp.from)} -> ${fmt(gp.to)}  ${gp.days}d, ${gp.consumption} kWh, ${gp.purchaseCount} purchases inside`
  );
if (!missing.length && !suspected.length && !gaps.length) console.log("none");

console.log();
