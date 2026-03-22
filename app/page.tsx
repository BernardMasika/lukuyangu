"use client";

import Link from "next/link";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import StatCard from "@/components/StatCard";
import QuickLog from "@/components/QuickLog";
import Nudge from "@/components/Nudge";

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
      <StatCard
        label={tr("dashboard.spent", lang)}
        value={
          stats?.spentThisMonth
            ? `TZS ${stats.spentThisMonth.toLocaleString()}`
            : "—"
        }
      />

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

      {/* Quick Log */}
      <QuickLog />

      {/* Log Purchase Button */}
      <Link
        href="/log/purchase"
        className="flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {tr("purchase.logBtn", lang)}
      </Link>
    </div>
  );
}
