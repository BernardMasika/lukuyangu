"use client";

import { useState, useEffect } from "react";
import { useLang, useTheme, useInstall } from "@/components/Providers";
import { tr } from "@/lib/i18n";

export default function Settings() {
  const { lang, setLang } = useLang();
  const { theme, setTheme } = useTheme();
  const { canInstall, isInstalled, promptInstall } = useInstall();
  const [meterNo, setMeterNo] = useState("");
  const [saved, setSaved] = useState(false);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState("19:00");
  const [reminderError, setReminderError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.meter_no) setMeterNo(data.meter_no);
      });

    // Load reminder settings
    try {
      const reminder = localStorage.getItem("luku-reminder");
      if (reminder) {
        const { enabled, time } = JSON.parse(reminder);
        setReminderEnabled(!!enabled);
        if (time) setReminderTime(time);
      }
    } catch { /* ignore */ }
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

  const saveReminder = async (enabled: boolean, time: string) => {
    setReminderError("");

    if (enabled) {
      if (!("Notification" in window)) {
        setReminderError(tr("reminder.permissionDenied", lang));
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setReminderError(tr("reminder.permissionDenied", lang));
        setReminderEnabled(false);
        return;
      }
    }

    setReminderEnabled(enabled);
    setReminderTime(time);

    const title = tr("reminder.notifTitle", lang);
    const body = tr("reminder.notifBody", lang);

    localStorage.setItem(
      "luku-reminder",
      JSON.stringify({ enabled, time, title, body })
    );

    if (navigator.serviceWorker?.controller) {
      if (enabled) {
        navigator.serviceWorker.controller.postMessage({
          type: "SCHEDULE_REMINDER",
          time,
          title,
          body,
        });
      } else {
        navigator.serviceWorker.controller.postMessage({
          type: "CANCEL_REMINDER",
        });
      }
    }
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

      {/* Daily Reminder */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {tr("reminder.title", lang)}
        </label>
        <p className="mb-3 text-xs text-zinc-400 dark:text-zinc-500">
          {tr("reminder.description", lang)}
        </p>

        <div className="flex items-center gap-3">
          {/* Toggle */}
          <button
            onClick={() => saveReminder(!reminderEnabled, reminderTime)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              reminderEnabled ? "bg-[#003399]" : "bg-zinc-300 dark:bg-zinc-700"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                reminderEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            {reminderEnabled
              ? tr("reminder.enabled", lang)
              : tr("reminder.disabled", lang)}
          </span>
        </div>

        {/* Time picker (only when enabled) */}
        {reminderEnabled && (
          <div className="mt-3">
            <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
              {tr("reminder.time", lang)}
            </label>
            <input
              type="time"
              value={reminderTime}
              onChange={(e) => {
                if (e.target.value) saveReminder(true, e.target.value);
              }}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white [&::-webkit-calendar-picker-indicator]:dark:invert"
            />
          </div>
        )}

        {reminderError && (
          <p className="mt-2 text-xs text-red-500 dark:text-red-400">
            {reminderError}
          </p>
        )}
      </div>

      {/* Install App */}
      {(canInstall || isInstalled) && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {isInstalled ? (
            <>
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium">{tr("install.installed", lang)}</span>
              </div>
              <p className="mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                {tr("install.uninstallHint", lang)}
              </p>
            </>
          ) : (
            <button
              onClick={promptInstall}
              className="w-full text-sm font-medium text-[#003399] dark:text-blue-400"
            >
              {tr("install.settingsBtn", lang)}
            </button>
          )}
        </div>
      )}

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
