"use client";

import { useState, useEffect } from "react";
import { useLang, useTheme } from "@/components/Providers";
import { tr } from "@/lib/i18n";

export default function Settings() {
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const [meterNo, setMeterNo] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.meter_no) setMeterNo(data.meter_no);
      });
  }, []);

  const saveMeterNo = async () => {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "meter_no", value: meterNo }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const exportData = () => {
    window.location.href = "/api/export";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{tr("settings.title", lang)}</h1>

      {/* Meter Number */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {tr("settings.meterNo", lang)}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={meterNo}
            onChange={(e) => setMeterNo(e.target.value)}
            className="flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <button
            onClick={saveMeterNo}
            className="rounded-lg bg-[#003399] px-4 py-2 text-sm font-medium text-white hover:bg-[#002277]"
          >
            {saved ? tr("settings.saved", lang) : tr("history.save", lang)}
          </button>
        </div>
      </div>

      {/* Language */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {tr("settings.language", lang)}
        </label>
        <div className="flex rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
          <button
            onClick={() => setLang("sw")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              lang === "sw"
                ? "bg-[#003399] text-white"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            Kiswahili
          </button>
          <button
            onClick={() => setLang("en")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              lang === "en"
                ? "bg-[#003399] text-white"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-2 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {tr("settings.theme", lang)}
        </label>
        <div className="flex rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
          <button
            onClick={() => setTheme("dark")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              theme === "dark"
                ? "bg-[#003399] text-white"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {tr("settings.dark", lang)}
          </button>
          <button
            onClick={() => setTheme("light")}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              theme === "light"
                ? "bg-[#003399] text-white"
                : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            {tr("settings.light", lang)}
          </button>
        </div>
      </div>

      {/* Export */}
      <button
        onClick={exportData}
        className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
      >
        {tr("settings.export", lang)}
      </button>

      {/* Credit */}
      <p className="pt-4 text-center text-xs text-zinc-400 dark:text-zinc-500">
        Made with love by{" "}
        <a
          href="https://www.bernardmasika.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#003399] underline dark:text-blue-400"
        >
          Bernard Masika
        </a>
      </p>
    </div>
  );
}
