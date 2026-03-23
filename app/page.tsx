"use client";

import Link from "next/link";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import { formatDateEAT } from "@/lib/utils";
import StatCard from "@/components/StatCard";
import QuickLog from "@/components/QuickLog";
import Nudge from "@/components/Nudge";
import OutageTracker from "@/components/OutageTracker";

export default function Dashboard() {
  const { lang } = useLang();
  const { stats, purchases, loading } = useData();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-zinc-400 dark:text-zinc-500">
        {tr("common.loading", lang)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{tr("dashboard.title", lang)}</h1>

      {/* Nudges */}
      {stats && stats.readingCount === 0 && (
        <Nudge text={tr("nudge.firstReading", lang)} variant="info" />
      )}
      {stats && stats.readingCount === 1 && stats.latestReading !== null && (
        <Nudge
          text={tr("nudge.oneReading", lang, {
            units: stats.latestReading,
          })}
          variant="info"
        />
      )}
      {stats && !stats.hasLoggedToday && stats.readingCount > 0 && (
        <Nudge text={tr("nudge.logReminder", lang)} variant="warning" />
      )}
      {stats &&
        stats.latestReading !== null &&
        stats.latestReading <= 15 &&
        stats.burnRate !== null &&
        stats.daysRemaining !== null && (
          <Nudge
            text={tr("nudge.lowBalance", lang, {
              units: stats.latestReading,
              days: Math.round(stats.daysRemaining),
            })}
            variant="warning"
          />
        )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label={tr("dashboard.today", lang)}
          value={stats?.todayUsage !== null ? stats?.todayUsage ?? "—" : "—"}
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
      {/* Last Purchase */}
      {(() => {
        const lastPurchase = purchases.length > 0 ? purchases[0] : null;
        if (!lastPurchase) return null;

        const purchaseDate = new Date(lastPurchase.created_at);
        const daysSincePurchase = Math.floor(
          (Date.now() - purchaseDate.getTime()) / 86400000
        );

        // Use burn rate to estimate total days this purchase covers
        const estimatedTotalDays =
          stats?.burnRate && stats.burnRate > 0
            ? Math.round(lastPurchase.units / stats.burnRate)
            : null;

        return (
          <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {tr("dashboard.lastPurchase", lang)}
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-white">
              {lastPurchase.units} kWh · TZS {lastPurchase.amount_tzs.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
              {formatDateEAT(lastPurchase.created_at)}
            </p>
            <p className="mt-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              {tr("dashboard.lasting", lang, { days: daysSincePurchase })}
              {estimatedTotalDays !== null && (
                <span>
                  {" · ~"}{estimatedTotalDays} {tr("plan.daysLabel", lang)}{" "}
                  {lang === "sw" ? "jumla" : "total"}
                </span>
              )}
            </p>
          </div>
        );
      })()}

      {/* Outage count */}
      {stats && stats.outageCount > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {tr("outage.count", lang)}
          </p>
          <p className="mt-1 text-orange-600 dark:text-orange-400">
            <span className="text-lg font-bold">{stats.outageCount}</span>
            <span className="ml-1 text-xs font-normal">
              {lang === "sw" ? "mwezi huu" : "this month"}
            </span>
          </p>
        </div>
      )}

      {/* Prediction */}
      {stats && stats.burnRate !== null && stats.daysRemaining !== null && stats.latestReading !== null && (
        <Nudge
          text={tr("nudge.burnRate", lang, {
            rate: stats.burnRate,
            units: stats.latestReading,
            days: Math.round(stats.daysRemaining),
          })}
          variant="success"
        />
      )}
      {stats && stats.readingCount >= 1 && stats.burnRate === null && (
        <Nudge text={tr("nudge.noPrediction", lang)} variant="info" />
      )}

      {/* Outage Tracker */}
      <OutageTracker />

      {/* Quick Log */}
      <QuickLog />

      {/* Log Purchase Button */}
      <Link
        href="/log/purchase"
        className="flex w-full items-center justify-center rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50"
      >
        {tr("purchase.logBtn", lang)}
      </Link>
    </div>
  );
}
