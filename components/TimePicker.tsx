"use client";

import { useState } from "react";
import { useLang } from "./Providers";
import { tr } from "@/lib/i18n";
import { isoToDatetimeLocal, datetimeLocalToISO } from "@/lib/utils";

interface TimePickerProps {
  /** ISO string or "" */
  value: string;
  onChange: (iso: string) => void;
  /** "compact" = single-row for QuickLog, "full" = labeled block for forms */
  variant?: "compact" | "full";
  label?: string;
}

const PRESETS = [
  { key: "time.now", minutes: 0 },
  { key: "time.30min", minutes: 30 },
  { key: "time.1h", minutes: 60 },
  { key: "time.2h", minutes: 120 },
  { key: "time.3h", minutes: 180 },
  { key: "time.6h", minutes: 360 },
  { key: "time.12h", minutes: 720 },
  { key: "time.yesterday", minutes: 1440 },
] as const;

function isoFromMinutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export default function TimePicker({
  value,
  onChange,
  variant = "full",
  label,
}: TimePickerProps) {
  const { lang } = useLang();
  const [showCustom, setShowCustom] = useState(false);

  const handlePreset = (minutes: number) => {
    setShowCustom(false);
    if (minutes === 0) {
      onChange("");
    } else {
      onChange(isoFromMinutesAgo(minutes));
    }
  };

  const handleCustom = () => {
    setShowCustom(true);
    if (!value) {
      onChange(new Date().toISOString());
    }
  };

  const handleCustomChange = (localValue: string) => {
    if (localValue) {
      onChange(datetimeLocalToISO(localValue));
    }
  };

  const isCompact = variant === "compact";

  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">{label}</label>
      )}

      {/* Preset chips */}
      <div className={`flex flex-wrap gap-1.5 ${isCompact ? "" : "mb-2"}`}>
        {PRESETS.map(({ key, minutes }) => {
          const isActive = minutes === 0 && !value && !showCustom;
          return (
            <button
              key={key}
              type="button"
              onClick={() => handlePreset(minutes)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-[#003399] text-white"
                  : "border border-zinc-300 bg-zinc-100 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white"
              }`}
            >
              {tr(key, lang)}
            </button>
          );
        })}
        <button
          type="button"
          onClick={handleCustom}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            showCustom
              ? "bg-[#003399] text-white"
              : "border border-zinc-300 bg-zinc-100 text-zinc-600 hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:text-white"
          }`}
        >
          {tr("time.custom", lang)}
        </button>
      </div>

      {/* Custom datetime picker */}
      {showCustom && (
        <input
          type="datetime-local"
          value={value ? isoToDatetimeLocal(value) : ""}
          onChange={(e) => handleCustomChange(e.target.value)}
          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white [&::-webkit-calendar-picker-indicator]:dark:invert"
        />
      )}
    </div>
  );
}
