"use client";

export default function Nudge({
  text,
  variant = "info",
}: {
  text: string;
  variant?: "info" | "warning" | "success";
}) {
  const styles = {
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300",
    warning: "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/50 dark:bg-orange-950/30 dark:text-orange-300",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-300",
  };

  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[variant]}`}>
      {text}
    </div>
  );
}
