"use client";

import { useState, useEffect, useCallback } from "react";
import { useLang, useData } from "./Providers";
import { tr } from "@/lib/i18n";
import { formatDateTimeEAT } from "@/lib/utils";
import TimePicker from "./TimePicker";

const LS_KEY = "luku-outage-active";

interface ActiveOutage {
  id: number;
  start_at: string;
}

function formatElapsed(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function OutageTracker() {
  const { lang } = useLang();
  const { refresh, outages } = useData();
  const [active, setActive] = useState<ActiveOutage | null>(null);
  const [elapsed, setElapsed] = useState("");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [showRetro, setShowRetro] = useState(false);
  const [retroStart, setRetroStart] = useState("");
  const [retroEnd, setRetroEnd] = useState("");
  const [saving, setSaving] = useState(false);

  // Load active outage from localStorage, cross-check with API data
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      try {
        const parsed: ActiveOutage = JSON.parse(stored);
        // Check if this outage was already ended (e.g. from another session)
        const match = outages.find((o) => o.id === parsed.id);
        if (match && match.end_at) {
          localStorage.removeItem(LS_KEY);
          setActive(null);
        } else {
          setActive(parsed);
        }
      } catch {
        localStorage.removeItem(LS_KEY);
      }
    }
  }, [outages]);

  // Live elapsed timer
  useEffect(() => {
    if (!active) return;
    const update = () =>
      setElapsed(
        formatElapsed(Date.now() - new Date(active.start_at).getTime())
      );
    update();
    const interval = setInterval(update, 30_000);
    return () => clearInterval(interval);
  }, [active]);

  const handlePowerOut = useCallback(async () => {
    setSaving(true);
    const iso = startTime || new Date().toISOString();
    try {
      const res = await fetch("/api/outages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_at: iso }),
      });
      const data = await res.json();
      const outage: ActiveOutage = { id: data.id, start_at: iso };
      localStorage.setItem(LS_KEY, JSON.stringify(outage));
      setActive(outage);
      setShowStartPicker(false);
      setStartTime("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [startTime, refresh]);

  const handlePowerBack = useCallback(async () => {
    if (!active) return;
    setSaving(true);
    try {
      await fetch(`/api/outages/${active.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_at: active.start_at,
          end_at: new Date().toISOString(),
        }),
      });
      localStorage.removeItem(LS_KEY);
      setActive(null);
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [active, refresh]);

  const handleRetroSave = useCallback(async () => {
    if (!retroStart || !retroEnd) return;
    setSaving(true);
    try {
      await fetch("/api/outages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_at: retroStart, end_at: retroEnd }),
      });
      setShowRetro(false);
      setRetroStart("");
      setRetroEnd("");
      await refresh();
    } finally {
      setSaving(false);
    }
  }, [retroStart, retroEnd, refresh]);

  // Active outage banner
  if (active) {
    return (
      <div className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            {tr("outage.active", lang)}
          </span>
        </div>
        <p className="mb-3 text-xs text-red-600 dark:text-red-400">
          {tr("outage.since", lang)} {formatDateTimeEAT(active.start_at)} &middot; {elapsed}
        </p>
        <button
          onClick={handlePowerBack}
          disabled={saving}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {tr("outage.powerBack", lang)}
        </button>
      </div>
    );
  }

  // Normal state — report outage
  return (
    <div className="space-y-2">
      {/* Power Out button */}
      {!showStartPicker && !showRetro && (
        <div className="flex gap-2">
          <button
            onClick={() => setShowStartPicker(true)}
            className="flex-1 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            {tr("outage.powerOut", lang)}
          </button>
          <button
            onClick={() => setShowRetro(true)}
            className="rounded-lg border border-zinc-300 px-3 py-2.5 text-xs text-zinc-500 transition-colors hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {tr("outage.logPast", lang)}
          </button>
        </div>
      )}

      {/* Power Out — when did it happen? */}
      {showStartPicker && (
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 dark:border-red-900 dark:bg-red-950/20">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {tr("outage.whenOut", lang)}
          </p>
          <TimePicker value={startTime} onChange={setStartTime} variant="compact" />
          <div className="mt-3 flex gap-2">
            <button
              onClick={handlePowerOut}
              disabled={saving}
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {tr("outage.powerOut", lang)}
            </button>
            <button
              onClick={() => { setShowStartPicker(false); setStartTime(""); }}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {tr("history.cancel", lang)}
            </button>
          </div>
        </div>
      )}

      {/* Retroactive outage logging */}
      {showRetro && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {tr("outage.logPast", lang)}
          </p>
          <div className="mb-2">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
              {tr("outage.start", lang)}
            </label>
            <TimePicker value={retroStart} onChange={setRetroStart} variant="compact" />
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
              {tr("outage.end", lang)}
            </label>
            <TimePicker value={retroEnd} onChange={setRetroEnd} variant="compact" />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleRetroSave}
              disabled={saving || !retroStart || !retroEnd}
              className="flex-1 rounded-lg bg-[#003399] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
            >
              {tr("quicklog.save", lang)}
            </button>
            <button
              onClick={() => { setShowRetro(false); setRetroStart(""); setRetroEnd(""); }}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {tr("history.cancel", lang)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
