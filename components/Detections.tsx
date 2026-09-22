"use client";

import { useState } from "react";
import Link from "next/link";
import { useLang, useData } from "./Providers";
import { tr } from "@/lib/i18n";
import { formatDateTimeEAT } from "@/lib/utils";

/**
 * Things the ledger noticed that only you can settle: a stretch where the meter
 * barely moved, units that appeared without a purchase, a week you did not log.
 *
 * Every one is phrased as a question. The meter cannot tell a power cut from an
 * empty house, so the app must not pretend it can.
 *
 * Dismissals live in localStorage, keyed by the time window, so saying "no" to
 * one suggestion does not hide the next.
 */
const DISMISSED_KEY = "luku-dismissed";

function useDismissals() {
  // Read once at mount rather than in an effect. Providers renders a
  // placeholder until it has mounted, so this never runs during SSR and there
  // is no hydration mismatch to worry about.
  const [dismissed, setDismissed] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    } catch {
      // A blocked or cleared store just means nothing is dismissed yet.
      return [];
    }
  });

  const dismiss = (key: string) => {
    setDismissed((prev) => {
      const next = [...prev, key];
      try {
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // Not worth failing the interaction over.
      }
      return next;
    });
  };

  return { dismissed, dismiss };
}

function Card({
  tone,
  title,
  body,
  children,
}: {
  tone: "orange" | "blue" | "zinc";
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  const tones = {
    orange:
      "border-orange-200 bg-orange-50 dark:border-orange-800/50 dark:bg-orange-950/30",
    blue: "border-blue-200 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/30",
    zinc: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
  };

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        {title}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
        {body}
      </p>
      {children && <div className="mt-2 flex gap-2">{children}</div>}
    </div>
  );
}

const actionClass =
  "rounded-md bg-[#003399] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#002277] disabled:opacity-50";
const quietClass =
  "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

export default function Detections() {
  const { lang } = useLang();
  const { stats, refresh } = useData();
  const { dismissed, dismiss } = useDismissals();
  const [busy, setBusy] = useState<string | null>(null);

  if (!stats) return null;

  const visible = <T extends { from: string; to: string }>(
    items: T[],
    prefix: string
  ) => items.filter((i) => !dismissed.includes(`${prefix}:${i.from}:${i.to}`));

  const outages = visible(stats.suspectedOutages, "outage");
  const missing = visible(stats.missingPurchases, "purchase");
  const gaps = visible(stats.loggingGaps, "gap");

  if (outages.length === 0 && missing.length === 0 && gaps.length === 0) {
    return null;
  }

  const logOutage = async (from: string, to: string) => {
    const key = `outage:${from}:${to}`;
    setBusy(key);
    try {
      await fetch("/api/outages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_at: from,
          end_at: to,
          note: lang === "sw" ? "Imegunduliwa na mfumo" : "Detected by the app",
        }),
      });
      dismiss(key);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {tr("detect.title", lang)}
      </p>

      {outages.map((o) => {
        const key = `outage:${o.from}:${o.to}`;
        return (
          <Card
            key={key}
            tone="orange"
            title={tr("detect.outageTitle", lang)}
            body={tr("detect.outageBody", lang, {
              from: formatDateTimeEAT(o.from),
              to: formatDateTimeEAT(o.to),
              rate: o.rate,
              baseline: o.baseline,
            })}
          >
            <button
              onClick={() => logOutage(o.from, o.to)}
              disabled={busy === key}
              className={actionClass}
            >
              {tr("detect.outageYes", lang)}
            </button>
            <button onClick={() => dismiss(key)} className={quietClass}>
              {tr("detect.dismiss", lang)}
            </button>
          </Card>
        );
      })}

      {missing.map((m) => {
        const key = `purchase:${m.from}:${m.to}`;
        return (
          <Card
            key={key}
            tone="blue"
            title={tr("detect.missingTitle", lang)}
            body={tr("detect.missingBody", lang, {
              units: m.units,
              from: formatDateTimeEAT(m.from),
              to: formatDateTimeEAT(m.to),
            })}
          >
            <Link href="/log/purchase" className={actionClass}>
              {tr("detect.missingAction", lang)}
            </Link>
            <button onClick={() => dismiss(key)} className={quietClass}>
              {tr("detect.dismiss", lang)}
            </button>
          </Card>
        );
      })}

      {gaps.map((g) => {
        const key = `gap:${g.from}:${g.to}`;
        const body =
          tr("detect.gapBody", lang, {
            from: formatDateTimeEAT(g.from),
            to: formatDateTimeEAT(g.to),
            units: g.consumption,
          }) +
          (g.purchaseCount > 0
            ? " " + tr("detect.gapPurchases", lang, { count: g.purchaseCount })
            : "");

        return (
          <Card
            key={key}
            tone="zinc"
            title={tr("detect.gapTitle", lang, { days: g.days })}
            body={body}
          >
            <button onClick={() => dismiss(key)} className={quietClass}>
              {tr("detect.dismiss", lang)}
            </button>
          </Card>
        );
      })}
    </div>
  );
}
