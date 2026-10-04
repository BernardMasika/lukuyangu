import { createClient, type Client } from "@libsql/client";

let _db: Client | null = null;

export function getDb(): Client {
  if (!_db) {
    _db = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return _db;
}

// Keep `db` as a convenience getter for existing imports
export const db = new Proxy({} as Client, {
  get(_target, prop) {
    const value = (getDb() as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(getDb()) : value;
  },
});

export async function initDb() {
  const client = getDb();
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reading REAL NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      units REAL NOT NULL,
      amount_tzs REAL NOT NULL,
      note TEXT DEFAULT '',
      vendor TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_at TEXT NOT NULL,
      end_at TEXT,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

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

    INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'TZS');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('meter_no', '');
  `);

  await migrate(client);
}

/** Columns added after the first release. SQLite has no ADD COLUMN IF NOT
 *  EXISTS, so each one is attempted and a duplicate-column error is ignored. */
async function migrate(client: Client) {
  const added: [string, string][] = [
    // Buying from an agent costs more per unit than M-Pesa or a bank app.
    ["purchases", "vendor TEXT DEFAULT ''"],
    // Pins the user placed by hand, as opposed to detected spikes.
    ["investigations", "origin TEXT NOT NULL DEFAULT 'auto'"],
  ];

  for (const [table, column] of added) {
    try {
      await client.execute(`ALTER TABLE ${table} ADD COLUMN ${column}`);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/duplicate column/i.test(message)) throw e;
    }
  }
}
