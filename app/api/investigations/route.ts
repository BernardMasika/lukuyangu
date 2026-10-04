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
  isReadingPair,
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

  // A new pin must be a real stretch: two readings with nothing between. A
  // pin that already has a row stays editable even after its readings change,
  // or the notes on a "readings changed" pin could never be updated.
  const [between, existing] = await Promise.all([
    db.execute({
      sql: "SELECT created_at FROM readings WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC LIMIT 3",
      args: [v.seg_from, v.seg_to],
    }),
    db.execute({
      sql: "SELECT id FROM investigations WHERE seg_from = ? AND seg_to = ?",
      args: [v.seg_from, v.seg_to],
    }),
  ]);
  const times = between.rows.map((r) => String((r as unknown as { created_at: string }).created_at));
  if (existing.rows.length === 0 && !isReadingPair(times, v.seg_from, v.seg_to)) {
    return NextResponse.json(
      { error: "seg_from and seg_to must be two consecutive readings" },
      { status: 400 }
    );
  }

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
