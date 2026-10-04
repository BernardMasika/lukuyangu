import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { startOfDayEAT } from "@/lib/utils";
import {
  buildSegments,
  currentBurnRate,
  consumptionBetween,
  eatMonthStart,
  purchaseLifetimes,
  detectMissingPurchases,
  detectSuspectedOutages,
  detectLoggingGaps,
  estimateOutageEnds,
  detectSpikes,
  type ReadingRow,
  type PurchaseRow,
  type OutageRow,
} from "@/lib/ledger";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export async function GET() {
  // One pass over the whole history. Everything below is derived from the same
  // ledger, so the dashboard, the plan page and analytics cannot disagree.
  const [readingsResult, purchasesResult, outagesResult, investigationsResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM readings ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT * FROM purchases ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT id, start_at, end_at FROM outages", args: [] }),
    db.execute({ sql: "SELECT seg_from, seg_to FROM investigations", args: [] }),
  ]);

  const readings = readingsResult.rows as unknown as ReadingRow[];
  const purchases = purchasesResult.rows as unknown as PurchaseRow[];
  const outages = outagesResult.rows as unknown as OutageRow[];

  const segments = buildSegments(readings, purchases, outages);
  const now = new Date();

  // --- Balance -------------------------------------------------------------
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;
  const latestReading = latest ? latest.reading : null;
  // A token entered after the last reading is already on the meter.
  const pendingUnits = latest
    ? purchases
        .filter((p) => new Date(p.created_at) > new Date(latest.created_at))
        .reduce((sum, p) => sum + p.units, 0)
    : 0;
  const balance = latestReading !== null ? latestReading + pendingUnits : null;

  // --- Burn rate -----------------------------------------------------------
  const burn = currentBurnRate(segments, now);
  const burnRate = burn ? burn.rate : null;

  // --- Today ---------------------------------------------------------------
  // Counted in Dar time, and accumulated across a top-up rather than reset.
  const dayStart = startOfDayEAT(now);
  const today = consumptionBetween(segments, dayStart, now);
  const todayUsage = today.hasData ? today.units : null;

  // --- Last 7 days, and the 7 before for a trend ---------------------------
  // Units and active days come from the same prorated window. Below a full day
  // of data it says nothing: an evening is not a weekly average.
  const avgOver = (from: number, to: number, minDays: number) => {
    const w = consumptionBetween(segments, new Date(from), new Date(to));
    return w.activeDays >= minDays ? w.units / w.activeDays : null;
  };
  const avg7 = avgOver(now.getTime() - 7 * DAY, now.getTime(), 1);
  const prev7 = avgOver(now.getTime() - 14 * DAY, now.getTime() - 7 * DAY, 2);
  const trendPct =
    avg7 !== null && prev7 !== null && prev7 > 0
      ? Math.round(((avg7 - prev7) / prev7) * 100)
      : null;

  // --- Prediction ----------------------------------------------------------
  // Projected from the last reading, not from now: stop logging for three days
  // and the meter has still been burning for three days.
  let daysRemaining: number | null = null;
  let runsOutAt: string | null = null;
  if (burnRate !== null && burnRate > 0 && latest && balance !== null && balance > 0) {
    const runsOutMs = new Date(latest.created_at).getTime() + (balance / burnRate) * DAY;
    runsOutAt = new Date(runsOutMs).toISOString();
    daysRemaining = Math.max(0, (runsOutMs - now.getTime()) / DAY);
  }
  // What the meter most likely shows right now.
  const projectedBalance =
    daysRemaining !== null && burnRate !== null ? daysRemaining * burnRate : balance;

  // --- Purchase lifetimes (top-up model) ----------------------------------
  const lifetimes = purchaseLifetimes(segments, purchases, 0, now);
  const currentPurchase = lifetimes.find((l) => l.running) ?? null;
  const lastFinished =
    [...lifetimes].reverse().find((l) => l.exhaustedAt !== null) ?? null;
  const estimatedTotalDays =
    currentPurchase && burnRate !== null && burnRate > 0
      ? // Days so far plus what the merged balance still buys, since a top-up
        // includes whatever was left on the meter.
        Math.round(
          (currentPurchase.days + currentPurchase.unitsRemaining / burnRate) * 10
        ) / 10
      : null;

  // --- Spending, this EAT month (SQL 'now' is UTC) -------------------------
  const monthStart = eatMonthStart(now);
  const spentThisMonth = purchases
    .filter((p) => new Date(p.created_at) >= monthStart)
    .reduce((sum, p) => sum + p.amount_tzs, 0);

  // --- Outages overlapping this EAT month, the ongoing one included --------
  let outageHoursThisMonth = 0;
  let outageCount = 0;
  let activeOutage = false;
  for (const o of outages) {
    if (!o.end_at) activeOutage = true;
    const start = Math.max(new Date(o.start_at).getTime(), monthStart.getTime());
    const end = o.end_at ? new Date(o.end_at).getTime() : now.getTime();
    if (end <= start) continue;
    outageHoursThisMonth += (end - start) / 3_600_000;
    outageCount++;
  }

  // --- Things worth asking the user about ----------------------------------
  const missingPurchases = detectMissingPurchases(segments).slice(-3);
  const suspectedOutages =
    burnRate !== null ? detectSuspectedOutages(segments, burnRate).slice(-3) : [];
  const loggingGaps = detectLoggingGaps(segments, lifetimes).slice(-3);
  const outageEnds =
    burnRate !== null ? estimateOutageEnds(segments, outages, burnRate).slice(-3) : [];
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

  const round = (n: number | null) =>
    n !== null ? Math.round(n * 10) / 10 : null;

  return NextResponse.json({
    // Balance and usage
    latestReading,
    latestReadingAt: latest ? latest.created_at : null,
    todayUsage: round(todayUsage),
    todayEstimated: today.estimated,
    avg7: round(avg7),
    burnRate: round(burnRate),
    burnRateDays: burn ? burn.activeDays : null,
    trendPct,
    balance: round(balance),
    projectedBalance: round(projectedBalance),
    daysRemaining: round(daysRemaining),
    runsOutAt,
    spentThisMonth: Math.round(spentThisMonth),
    readingCount: readings.length,
    hasLoggedToday:
      latest !== null && new Date(latest.created_at) >= dayStart,

    // Which purchase is actually being burned, and how it is going
    currentPurchase: currentPurchase
      ? { ...currentPurchase, estimatedTotalDays }
      : null,
    lastFinishedPurchase: lastFinished,

    // Outages
    outageHoursThisMonth: Math.round(outageHoursThisMonth * 10) / 10,
    outageCount,
    activeOutage,

    // Detections the UI turns into one-tap questions
    missingPurchases,
    suspectedOutages,
    loggingGaps,
    outageEnds,
    newSpikes,
  });
}
