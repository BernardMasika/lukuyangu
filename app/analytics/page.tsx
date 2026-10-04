"use client";

import { useState } from "react";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import { formatDateEAT, byPeriod, startOfDayEAT, type TimePeriod } from "@/lib/utils";
import {
  buildSegments,
  consumptionBetween,
  dailySeries,
  eatDateKey,
  eatMonthStart,
  eatWeekStart,
  hourlyProfile,
  monthComparison,
  weeklyChanges,
} from "@/lib/ledger";
import ConsumptionChart from "@/components/ConsumptionChart";
import StatCard from "@/components/StatCard";
import VendorRates from "@/components/VendorRates";
import AiInsight from "@/components/AiInsight";

type Tab = "daily" | "weekly" | "monthly";

export default function Analytics() {
  const { lang } = useLang();
  const { readings: rawReadings, purchases, outages, stats } = useData();
  const [tab, setTab] = useState<Tab>("daily");
  const [periodView, setPeriodView] = useState<"today" | "all">("today");
  const [copying, setCopying] = useState(false);

  // Analytics needs readings in chronological order (oldest first)
  const readings = [...rawReadings].reverse();

  // Same ledger the dashboard reads, so the charts cannot disagree with it.
  // The old builders compared raw readings, which meant every week containing a
  // top-up under-reported its consumption.
  const segments = buildSegments(readings, purchases, outages);

  const now = new Date();
  const WEEK = 7 * 86_400_000;

  const buildDailyData = () =>
    dailySeries(segments, 30, now)
      .filter((d) => d.units !== null)
      .map((d) => ({ label: d.date.slice(5), value: d.units as number }));

  /** One bar per calendar window (EAT), prorated across its edges, so a
   *  stretch spanning Sunday night lands in both weeks rather than one. */
  const windowed = (starts: Date[], label: (d: Date) => string) =>
    starts
      .map((start, i) => {
        const end = starts[i + 1] ?? now;
        const w = consumptionBetween(segments, start, end);
        return w.hasData ? { label: label(start), value: w.units } : null;
      })
      .filter((b): b is { label: string; value: number } => b !== null);

  const buildWeeklyData = () => {
    const thisWeek = eatWeekStart(now).getTime();
    const starts = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => new Date(thisWeek - k * WEEK));
    return windowed(starts, (d) => eatDateKey(d).slice(5));
  };

  const buildMonthlyData = () =>
    windowed(
      [5, 4, 3, 2, 1, 0].map((k) => eatMonthStart(now, -k)),
      (d) => eatDateKey(d).slice(0, 7)
    );

  const PERIOD_ORDER: TimePeriod[] = ["alfajiri", "asubuhi", "mchana", "jioni", "usiku"];
  const PERIOD_COLORS: Record<TimePeriod, string> = {
    alfajiri: "bg-indigo-500",
    asubuhi: "bg-amber-500",
    mchana: "bg-orange-500",
    jioni: "bg-purple-500",
    usiku: "bg-slate-500",
  };

  // Both views split each stretch across the hours it really spans, so they
  // agree with each other. They used to credit opposite ends of a stretch.
  const toPeriodBars = (perHour: number[]) => {
    const totals = byPeriod(perHour);
    return PERIOD_ORDER.map((p) => ({ period: p, value: Math.round(totals[p] * 10) / 10 }))
      .filter(({ value }) => value > 0);
  };

  const periodData = toPeriodBars(hourlyProfile(segments).units);
  const maxPeriodValue = Math.max(...periodData.map((d) => d.value), 1);

  const todayPeriods = toPeriodBars(
    hourlyProfile(segments, startOfDayEAT(now), now).units
  );
  const maxTodayValue = Math.max(...todayPeriods.map((d) => d.value), 1);

  const chartData =
    tab === "daily"
      ? buildDailyData()
      : tab === "weekly"
        ? buildWeeklyData()
        : buildMonthlyData();

  // --- Cost, this EAT month ---
  const monthStart = eatMonthStart(now);
  const thisMonthPurchases = purchases.filter(
    (p) => new Date(p.created_at) >= monthStart
  );
  const totalSpent = thisMonthPurchases.reduce((s, p) => s + p.amount_tzs, 0);
  const totalUnits = thisMonthPurchases.reduce((s, p) => s + p.units, 0);
  const avgCostKwh = totalUnits > 0 ? totalSpent / totalUnits : 0;
  // What the electricity you burn costs a day. Spend per calendar day measures
  // when you happened to buy, not what you use.
  const allUnits = purchases.reduce((s, p) => s + p.units, 0);
  const allSpent = purchases.reduce((s, p) => s + p.amount_tzs, 0);
  const useCostDay =
    stats?.burnRate && allUnits > 0 ? stats.burnRate * (allSpent / allUnits) : 0;

  const months = monthComparison(segments, now);
  const monthDelta = months.deltaPct;

  const { changes, completeWeeks } = weeklyChanges(segments, now);
  const hasEnoughWeeks = completeWeeks >= 5;

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
          {tr("analytics.chartEmpty", lang)}
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
          value={useCostDay > 0 ? Math.round(useCostDay).toLocaleString() : "—"}
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
            {monthDelta > 0 ? "↑" : "↓"} {Math.abs(monthDelta)}%
          </p>
          <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
            {tr("analytics.perDayCompare", lang, {
              now: months.thisPerDay ?? 0,
              last: months.lastPerDay ?? 0,
            })}
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
                {formatDateEAT(c.weekStart)}: {c.consumption.toFixed(1)} kWh,{" "}
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
