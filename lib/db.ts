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

    INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'TZS');
    INSERT OR IGNORE INTO settings (key, value) VALUES ('meter_no', '');
  `);
}
