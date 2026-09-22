"use client";

import Link from "next/link";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import { formatDateEAT } from "@/lib/utils";
import StatCard from "@/components/StatCard";
import QuickLog from "@/components/QuickLog";
import Nudge from "@/components/Nudge";
import OutageTracker from "@/components/OutageTracker";
import Detections from "@/components/Detections";

/**
 * One question first: how much is on the meter and when does it run out.
 * Everything below that answers a follow-up. "Days remaining" is stated once,
 * in the hero, and never repeated further down the page.
 */
export default function Dashboard() {
  const { lang } = useLang();
  const { stats, loading } = useData();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-400 dark:text-zinc-500">
        {tr("common.loading", lang)}
      </div>
    );
  }

  const current = stats?.currentPurchase ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{tr("dashboard.title", lang)}</h1>

      {/* Getting started */}
      {stats && stats.readingCount === 0 && (
        <Nudge text={tr("nudge.firstReading", lang)} variant="info" />
      )}
      {stats && stats.readingCount === 1 && (
        <Nudge
          text={tr("nudge.oneReading", lang, { units: stats.latestReading ?? 0 })}
          variant="info"
        />
      )}

      {/* The answer */}
      {stats && stats.latestReading !== null && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {tr("dashboard.balance", lang)}
          </p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-bold tabular-nums text-zinc-900 dark:text-white">
              {stats.latestReading}
            </span>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">kWh</span>
          </p>

          {stats.daysRemaining !== null && stats.runsOutAt !== null ? (
            <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
              {tr("dashboard.runsOutIn", lang, {
                days: Math.round(stats.daysRemaining),
              })}
              <span className="font-normal text-zinc-400 dark:text-zinc-500">
                {" , "}
                {tr("dashboard.runsOutOn", lang, {
                  date: formatDateEAT(stats.runsOutAt),
                })}
              </span>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
              {tr("dashboard.runsOutUnknown", lang)}
            </p>
          )}
        </div>
      )}

      {/* Only alerts that need an action today */}
      {stats &&
        stats.latestReading !== null &&
        stats.latestReading <= 15 &&
        stats.readingCount > 1 && (
          <Nudge text={tr("dashboard.lowBalanceShort", lang)} variant="warning" />
        )}
      {stats && !stats.hasLoggedToday && stats.readingCount > 0 && (
        <Nudge text={tr("dashboard.logToday", lang)} variant="info" />
      )}

      {/* Usage */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={tr("dashboard.today", lang)}
          value={
            stats?.todayUsage !== null && stats?.todayUsage !== undefined
              ? `${stats.todayEstimated ? "~" : ""}${stats.todayUsage}`
              : "—"
          }
          unit="kWh"
          accent="blue"
        />
        <StatCard
          label={tr("dashboard.avg7", lang)}
          value={stats?.avg7 ?? "—"}
          unit={tr("common.kwhDay", lang)}
          accent="green"
        />
      </div>

      {/* Which purchase is actually being burned right now */}
      {current && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {tr("dashboard.inUse", lang)}
          </p>
          <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
            {current.units} kWh · TZS {current.amount_tzs.toLocaleString()}
            {current.vendor && (
              <span className="ml-1.5 font-normal text-zinc-400 dark:text-zinc-500">
                {tr(`vendor.${current.vendor}`, lang)}
              </span>
            )}
          </p>

          {current.started ? (
            <>
              <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                {/* "Day 164 of about 2" helps nobody. Once the purchase has
                    outlived its estimate the estimate is the wrong number to
                    show, so drop it and just count the days. */}
                {current.estimatedTotalDays &&
                current.days <= current.estimatedTotalDays * 1.5
                  ? tr("dashboard.dayOf", lang, {
                      day: Math.max(1, Math.round(current.days)),
                      total: Math.round(current.estimatedTotalDays),
                    })
                  : tr("dashboard.lasting", lang, {
                      days: Math.max(1, Math.round(current.days)),
                    })}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {tr("dashboard.unitsLeftOfPurchase", lang, {
                  units: current.unitsRemaining,
                })}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-medium text-blue-600 dark:text-blue-400">
                {tr("dashboard.queued", lang)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                {tr("dashboard.queuedExplain", lang, {
                  units:
                    stats?.latestReading !== null &&
                    stats?.latestReading !== undefined
                      ? Math.round(
                          (stats.latestReading - current.unitsRemaining) * 10
                        ) / 10
                      : 0,
                })}
              </p>
            </>
          )}
        </div>
      )}

      {/* Questions the data raised */}
      <Detections />

      <OutageTracker />
      <QuickLog />

      <Link
        href="/log/purchase"
        className="flex w-full items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
      >
        {tr("purchase.logBtn", lang)}
      </Link>
    </div>
  );
}
