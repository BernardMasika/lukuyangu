"use client";

import { useState, useRef } from "react";
import { useLang } from "./Providers";
import { tr } from "@/lib/i18n";
import TimePicker from "./TimePicker";

export default function QuickLog({ onSaved }: { onSaved?: () => void }) {
  const { lang } = useLang();
  const [reading, setReading] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ id: number; reading: string } | null>(
    null
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = async () => {
    if (!reading || isNaN(Number(reading))) return;
    setSaving(true);

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
      onSaved?.();

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setToast(null), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!toast) return;
    await fetch(`/api/readings/${toast.id}`, { method: "DELETE" });
    setToast(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    onSaved?.();
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
          onChange={(e) => setReading(e.target.value)}
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
