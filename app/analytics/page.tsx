"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import { formatDateEAT } from "@/lib/utils";
import ConsumptionChart from "@/components/ConsumptionChart";
import StatCard from "@/components/StatCard";

type Tab = "daily" | "weekly" | "monthly";

interface Reading {
  id: number;
  reading: number;
  created_at: string;
}

interface Change {
  weekStart: string;
  consumption: number;
  baseline: number;
  deviation: number;
  direction: "above" | "below";
}

export default function Analytics() {
  const { lang } = useLang();
  const [tab, setTab] = useState<Tab>("daily");
  const [readings, setReadings] = useState<Reading[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [purchases, setPurchases] = useState<
    { units: number; amount_tzs: number; created_at: string }[]
  >([]);
  const [copying, setCopying] = useState(false);

  const fetchData = useCallback(async () => {
    const [rRes, cRes, pRes] = await Promise.all([
      fetch("/api/readings"),
      fetch("/api/changes"),
      fetch("/api/purchases"),
    ]);
    const rData = await rRes.json();
    const cData = await cRes.json();
    const pData = await pRes.json();
    setReadings([...rData].reverse());
    setChanges(cData.changes || []);
    setPurchases(pData);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const buildDailyData = () => {
    const days = new Map<string, { first: number; last: number }>();
    for (const r of readings) {
      const day = r.created_at.slice(0, 10);
      if (!days.has(day)) {
        days.set(day, { first: r.reading, last: r.reading });
      } else {
        days.get(day)!.last = r.reading;
      }
    }

    const result: { label: string; value: number }[] = [];
    for (const [day, { first, last }] of days) {
      const consumption = first > last ? first - last : 0;
      result.push({
        label: day.slice(5),
        value: Math.round(consumption * 10) / 10,
      });
    }
    return result.slice(-30);
  };

  const buildWeeklyData = () => {
    const weeks = new Map<
      string,
      { readings: { reading: number; created_at: string }[] }
    >();
    for (const r of readings) {
      const d = new Date(r.created_at);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d);
      weekStart.setDate(diff);
      const key = weekStart.toISOString().slice(0, 10);
      if (!weeks.has(key)) weeks.set(key, { readings: [] });
      weeks.get(key)!.readings.push(r);
    }

    const result: { label: string; value: number }[] = [];
    for (const [weekKey, week] of weeks) {
      if (week.readings.length < 2) continue;
      let consumption = 0;
      for (let i = 1; i < week.readings.length; i++) {
        const prev = week.readings[i - 1].reading;
        const curr = week.readings[i].reading;
        if (curr < prev) consumption += prev - curr;
      }
      result.push({
        label: weekKey.slice(5),
        value: Math.round(consumption * 10) / 10,
      });
    }
    return result.slice(-8);
  };

  const buildMonthlyData = () => {
    const months = new Map<
      string,
      { readings: { reading: number; created_at: string }[] }
    >();
    for (const r of readings) {
      const key = r.created_at.slice(0, 7);
      if (!months.has(key)) months.set(key, { readings: [] });
      months.get(key)!.readings.push(r);
    }

    const result: { label: string; value: number }[] = [];
    for (const [monthKey, month] of months) {
      if (month.readings.length < 2) continue;
      let consumption = 0;
      for (let i = 1; i < month.readings.length; i++) {
        const prev = month.readings[i - 1].reading;
        const curr = month.readings[i].reading;
        if (curr < prev) consumption += prev - curr;
      }
      result.push({
        label: monthKey,
        value: Math.round(consumption * 10) / 10,
      });
    }
    return result.slice(-6);
  };

  const chartData =
    tab === "daily"
      ? buildDailyData()
      : tab === "weekly"
        ? buildWeeklyData()
        : buildMonthlyData();

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonthPurchases = purchases.filter((p) =>
    p.created_at.startsWith(monthKey)
  );
  const totalSpent = thisMonthPurchases.reduce((s, p) => s + p.amount_tzs, 0);
  const totalUnits = thisMonthPurchases.reduce((s, p) => s + p.units, 0);
  const daysElapsed = now.getDate();
  const avgCostDay = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const avgCostKwh = totalUnits > 0 ? totalSpent / totalUnits : 0;

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

  const handleCopy = async () => {
    setCopying(true);
    try {
      const res = await fetch(`/api/summary?lang=${lang}`);
      const data = await res.json();
      await navigator.clipboard.writeText(data.summary);
      setTimeout(() => setCopying(false), 2000);
    } catch {
      setCopying(false);
    }
  };

  const hasEnoughWeeks = readings.length > 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{tr("analytics.title", lang)}</h1>

      {/* Tabs */}
      <div className="flex rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
        {(["daily", "weekly", "monthly"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? "bg-[#003399] text-white"
                : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
            }`}
          >
            {tr(`analytics.${t}`, lang)}
          </button>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <ConsumptionChart data={chartData} />
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          {tr("nudge.noPrediction", lang)}
        </div>
      )}

      {/* Cost Summary */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label={tr("analytics.totalMonth", lang)}
          value={totalSpent > 0 ? `${Math.round(totalSpent).toLocaleString()}` : "—"}
          unit="TZS"
        />
        <StatCard
          label={tr("analytics.avgDay", lang)}
          value={avgCostDay > 0 ? Math.round(avgCostDay).toLocaleString() : "—"}
          unit="TZS"
        />
        <StatCard
          label={tr("analytics.avgKwh", lang)}
          value={avgCostKwh > 0 ? Math.round(avgCostKwh).toLocaleString() : "—"}
          unit="TZS"
        />
      </div>

      {/* Month comparison */}
      {monthDelta !== null && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {tr("analytics.vsLastMonth", lang)}
          </p>
          <p
            className={`mt-1 text-lg font-bold ${monthDelta > 0 ? "text-red-500 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}
          >
            {monthDelta > 0 ? "↑" : "↓"} {Math.abs(Math.round(monthDelta))}%
          </p>
        </div>
      )}

      {/* Change Detection */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
          {tr("analytics.changes", lang)}
        </h3>
        {changes.length > 0 ? (
          <div className="space-y-2">
            {changes.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm ${
                  c.direction === "above"
                    ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                }`}
              >
                {tr("common.weekOf", lang)}{" "}
                {formatDateEAT(c.weekStart)}: {c.consumption.toFixed(1)} kWh —{" "}
                {Math.abs(c.deviation)}% {tr(`common.${c.direction}`, lang)}{" "}
                {tr("common.usual", lang)} {c.baseline} kWh/
                {lang === "sw" ? "wiki" : "week"}
              </div>
            ))}
          </div>
        ) : hasEnoughWeeks ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            {tr("analytics.steady", lang)}
          </p>
        ) : (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">
            {tr("analytics.needData", lang)}
          </p>
        )}
      </div>

      {/* Copy for AI */}
      <button
        onClick={handleCopy}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {copying
          ? tr("analytics.copied", lang)
          : tr("analytics.copySummary", lang)}
      </button>
    </div>
  );
}
