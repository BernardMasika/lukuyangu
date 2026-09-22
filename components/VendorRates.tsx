"use client";

import { useLang, useData } from "./Providers";
import { tr } from "@/lib/i18n";

/**
 * TZS per unit, broken down by where the units were bought.
 *
 * The same 10,000 shillings buys noticeably fewer units through an agent than
 * through M-Pesa or a bank app, and that difference is invisible in a total.
 * The saving figure below is what buying everything through the cheapest
 * channel would have come to, on the purchases actually made.
 */
export default function VendorRates() {
  const { lang } = useLang();
  const { purchases } = useData();

  const withVendor = purchases.filter((p) => p.vendor && p.units > 0);

  const byVendor = new Map<string, { tzs: number; units: number; count: number }>();
  for (const p of withVendor) {
    const entry = byVendor.get(p.vendor) ?? { tzs: 0, units: 0, count: 0 };
    entry.tzs += p.amount_tzs;
    entry.units += p.units;
    entry.count += 1;
    byVendor.set(p.vendor, entry);
  }

  const rows = [...byVendor.entries()]
    .map(([vendor, v]) => ({
      vendor,
      rate: v.tzs / v.units,
      count: v.count,
      units: v.units,
    }))
    .sort((a, b) => a.rate - b.rate);

  const best = rows[0] ?? null;
  const worst = rows.length > 1 ? rows[rows.length - 1] : null;

  // What the same units would have cost at the cheapest rate seen.
  const saving =
    best !== null
      ? withVendor.reduce(
          (sum, p) => sum + Math.max(0, p.amount_tzs - p.units * best.rate),
          0
        )
      : 0;

  const maxRate = rows.length > 0 ? rows[rows.length - 1].rate : 1;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        {tr("analytics.vendorTitle", lang)}
      </h3>

      {rows.length < 2 ? (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {tr("analytics.vendorNeedData", lang)}
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-2">
            {rows.map((row) => (
              <div key={row.vendor}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {tr(`vendor.${row.vendor}`, lang)}
                    <span className="ml-1.5 font-normal text-zinc-400 dark:text-zinc-500">
                      {tr("analytics.vendorCount", lang, { count: row.count })}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-900 dark:text-white">
                    {Math.round(row.rate).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className={`h-full rounded-full ${
                      row === best
                        ? "bg-emerald-500"
                        : row === worst
                          ? "bg-orange-500"
                          : "bg-zinc-400 dark:bg-zinc-600"
                    }`}
                    style={{ width: `${Math.round((row.rate / maxRate) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {best && worst && (
            <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              {tr("analytics.vendorBest", lang, {
                vendor: tr(`vendor.${best.vendor}`, lang),
                rate: Math.round(best.rate).toLocaleString(),
                worst: tr(`vendor.${worst.vendor}`, lang),
                worstRate: Math.round(worst.rate).toLocaleString(),
              })}
            </p>
          )}

          {best && saving >= 500 && (
            <p className="mt-1.5 text-xs font-medium leading-relaxed text-emerald-600 dark:text-emerald-400">
              {tr("analytics.vendorSaving", lang, {
                vendor: tr(`vendor.${best.vendor}`, lang),
                amount: Math.round(saving).toLocaleString(),
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
