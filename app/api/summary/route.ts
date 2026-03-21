import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { calcBurnRate, detectChanges, formatDateEAT } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang") || "en";

  const readingsResult = await db.execute({
    sql: "SELECT * FROM readings ORDER BY created_at ASC",
    args: [],
  });
  const readings = readingsResult.rows as unknown as {
    reading: number;
    created_at: string;
  }[];

  // Last 7 days
  const last7 = readings.filter(
    (r) =>
      new Date(r.created_at).getTime() >
      Date.now() - 7 * 24 * 60 * 60 * 1000
  );
  const burnRate = calcBurnRate(last7.length >= 3 ? last7 : readings);

  // This month consumption
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthReadings = readings.filter((r) =>
    r.created_at.startsWith(monthKey)
  );
  let thisMonthConsumption = 0;
  for (let i = 1; i < thisMonthReadings.length; i++) {
    if (thisMonthReadings[i].reading < thisMonthReadings[i - 1].reading) {
      thisMonthConsumption +=
        thisMonthReadings[i - 1].reading - thisMonthReadings[i].reading;
    }
  }

  // Last month
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
  const lastMonthReadings = readings.filter((r) =>
    r.created_at.startsWith(lastMonthKey)
  );
  let lastMonthConsumption = 0;
  for (let i = 1; i < lastMonthReadings.length; i++) {
    if (lastMonthReadings[i].reading < lastMonthReadings[i - 1].reading) {
      lastMonthConsumption +=
        lastMonthReadings[i - 1].reading - lastMonthReadings[i].reading;
    }
  }

  const monthDelta =
    lastMonthConsumption > 0
      ? ((thisMonthConsumption - lastMonthConsumption) / lastMonthConsumption) *
        100
      : null;

  // Purchases
  const purchasesResult = await db.execute({
    sql: `SELECT * FROM purchases WHERE strftime('%Y-%m', created_at) = ? ORDER BY created_at DESC`,
    args: [monthKey],
  });
  const purchases = purchasesResult.rows as unknown as {
    units: number;
    amount_tzs: number;
  }[];

  const totalSpent = purchases.reduce((s, p) => s + p.amount_tzs, 0);
  const totalUnits = purchases.reduce((s, p) => s + p.units, 0);
  const daysInMonth = now.getDate();
  const avgCostDay = daysInMonth > 0 ? totalSpent / daysInMonth : 0;
  const avgCostKwh = totalUnits > 0 ? totalSpent / totalUnits : 0;

  // Changes
  const changes = detectChanges(readings);

  // Recent readings
  const recent = readings.slice(-7).reverse();

  const monthName = now.toLocaleString(lang === "sw" ? "sw-TZ" : "en-US", {
    month: "long",
    year: "numeric",
  });

  const arrow = monthDelta !== null ? (monthDelta > 0 ? "↑" : "↓") : "";

  let summary = `LUKU Tracker — ${monthName}\n\n`;
  summary += `${lang === "sw" ? "Matumizi" : "Consumption"}:\n`;
  summary += `- ${lang === "sw" ? "Wastani wa siku" : "Daily average"}: ${burnRate?.toFixed(1) ?? "N/A"} kWh/${lang === "sw" ? "siku" : "day"} (${lang === "sw" ? "siku 7 zilizopita" : "last 7 days"})\n`;
  summary += `- ${lang === "sw" ? "Mwezi huu hadi sasa" : "This month so far"}: ${thisMonthConsumption.toFixed(1)} kWh\n`;
  summary += `- ${lang === "sw" ? "Mwezi uliopita" : "Last month"}: ${lastMonthConsumption.toFixed(1)} kWh${monthDelta !== null ? ` (${arrow} ${Math.abs(monthDelta).toFixed(0)}%)` : ""}\n\n`;

  summary += `${lang === "sw" ? "Gharama" : "Cost"}:\n`;
  summary += `- ${lang === "sw" ? "Jumla mwezi huu" : "Total spent this month"}: TZS ${totalSpent.toLocaleString()}\n`;
  summary += `- ${lang === "sw" ? "Wastani gharama/siku" : "Average cost per day"}: TZS ${Math.round(avgCostDay).toLocaleString()}\n`;
  summary += `- ${lang === "sw" ? "Wastani gharama/kWh" : "Average cost per kWh"}: TZS ${Math.round(avgCostKwh).toLocaleString()}\n\n`;

  summary += `${lang === "sw" ? "Wiki zilizobainika" : "Flagged weeks"}:\n`;
  if (changes.length > 0) {
    for (const c of changes) {
      const dir = c.direction === "above" ? (lang === "sw" ? "juu ya" : "above") : (lang === "sw" ? "chini ya" : "below");
      summary += `- ${lang === "sw" ? "Wiki ya" : "Week of"} ${formatDateEAT(c.weekStart.toISOString())}: ${c.consumption.toFixed(1)} kWh (${Math.abs(c.deviation)}% ${dir} ${lang === "sw" ? "msingi" : "baseline"} ${c.baseline} kWh/${lang === "sw" ? "wiki" : "week"})\n`;
    }
  } else {
    summary += `- ${lang === "sw" ? "Hakuna mabadiliko yaliyobainika" : "No anomalies detected"}\n`;
  }

  summary += `\n${lang === "sw" ? "Usomaji wa hivi karibuni (7 za mwisho)" : "Recent readings (last 7)"}:\n`;
  for (const r of recent) {
    summary += `- ${formatDateEAT(r.created_at)}: ${r.reading} kWh\n`;
  }

  summary += `\n${lang === "sw" ? "Unaona mifumo gani? Nini kinaweza kuelezea kupanda au kushuka? Mapendekezo yoyote ya kupunguza matumizi?" : "What patterns do you see? What could explain any spikes or drops? Any suggestions to reduce consumption?"}`;

  return NextResponse.json({ summary });
}
