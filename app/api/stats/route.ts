import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { startOfDayEAT } from "@/lib/utils";
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
} from "@/lib/ledger";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export async function GET() {
  // One pass over the whole history. Everything below is derived from the same
  // ledger, so the dashboard, the plan page and analytics cannot disagree.
  const [readingsResult, purchasesResult, outagesResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM readings ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT * FROM purchases ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT start_at, end_at FROM outages", args: [] }),
  ]);

  const readings = readingsResult.rows as unknown as ReadingRow[];
  const purchases = purchasesResult.rows as unknown as PurchaseRow[];
  const outages = outagesResult.rows as unknown as OutageRow[];

  const segments = buildSegments(readings, purchases, outages);
  const now = new Date();

  // --- Balance -------------------------------------------------------------
  const latest = readings.length > 0 ? readings[readings.length - 1] : null;
  const latestReading = latest ? latest.reading : null;

  // --- Burn rate -----------------------------------------------------------
  // Prefer the last 30 days, fall back to everything when logging is sparse.
  //
  // The window must match on `from`, not `to`. After a break in logging the
  // bridging segment ends inside the window but starts months earlier, and
  // counting it spreads a few kWh over that whole span, which drags the rate
  // to nearly zero and pushes "runs out" years into the future.
  const cutoff = now.getTime() - 30 * DAY;
  const recent = segments.filter((s) => new Date(s.from).getTime() >= cutoff);
  const burn = burnRateFrom(recent) ?? burnRateFrom(segments);
  const burnRate = burn ? burn.rate : null;

  // --- Today ---------------------------------------------------------------
  // Counted in Dar time, and accumulated across a top-up rather than reset.
  const dayStart = startOfDayEAT(now);
  const today = consumptionBetween(segments, dayStart, now);
  const todayUsage = today.hasData ? today.units : null;

  // --- Last 7 days ---------------------------------------------------------
  const weekStart = new Date(now.getTime() - 7 * DAY);
  const week = consumptionBetween(segments, weekStart, now);
  const weekSegments = segments.filter(
    (s) => new Date(s.from).getTime() >= weekStart.getTime()
  );
  const weekActiveDays =
    weekSegments.reduce((sum, s) => sum + s.activeHours, 0) / 24;
  // Two hours of logging is not a weekly average. Dividing by a sliver of a day
  // turns a normal evening into "60 kWh/day", so below a full day it says
  // nothing rather than something alarming and wrong.
  const avg7 =
    week.hasData && weekActiveDays >= 1 ? week.units / weekActiveDays : null;

  // --- Prediction ----------------------------------------------------------
  let daysRemaining: number | null = null;
  let runsOutAt: string | null = null;
  if (burnRate !== null && burnRate > 0 && latestReading !== null && latestReading > 0) {
    daysRemaining = latestReading / burnRate;
    runsOutAt = new Date(now.getTime() + daysRemaining * DAY).toISOString();
  }

  // --- Purchase lifetimes (FIFO) -------------------------------------------
  const openingBalance = readings.length > 0 ? readings[0].reading : 0;
  const lifetimes = purchaseLifetimes(segments, purchases, openingBalance, now);

  // The purchase actually being burned right now is the earliest one that has
  // started and not yet run out. If none has started, the newest is queued.
  const inUse = lifetimes.find((l) => l.started && l.running) ?? null;
  const queued = inUse
    ? null
    : lifetimes.filter((l) => !l.started).slice(-1)[0] ?? null;
  const lastFinished =
    [...lifetimes].reverse().find((l) => l.exhaustedAt !== null) ?? null;

  const currentPurchase = inUse ?? queued;
  const estimatedTotalDays =
    currentPurchase && burnRate !== null && burnRate > 0
      ? Math.round((currentPurchase.units / burnRate) * 10) / 10
      : null;

  // --- Spending ------------------------------------------------------------
  const spentResult = await db.execute({
    sql: "SELECT COALESCE(SUM(amount_tzs), 0) as total FROM purchases WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
    args: [],
  });
  const spentThisMonth = Number(
    (spentResult.rows[0] as unknown as { total: number }).total
  );

  // --- Outages -------------------------------------------------------------
  const monthKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Dar_es_Salaam",
    year: "numeric",
    month: "2-digit",
  }).format(now);

  let outageHoursThisMonth = 0;
  let outageCount = 0;
  let activeOutage = false;
  for (const o of outages) {
    if (!o.end_at) {
      activeOutage = true;
      continue;
    }
    if (!o.start_at.startsWith(monthKey.slice(0, 7))) continue;
    outageHoursThisMonth +=
      (new Date(o.end_at).getTime() - new Date(o.start_at).getTime()) / 3_600_000;
    outageCount++;
  }

  // --- Things worth asking the user about ----------------------------------
  const missingPurchases = detectMissingPurchases(segments).slice(-3);
  const suspectedOutages =
    burnRate !== null ? detectSuspectedOutages(segments, burnRate).slice(-3) : [];
  const loggingGaps = detectLoggingGaps(segments, lifetimes).slice(-3);

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
  });
}
