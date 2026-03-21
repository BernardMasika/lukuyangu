import { db } from "@/lib/db";
import { NextResponse } from "next/server";
import { calcBurnRate, calcDaysRemaining } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  // Get all readings ordered by time
  const readingsResult = await db.execute({
    sql: "SELECT * FROM readings ORDER BY created_at ASC",
    args: [],
  });
  const readings = readingsResult.rows as unknown as {
    id: number;
    reading: number;
    note: string;
    created_at: string;
  }[];

  // Get today's readings
  const todayResult = await db.execute({
    sql: "SELECT * FROM readings WHERE date(created_at) = date('now') ORDER BY created_at ASC",
    args: [],
  });
  const todayReadings = todayResult.rows as unknown as {
    reading: number;
    created_at: string;
  }[];

  // Today's usage
  let todayUsage: number | null = null;
  if (todayReadings.length >= 2) {
    const first = todayReadings[0].reading;
    const last = todayReadings[todayReadings.length - 1].reading;
    if (last < first) todayUsage = first - last;
    else todayUsage = 0;
  }

  // Last 7 days readings for burn rate
  const last7Result = await db.execute({
    sql: "SELECT * FROM readings WHERE created_at >= datetime('now', '-7 days') ORDER BY created_at ASC",
    args: [],
  });
  const last7 = last7Result.rows as unknown as {
    reading: number;
    created_at: string;
  }[];

  const burnRate = calcBurnRate(last7.length >= 3 ? last7 : readings);

  // 7-day avg
  let avg7: number | null = null;
  if (last7.length >= 2) {
    let total = 0;
    for (let i = 1; i < last7.length; i++) {
      if (last7[i].reading < last7[i - 1].reading) {
        total += last7[i - 1].reading - last7[i].reading;
      }
    }
    const firstDate = new Date(last7[0].created_at);
    const lastDate = new Date(last7[last7.length - 1].created_at);
    const days =
      (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
    if (days > 0) avg7 = total / days;
  }

  // Monthly spending
  const spentResult = await db.execute({
    sql: "SELECT COALESCE(SUM(amount_tzs), 0) as total FROM purchases WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')",
    args: [],
  });
  const spentThisMonth = Number(
    (spentResult.rows[0] as unknown as { total: number }).total
  );

  // Latest reading
  const latestReading =
    readings.length > 0 ? readings[readings.length - 1].reading : null;

  // Prediction
  let daysRemaining: number | null = null;
  if (burnRate && latestReading) {
    daysRemaining = calcDaysRemaining(latestReading, burnRate);
  }

  // Has logged today?
  const hasLoggedToday = todayReadings.length > 0;

  return NextResponse.json({
    todayUsage,
    avg7: avg7 !== null ? Math.round(avg7 * 10) / 10 : null,
    spentThisMonth: Math.round(spentThisMonth),
    burnRate: burnRate !== null ? Math.round(burnRate * 10) / 10 : null,
    latestReading,
    daysRemaining:
      daysRemaining !== null ? Math.round(daysRemaining * 10) / 10 : null,
    readingCount: readings.length,
    hasLoggedToday,
  });
}
