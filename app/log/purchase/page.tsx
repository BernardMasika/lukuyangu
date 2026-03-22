"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLang, useData } from "@/components/Providers";
import { tr } from "@/lib/i18n";
import TimePicker from "@/components/TimePicker";

export default function LogPurchase() {
  const { lang } = useLang();
  const { refresh } = useData();
  const router = useRouter();
  const [units, setUnits] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!units || !amount) return;
    setSaving(true);

    try {
      await fetch("/api/purchases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          units: Number(units),
          amount_tzs: Number(amount),
          note,
          ...(when ? { created_at: when } : {}),
        }),
      });
      refresh();
      router.push("/");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{tr("purchase.title", lang)}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            {tr("purchase.units", lang)}
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            required
            value={units}
            onChange={(e) => setUnits(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            {tr("purchase.amount", lang)}
          </label>
          <input
            type="number"
            inputMode="numeric"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
            {tr("purchase.note", lang)}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="M-Pesa, CRDB..."
            className={inputClass}
          />
        </div>

        <TimePicker
          value={when}
          onChange={setWhen}
          label={tr("purchase.when", lang)}
        />

        <button
          type="submit"
          disabled={saving || !units || !amount}
          className="w-full rounded-lg bg-[#003399] py-3 text-sm font-medium text-white transition-colors hover:bg-[#002277] disabled:opacity-50"
        >
          {tr("purchase.submit", lang)}
        </button>
      </form>
    </div>
  );
}
