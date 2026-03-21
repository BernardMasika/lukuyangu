"use client";

import { useState, useEffect } from "react";
import { useLang, useInstall } from "./Providers";
import { tr } from "@/lib/i18n";

export default function InstallBanner() {
  const { lang } = useLang();
  const { canInstall, promptInstall } = useInstall();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(!!localStorage.getItem("luku-install-dismissed"));
  }, []);

  if (!canInstall || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("luku-install-dismissed", "1");
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            {tr("install.title", lang)}
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("install.message", lang)}
          </p>
        </div>
        <button
          onClick={promptInstall}
          className="shrink-0 rounded-lg bg-[#003399] px-4 py-2 text-xs font-medium text-white hover:bg-[#002277]"
        >
          {tr("install.button", lang)}
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 p-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
