/**
 * Archive the whole database to CSV, then optionally clear it for a new house.
 *
 *   npm run archive          dump only, nothing is deleted
 *   npm run reset -- --yes   dump, then delete every reading, purchase and outage
 *
 * The dump always runs first and the delete refuses to proceed unless it
 * succeeded, so there is no path that destroys data without a copy on disk.
 */

import { createClient } from "@libsql/client";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const WIPE = process.argv.includes("--yes");
const TABLES = ["readings", "purchases", "outages", "settings"] as const;

/** Rows are user-entered free text, so quote everything and double the quotes. */
function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) =>
    v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`;
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(",")),
  ].join("\n");
}

const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = join("backups", stamp);
mkdirSync(dir, { recursive: true });

const snapshot: Record<string, Record<string, unknown>[]> = {};
let total = 0;

for (const table of TABLES) {
  const result = await db.execute(`SELECT * FROM ${table} ORDER BY rowid ASC`);
  const rows = result.rows as unknown as Record<string, unknown>[];
  snapshot[table] = rows;
  total += rows.length;

  writeFileSync(join(dir, `${table}.csv`), toCsv(rows), "utf8");
  console.log(`  ${table.padEnd(10)} ${String(rows.length).padStart(4)} rows`);
}

// A single JSON file too, because re-importing from CSV means re-parsing types.
writeFileSync(join(dir, "snapshot.json"), JSON.stringify(snapshot, null, 2), "utf8");

console.log(`\nArchived ${total} rows to ${dir}`);

if (!WIPE) {
  console.log("\nArchive only. Nothing was deleted.");
  console.log("To clear the database for a new house: npm run reset -- --yes");
  process.exit(0);
}

console.log("\nClearing history for the new house...");

await db.batch(
  [
    "DELETE FROM readings",
    "DELETE FROM purchases",
    "DELETE FROM outages",
    // The meter number belongs to the old house, and a cached AI analysis of
    // data that no longer exists would be worse than none.
    "DELETE FROM settings WHERE key IN ('meter_no', 'insight_cache')",
    "INSERT OR IGNORE INTO settings (key, value) VALUES ('meter_no', '')",
    // SQLite keeps handing out the old ids otherwise, which is confusing when
    // the first reading of a new house is number 64.
    "DELETE FROM sqlite_sequence WHERE name IN ('readings','purchases','outages')",
  ],
  "write"
);

for (const table of TABLES) {
  const result = await db.execute(`SELECT COUNT(*) as c FROM ${table}`);
  const count = Number((result.rows[0] as unknown as { c: number }).c);
  console.log(`  ${table.padEnd(10)} ${String(count).padStart(4)} rows`);
}

console.log(`\nDone. The old house is preserved in ${dir}`);
