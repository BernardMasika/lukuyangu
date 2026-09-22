"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useLang, useData } from "./Providers";
import { tr } from "@/lib/i18n";
import { expectedReadingRange } from "@/lib/ledger";
import TimePicker from "./TimePicker";

type Warning =
  | { kind: "tooHigh"; entered: number; last: number }
  | { kind: "tooFast"; used: number; hours: number; times: number; expected: number | null };

/**
 * Catches a mistyped reading before it lands in the database, so there is no
 * entry to hunt down and delete later.
 *
 * A LUKU meter only counts down. If a reading is higher than the last one and
 * no purchase has been logged since, it is either a typo or an unrecorded
 * top-up, and both need a person. Anything more than three times the usual burn
 * is merely unusual, so it asks rather than blocks.
 */
export default function QuickLog() {
  const { lang } = useLang();
  const { refresh, readings, purchases, stats } = useData();
  const [reading, setReading] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState<Warning | null>(null);
  const [toast, setToast] = useState<{ id: number; reading: string } | null>(
    null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = (value: number): Warning | null => {
    const at = when ? new Date(when) : new Date();
    const range = expectedReadingRange(
      readings,
      purchases,
      stats?.burnRate ?? null,
      at
    );
    if (!range) return null;

    // Went up with nothing bought to explain it.
    if (value > range.ceiling + 0.05) {
      return { kind: "tooHigh", entered: value, last: range.lastReading };
    }

    // Went down far faster than this house ever does.
    if (range.expected !== null && value < range.plausibleLow - 0.05) {
      const used = Math.round((range.ceiling - value) * 10) / 10;
      const days = Math.max(range.hoursSince / 24, 0.01);
      const times = Math.round((used / days / (stats?.burnRate || 1)) * 10) / 10;
      return {
        kind: "tooFast",
        used,
        hours: range.hoursSince,
        times,
        expected: range.expected,
      };
    }

    return null;
  };

  const save = async () => {
    setSaving(true);
    setWarning(null);

    try {
      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reading: Number(reading),
          note,
          ...(when ? { created_at: when } : {}),
        }),
      });
      const data = await res.json();

      setToast({ id: data.id, reading });
      setReading("");
      setNote("");
      setWhen("");
      refresh();

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const value = Number(reading);
    if (!reading || isNaN(value)) return;

    const problem = check(value);
    if (problem) {
      setWarning(problem);
      return;
    }
    await save();
  };

  const handleUndo = async () => {
    if (!toast) return;
    await fetch(`/api/readings/${toast.id}`, { method: "DELETE" });
    setToast(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    refresh();
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300">
        {tr("quicklog.title", lang)}
      </h3>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          placeholder={tr("quicklog.placeholder", lang)}
          value={reading}
          onChange={(e) => {
            setReading(e.target.value);
            setWarning(null);
          }}
          className="flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
        />
        <button
          onClick={handleSave}
          disabled={saving || !reading}
          className="rounded-lg bg-[#003399] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#002277] disabled:opacity-50"
        >
          {tr("quicklog.save", lang)}
        </button>
      </div>
      <input
        type="text"
        placeholder={tr("quicklog.note", lang)}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        className="mt-2 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
      />
      <div className="mt-2">
        <TimePicker value={when} onChange={setWhen} variant="compact" />
      </div>

      {warning && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2.5 dark:border-orange-800/50 dark:bg-orange-950/30">
          <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
            {tr("guard.title", lang)}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-orange-700 dark:text-orange-300">
            {warning.kind === "tooHigh"
              ? tr("guard.tooHigh", lang, {
                  entered: warning.entered,
                  last: warning.last,
                })
              : tr("guard.tooFast", lang, {
                  used: warning.used,
                  hours: warning.hours,
                  times: warning.times,
                })}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-orange-600 dark:text-orange-400">
            {warning.kind === "tooHigh"
              ? tr("guard.tooHighAction", lang)
              : warning.expected !== null
                ? tr("guard.expected", lang, { expected: warning.expected })
                : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {warning.kind === "tooHigh" && (
              <Link
                href="/log/purchase"
                className="rounded-md bg-[#003399] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#002277]"
              >
                {tr("guard.goPurchase", lang)}
              </Link>
            )}
            <button
              onClick={() => setWarning(null)}
              className="rounded-md border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/40"
            >
              {tr("guard.fix", lang)}
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {tr("guard.saveAnyway", lang)}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-100 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <span>
            {tr("quicklog.saved", lang)} ({toast.reading} kWh)
          </span>
          <button
            onClick={handleUndo}
            className="font-medium underline hover:text-emerald-600 dark:hover:text-emerald-200"
          >
            {tr("quicklog.undo", lang)}
          </button>
        </div>
      )}
    </div>
  );
}
