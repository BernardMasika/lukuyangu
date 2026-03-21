"use client";

export default function StatCard({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  accent?: "green" | "red" | "blue";
}) {
  const accentColors = {
    green: "text-emerald-600 dark:text-emerald-400",
    red: "text-orange-600 dark:text-orange-400",
    blue: "text-blue-600 dark:text-blue-400",
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 min-w-0">
      <p className="truncate text-[10px] sm:text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p
        className={`mt-1 text-lg sm:text-2xl font-bold truncate ${
          accent ? accentColors[accent] : "text-zinc-900 dark:text-white"
        }`}
      >
        {value !== null && value !== undefined ? value : "—"}
        {unit && (
          <span className="ml-0.5 sm:ml-1 text-[10px] sm:text-sm font-normal text-zinc-400 dark:text-zinc-500">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
