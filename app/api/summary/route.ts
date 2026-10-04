import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { formatDateEAT, TZ } from "@/lib/utils";
import {
  buildSegments,
  currentBurnRate,
  eatMonthStart,
  monthComparison,
  weeklyChanges,
  type ReadingRow,
  type PurchaseRow,
  type OutageRow,
} from "@/lib/ledger";

export const dynamic = "force-dynamic";

/** Clipboard text for pasting into an AI chat. Every number comes from the
 *  same ledger the app shows, so the summary cannot contradict the screen. */
export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") || "en";
  const sw = lang === "sw";

  const [readingsResult, purchasesResult, outagesResult] = await Promise.all([
    db.execute({ sql: "SELECT * FROM readings ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT * FROM purchases ORDER BY created_at ASC", args: [] }),
    db.execute({ sql: "SELECT start_at, end_at FROM outages", args: [] }),
  ]);
  const readings = readingsResult.rows as unknown as ReadingRow[];
  const purchases = purchasesResult.rows as unknown as PurchaseRow[];
  const outages = outagesResult.rows as unknown as OutageRow[];

  const now = new Date();
  const segments = buildSegments(readings, purchases, outages);
  const burn = currentBurnRate(segments, now);
  const months = monthComparison(segments, now);
  const { changes } = weeklyChanges(segments, now);

  // Cost: spend this EAT month, and what the electricity used costs a day.
  const monthStart = eatMonthStart(now);
  const thisMonth = purchases.filter((p) => new Date(p.created_at) >= monthStart);
  const totalSpent = thisMonth.reduce((s, p) => s + p.amount_tzs, 0);
  const allUnits = purchases.reduce((s, p) => s + p.units, 0);
  const allSpent = purchases.reduce((s, p) => s + p.amount_tzs, 0);
  const avgCostKwh = allUnits > 0 ? allSpent / allUnits : 0;
  const useCostDay = burn ? burn.rate * avgCostKwh : 0;

  const recent = readings.slice(-7).reverse();
  const monthName = now.toLocaleString(sw ? "sw-TZ" : "en-US", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  });
  const perDay = sw ? "kWh/siku" : "kWh/day";
  const arrow =
    months.deltaPct !== null ? (months.deltaPct > 0 ? "↑" : "↓") : "";

  let summary = `Luku Yangu, ${monthName}\n\n`;
  summary += `${sw ? "Matumizi" : "Consumption"}:\n`;
  summary += `- ${sw ? "Wastani wa siku" : "Daily average"}: ${burn ? burn.rate.toFixed(1) : "N/A"} ${perDay} (${sw ? "saa za umeme tu, siku 30 zilizopita" : "powered hours only, last 30 days"})\n`;
  summary += `- ${sw ? "Mwezi huu hadi sasa" : "This month so far"}: ${months.thisMonth.units.toFixed(1)} kWh${months.thisPerDay !== null ? ` (${months.thisPerDay} ${perDay})` : ""}\n`;
  summary += `- ${sw ? "Mwezi uliopita" : "Last month"}: ${months.lastMonth.units.toFixed(1)} kWh${months.lastPerDay !== null ? ` (${months.lastPerDay} ${perDay})` : ""}${months.deltaPct !== null ? `, ${arrow} ${Math.abs(months.deltaPct)}% ${sw ? "kwa siku" : "per day"}` : ""}\n\n`;

  summary += `${sw ? "Gharama" : "Cost"}:\n`;
  summary += `- ${sw ? "Jumla mwezi huu" : "Total spent this month"}: TZS ${totalSpent.toLocaleString()}\n`;
  summary += `- ${sw ? "Gharama ya matumizi kwa siku" : "Cost of use per day"}: TZS ${Math.round(useCostDay).toLocaleString()}\n`;
  summary += `- ${sw ? "Wastani gharama/kWh" : "Average cost per kWh"}: TZS ${Math.round(avgCostKwh).toLocaleString()}\n\n`;

  summary += `${sw ? "Wiki zilizobainika" : "Flagged weeks"}:\n`;
  if (changes.length > 0) {
    for (const c of changes) {
      const dir =
        c.direction === "above" ? (sw ? "juu ya" : "above") : sw ? "chini ya" : "below";
      summary += `- ${sw ? "Wiki ya" : "Week of"} ${formatDateEAT(c.weekStart)}: ${c.consumption.toFixed(1)} kWh (${Math.abs(c.deviation)}% ${dir} ${sw ? "msingi" : "baseline"} ${c.baseline} kWh/${sw ? "wiki" : "week"})\n`;
    }
  } else {
    summary += `- ${sw ? "Hakuna mabadiliko yaliyobainika" : "No anomalies detected"}\n`;
  }

  summary += `\n${sw ? "Usomaji wa hivi karibuni (7 za mwisho)" : "Recent readings (last 7)"}:\n`;
  for (const r of recent) {
    summary += `- ${formatDateEAT(r.created_at)}: ${r.reading} kWh\n`;
  }

  summary += `\n${sw ? "Unaona mifumo gani? Nini kinaweza kuelezea kupanda au kushuka? Mapendekezo yoyote ya kupunguza matumizi?" : "What patterns do you see? What could explain any spikes or drops? Any suggestions to reduce consumption?"}`;

  return NextResponse.json({ summary });
}
