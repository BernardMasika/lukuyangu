"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang } from "./Providers";
import { tr } from "@/lib/i18n";
import { formatDateTimeEAT } from "@/lib/utils";

interface Insight {
  headline: string;
  insights: { title: string; detail: string; confidence: "high" | "medium" | "low" }[];
  watchOut: string;
}

interface Cached {
  generatedAt: string;
  data: Insight;
}

/**
 * The analysis lives on the Analytics page and never runs on its own.
 *
 * A GET on mount only reads what is already cached, so opening the page costs
 * nothing. Generating is a deliberate tap, and the server skips the call
 * anyway when no new readings have landed since last time.
 */
export default function AiInsight() {
  const { lang } = useLang();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [cached, setCached] = useState<Cached | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<"needData" | "failed" | null>(null);

  useEffect(() => {
    fetch("/api/insight")
      .then((r) => r.json())
      .then((d) => {
        setConfigured(d.configured);
        setCached(d.cached ?? null);
      })
      .catch(() => setConfigured(false));
  }, []);

  const generate = useCallback(
    async (force: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lang, force }),
        });
        const data = await res.json();

        if (data.needMoreData) {
          setError("needData");
        } else if (data.cached) {
          setCached(data.cached);
        } else {
          setConfigured(data.configured);
          if (data.error) setError("failed");
        }
      } catch {
        setError("failed");
      } finally {
        setLoading(false);
      }
    },
    [lang]
  );

  if (configured === null) return null;

  const confidenceStyles = {
    high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    low: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
          {tr("insight.title", lang)}
        </h3>
        {configured && (
          <button
            onClick={() => generate(cached !== null)}
            disabled={loading}
            className="rounded-md bg-[#003399] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#002277] disabled:opacity-50"
          >
            {loading
              ? tr("insight.loading", lang)
              : cached
                ? tr("insight.refresh", lang)
                : tr("insight.generate", lang)}
          </button>
        )}
      </div>

      {!configured && (
        <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {tr("insight.notConfigured", lang)}
        </p>
      )}

      {error === "needData" && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {tr("insight.needData", lang)}
        </p>
      )}
      {error === "failed" && (
        <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
          {tr("insight.error", lang)}
        </p>
      )}

      {cached && (
        <div className="mt-3 space-y-3">
          <p className="text-sm font-medium leading-relaxed text-zinc-900 dark:text-white">
            {cached.data.headline}
          </p>

          {cached.data.insights.map((item, i) => (
            <div
              key={i}
              className="border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
            >
              <p className="flex items-center gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                {item.title}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${confidenceStyles[item.confidence]}`}
                >
                  {item.confidence}
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                {item.detail}
              </p>
            </div>
          ))}

          <p className="rounded-lg bg-orange-50 px-3 py-2 text-xs leading-relaxed text-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
            {cached.data.watchOut}
          </p>

          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
            {tr("insight.asOf", lang, {
              when: formatDateTimeEAT(cached.generatedAt),
            })}
            {" · "}
            {tr("insight.disclaimer", lang)}
          </p>
        </div>
      )}
    </div>
  );
}
