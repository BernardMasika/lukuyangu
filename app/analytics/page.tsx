"use client";

import { useState } from "react";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import { formatDateEAT, getTimePeriod, getWeekStart, TZ, type TimePeriod } from "@/lib/utils";
import { buildSegments, dailySeries } from "@/lib/ledger";
import ConsumptionChart from "@/components/ConsumptionChart";
import StatCard from "@/components/StatCard";
import VendorRates from "@/components/VendorRates";
import AiInsight from "@/components/AiInsight";

type Tab = "daily" | "weekly" | "monthly";

export default function Analytics() {
  const { lang } = useLang();
  const { readings: rawReadings, changes, purchases, outages, stats } = useData();
  const [tab, setTab] = useState<Tab>("daily");
  const [periodView, setPeriodView] = useState<"today" | "all">("today");
  const [copying, setCopying] = useState(false);

  // Analytics needs readings in chronological order (oldest first)
  const readings = [...rawReadings].reverse();

  // Same ledger the dashboard reads, so the charts cannot disagree with it.
  // The old builders compared raw readings, which meant every week containing a
  // top-up under-reported its consumption.
  const segments = buildSegments(readings, purchases, outages);

  const buildDailyData = () =>
    dailySeries(segments, 30)
      .filter((d) => d.units !== null)
      .map((d) => ({ label: d.date.slice(5), value: d.units as number }));

  /** Roll segments up into buckets, crediting each to the bucket it ends in. */
  const bucketed = (key: (d: Date) => string, keep: number) => {
    const buckets = new Map<string, number>();
    for (const seg of segments) {
      const k = key(new Date(seg.to));
      buckets.set(k, (buckets.get(k) ?? 0) + seg.consumption);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({
        label,
        value: Math.round(value * 10) / 10,
      }))
      .slice(-keep);
  };

  const buildWeeklyData = () =>
    bucketed((d) => getWeekStart(d).toISOString().slice(0, 10), 8).map((b) => ({
      ...b,
      label: b.label.slice(5),
    }));

  const buildMonthlyData = () =>
    bucketed((d) => d.toISOString().slice(0, 7), 6);

  const PERIOD_ORDER: TimePeriod[] = ["alfajiri", "asubuhi", "mchana", "jioni", "usiku"];
  const PERIOD_COLORS: Record<TimePeriod, string> = {
    alfajiri: "bg-indigo-500",
    asubuhi: "bg-amber-500",
    mchana: "bg-orange-500",
    jioni: "bg-purple-500",
    usiku: "bg-slate-500",
  };

  const buildPeriodData = () => {
    const totals: Record<TimePeriod, number> = {
      alfajiri: 0, asubuhi: 0, mchana: 0, jioni: 0, usiku: 0,
    };
    // Credited to the period the stretch started in, and taken from the ledger
    // so a top-up inside the stretch no longer erases it.
    for (const seg of segments) {
      totals[getTimePeriod(seg.from)] += seg.consumption;
    }
    return PERIOD_ORDER
      .map((p) => ({ period: p, value: Math.round(totals[p] * 10) / 10 }))
      .filter(({ value }) => value > 0);
  };

  const periodData = buildPeriodData();
  const maxPeriodValue = Math.max(...periodData.map((d) => d.value), 1);

  // --- Today's breakdown by time period ---
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const todayReadings = readings.filter((r) => {
    const rDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(r.created_at));
    return rDate === todayStr;
  });

  const todayPeriods: { period: TimePeriod; value: number }[] = [];
  if (todayReadings.length >= 2) {
    const totals: Record<TimePeriod, number> = {
      alfajiri: 0, asubuhi: 0, mchana: 0, jioni: 0, usiku: 0,
    };
    for (let i = 1; i < todayReadings.length; i++) {
      const prev = todayReadings[i - 1].reading;
      const curr = todayReadings[i].reading;
      if (curr < prev) {
        const period = getTimePeriod(todayReadings[i].created_at);
        totals[period] += prev - curr;
      }
    }
    for (const p of PERIOD_ORDER) {
      if (totals[p] > 0)
        todayPeriods.push({ period: p, value: Math.round(totals[p] * 10) / 10 });
    }
  }
  const maxTodayValue = Math.max(...todayPeriods.map((d) => d.value), 1);

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
      <div>
        <h1 className="text-xl font-bold">{tr("analytics.title", lang)}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {tr("analytics.description", lang)}
        </p>
      </div>

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

      {/* Time-of-Day Breakdown (Today / All Time toggle) */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            {tr("analytics.byPeriod", lang)}
          </h3>
          <div className="flex rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
            <button
              onClick={() => setPeriodView("today")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                periodView === "today"
                  ? "bg-[#003399] text-white"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {tr("analytics.periodToday", lang)}
            </button>
            <button
              onClick={() => setPeriodView("all")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                periodView === "all"
                  ? "bg-[#003399] text-white"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {tr("analytics.periodAll", lang)}
            </button>
          </div>
        </div>

        {periodView === "today" ? (
          todayPeriods.length > 0 ? (
            <>
              <div className="space-y-2">
                {todayPeriods.map(({ period, value }) => (
                  <div key={period} className="flex items-center gap-3">
                    <span className="w-20 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                      {tr(`period.${period}`, lang)}
                    </span>
                    <div className="relative flex-1 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${PERIOD_COLORS[period]} transition-all`}
                        style={{ width: `${(value / maxTodayValue) * 100}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {value} kWh
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs italic text-zinc-400 dark:text-zinc-500">
                {tr("analytics.todayExplain", lang)}
              </p>
            </>
          ) : (
            <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
              {tr("analytics.todayNeedMore", lang)}
            </p>
          )
        ) : periodData.length > 0 ? (
          <>
            <div className="space-y-2">
              {periodData.map(({ period, value }) => (
                <div key={period} className="flex items-center gap-3">
                  <span className="w-20 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                    {tr(`period.${period}`, lang)}
                  </span>
                  <div className="relative flex-1 h-5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${PERIOD_COLORS[period]} transition-all`}
                      style={{ width: `${(value / maxPeriodValue) * 100}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    {value} kWh
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
              {tr("analytics.periodNote", lang)}
            </p>
          </>
        ) : (
          <p className="text-xs italic text-zinc-400 dark:text-zinc-500">
            {tr("analytics.todayNeedMore", lang)}
          </p>
        )}
      </div>

      {/* Outage Stats */}
      {stats && stats.outageCount > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            {tr("analytics.outages", lang)}
          </h3>
          <div className="grid grid-cols-3 gap-2">
            <StatCard
              label={tr("outage.totalMonth", lang)}
              value={stats.outageHoursThisMonth}
              unit={tr("outage.hours", lang)}
              accent="red"
            />
            <StatCard
              label={tr("outage.count", lang)}
              value={stats.outageCount}
            />
            <StatCard
              label={tr("outage.avgDuration", lang)}
              value={
                stats.outageCount > 0
                  ? Math.round((stats.outageHoursThisMonth / stats.outageCount) * 10) / 10
                  : "—"
              }
              unit={tr("outage.hours", lang)}
            />
          </div>
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

      {/* What each channel actually charges per unit */}
      <VendorRates />

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

      {/* Claude reads the ledger and says what it makes of it */}
      <AiInsight />

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
