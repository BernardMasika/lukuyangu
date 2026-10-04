"use client";

import { useState } from "react";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import { formatDateEAT } from "@/lib/utils";
import Nudge from "@/components/Nudge";

function Explainer({ text }: { text: string }) {
  return (
    <p className="mt-2 text-xs italic text-zinc-400 dark:text-zinc-500">
      {text}
    </p>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        {title}
      </h3>
      {children}
    </div>
  );
}

export default function Plan() {
  const { lang } = useLang();
  const { stats, readings: rawReadings, purchases, outages } = useData();
  const [calcMode, setCalcMode] = useState<"budget" | "days">("budget");
  const [calcInput, setCalcInput] = useState("");

  const readings = [...rawReadings].reverse(); // chronological
  const hasBurnRate = stats?.burnRate !== null && stats?.burnRate !== undefined;
  const burnRate = stats?.burnRate ?? 0;
  // Last reading plus any token entered since: what the projection runs from.
  const balance = stats?.balance ?? 0;
  // What the meter most likely shows now, for the calculator.
  const onMeter = stats?.projectedBalance ?? 0;
  const daysRemaining = stats?.daysRemaining ?? null;
  const readingCount = stats?.readingCount ?? 0;
  const msPerDay = 86400000;

  // --- Avg cost per kWh from all purchases ---
  const totalSpent = purchases.reduce((s, p) => s + p.amount_tzs, 0);
  const totalUnits = purchases.reduce((s, p) => s + p.units, 0);
  const avgCostKwh = totalUnits > 0 ? totalSpent / totalUnits : 0;

  // --- Trend: last 7 days against the 7 before, per active day (from stats,
  // where both windows come from the ledger so a top-up cannot hide usage) ---
  const trendPct = stats?.trendPct ?? null;
  const trendKey =
    trendPct === null
      ? null
      : trendPct > 10
        ? "plan.trendUp"
        : trendPct < -10
          ? "plan.trendDown"
          : "plan.trendSteady";

  // --- Reading span in days ---
  const readingSpanDays =
    readings.length >= 2
      ? (new Date(readings[readings.length - 1].created_at).getTime() -
          new Date(readings[0].created_at).getTime()) /
        msPerDay
      : 0;

  // --- Depletion date, projected from the last reading ---
  const depletionDate = stats?.runsOutAt ? new Date(stats.runsOutAt) : null;

  // --- Calculator ---
  // Whatever is on the meter already counts: buying for "30 days" with 25
  // units loaded only needs 30 days minus those 25 units.
  const calcValue = parseFloat(calcInput) || 0;
  let calcUnits = 0;
  let calcDays = 0;
  let calcCost = 0;
  let calcNeededUnits = 0;

  if (calcMode === "budget" && avgCostKwh > 0 && burnRate > 0) {
    calcUnits = calcValue / avgCostKwh;
    calcDays = (onMeter + calcUnits) / burnRate;
  } else if (calcMode === "days" && burnRate > 0) {
    calcNeededUnits = Math.max(0, calcValue * burnRate - onMeter);
    calcCost = avgCostKwh > 0 ? calcNeededUnits * avgCostKwh : 0;
  }

  // --- Smart tips ---
  const tips: string[] = [];
  if (readingCount < 3) {
    tips.push(tr("plan.tipStart", lang));
  }
  if (purchases.length === 0) {
    tips.push(tr("plan.tipNoPurchase", lang));
  }
  if (readingCount >= 3 && readingSpanDays > 0) {
    const logsPerDay = readingCount / readingSpanDays;
    if (logsPerDay >= 3) {
      tips.push(tr("plan.tipGreatLogging", lang));
    } else if (logsPerDay < 1) {
      tips.push(tr("plan.tipLogMore", lang));
    }
  }
  // Any outage ever logged counts, not just this month's.
  if (outages.length === 0 && readingSpanDays > 14) {
    tips.push(tr("plan.tipLogOutages", lang));
  }
  if (outages.length > 0) {
    tips.push(tr("plan.tipGenerator", lang));
    tips.push(tr("plan.tipGeneratorReminder", lang));
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{tr("plan.title", lang)}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {tr("plan.description", lang)}
        </p>
      </div>

      {/* Section 1: Daily Usage */}
      <SectionCard title={tr("plan.dailyUsage", lang)}>
        {hasBurnRate ? (
          <>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {burnRate} <span className="text-base font-normal">kWh/{tr("plan.daysLabel", lang) === "siku" ? "siku" : "day"}</span>
            </p>
            {stats?.avg7 !== null && stats?.avg7 !== undefined && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {tr("dashboard.avg7", lang)}: {stats.avg7} kWh/{tr("plan.daysLabel", lang) === "siku" ? "siku" : "day"}
              </p>
            )}
            {trendKey && (
              <p
                className={`mt-1 text-sm font-medium ${
                  trendKey === "plan.trendUp"
                    ? "text-red-500 dark:text-red-400"
                    : trendKey === "plan.trendDown"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-zinc-500 dark:text-zinc-400"
                }`}
              >
                {trendKey === "plan.trendUp" ? "↑ " : trendKey === "plan.trendDown" ? "↓ " : "→ "}
                {tr(trendKey, lang)}
              </p>
            )}
            <Explainer
              text={tr("plan.dailyExplain", lang, {
                count: readingCount,
                days: Math.round(readingSpanDays),
              })}
            />
          </>
        ) : (
          <Explainer text={tr("plan.dailyNeedData", lang)} />
        )}
      </SectionCard>

      {/* Section 2: How Long Will My Units Last? */}
      <SectionCard title={tr("plan.howLong", lang)}>
        {hasBurnRate && daysRemaining !== null && balance > 0 ? (
          <>
            <div className="flex items-baseline gap-3">
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {Math.round(daysRemaining)}{" "}
                <span className="text-base font-normal">{tr("plan.daysLabel", lang)}</span>
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                ({balance} kWh {tr("dashboard.units", lang) === "vitengo" ? "vilivyobaki" : "remaining"})
              </p>
            </div>
            {depletionDate && (
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {tr("plan.depletionDate", lang)}: <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatDateEAT(depletionDate.toISOString())}</span>
              </p>
            )}
            <Explainer
              text={tr("plan.howLongExplain", lang, {
                rate: burnRate,
                units: balance,
                date: depletionDate ? formatDateEAT(depletionDate.toISOString()) : "—",
              })}
            />
          </>
        ) : (
          <Explainer text={tr("plan.howLongNeedData", lang)} />
        )}
      </SectionCard>

      {/* Section 3: Purchase Calculator */}
      <SectionCard title={tr("plan.calculator", lang)}>
        {hasBurnRate ? (
          purchases.length > 0 ? (
            <>
              {/* Mode toggle */}
              <div className="mb-3 flex rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
                <button
                  onClick={() => { setCalcMode("budget"); setCalcInput(""); }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    calcMode === "budget"
                      ? "bg-[#003399] text-white"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {tr("plan.iHaveTzs", lang)}
                </button>
                <button
                  onClick={() => { setCalcMode("days"); setCalcInput(""); }}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    calcMode === "days"
                      ? "bg-[#003399] text-white"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {tr("plan.iNeedDays", lang)}
                </button>
              </div>

              {/* Input */}
              <input
                type="number"
                inputMode="numeric"
                value={calcInput}
                onChange={(e) => setCalcInput(e.target.value)}
                placeholder={calcMode === "budget" ? "50,000" : "30"}
                className={inputClass}
              />

              {/* Results */}
              {calcValue > 0 && (
                <div className="mt-3 space-y-1.5">
                  {calcMode === "budget" ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {tr("plan.unitsYouGet", lang)}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {Math.round(calcUnits * 10) / 10} kWh
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {tr("plan.daysItLasts", lang)}
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {Math.round(calcDays)} {tr("plan.daysLabel", lang)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {tr("plan.unitsNeeded", lang)}
                        </span>
                        <span className="font-medium text-zinc-900 dark:text-white">
                          {Math.round(calcNeededUnits * 10) / 10} kWh
                        </span>
                      </div>
                      {calcNeededUnits === 0 && (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          {tr("plan.alreadyEnough", lang)}
                        </p>
                      )}
                      {calcCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500 dark:text-zinc-400">
                            {tr("plan.estimatedCost", lang)}
                          </span>
                          <span className="font-bold text-blue-600 dark:text-blue-400">
                            TZS {Math.round(calcCost).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <Explainer
                text={tr("plan.calcExplain", lang, {
                  rate: Math.round(avgCostKwh),
                  burn: burnRate,
                })}
              />
            </>
          ) : (
            <Explainer text={tr("plan.calcNeedPurchase", lang)} />
          )
        ) : (
          <Explainer text={tr("plan.calcNeedBurnRate", lang)} />
        )}
      </SectionCard>

      {/* Section 4: Tips */}
      {tips.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
            {tr("plan.tips", lang)}
          </h3>
          {tips.map((tip, i) => (
            <Nudge key={i} text={tip} variant="info" />
          ))}
        </div>
      )}
    </div>
  );
}
