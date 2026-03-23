"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { Lang } from "@/lib/i18n";

// --- Language Context ---
const LangContext = createContext<{
  lang: Lang;
  setLang: (l: Lang) => void;
}>({ lang: "en", setLang: () => {} });

export function useLang() {
  return useContext(LangContext);
}

// --- Theme Context ---
const ThemeContext = createContext<{
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
}>({ theme: "dark", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

// --- Install Prompt Context ---
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const InstallContext = createContext<{
  canInstall: boolean;
  isInstalled: boolean;
  promptInstall: () => Promise<void>;
}>({ canInstall: false, isInstalled: false, promptInstall: async () => {} });

export function useInstall() {
  return useContext(InstallContext);
}

// --- Data Cache Context ---
interface Stats {
  todayUsage: number | null;
  avg7: number | null;
  spentThisMonth: number;
  burnRate: number | null;
  latestReading: number | null;
  daysRemaining: number | null;
  readingCount: number;
  hasLoggedToday: boolean;
  outageHoursThisMonth: number;
  outageCount: number;
  activeOutage: boolean;
}

interface Reading {
  id: number;
  reading: number;
  note: string;
  created_at: string;
}

interface Purchase {
  id: number;
  units: number;
  amount_tzs: number;
  note: string;
  created_at: string;
}

interface Change {
  weekStart: string;
  consumption: number;
  baseline: number;
  deviation: number;
  direction: "above" | "below";
}

export interface Outage {
  id: number;
  start_at: string;
  end_at: string | null;
  note: string;
  created_at: string;
}

interface DataContextValue {
  stats: Stats | null;
  readings: Reading[];
  purchases: Purchase[];
  changes: Change[];
  outages: Outage[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const DataContext = createContext<DataContextValue>({
  stats: null,
  readings: [],
  purchases: [],
  changes: [],
  outages: [],
  loading: true,
  refresh: async () => {},
});

export function useData() {
  return useContext(DataContext);
}

export function Providers({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [theme, setThemeState] = useState<"dark" | "light">("dark");
  const [mounted, setMounted] = useState(false);

  // Data cache state
  const [stats, setStats] = useState<Stats | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [outages, setOutages] = useState<Outage[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const refreshData = useCallback(async () => {
    try {
      const [statsRes, readingsRes, purchasesRes, changesRes, outagesRes] =
        await Promise.all([
          fetch("/api/stats"),
          fetch("/api/readings"),
          fetch("/api/purchases"),
          fetch("/api/changes"),
          fetch("/api/outages"),
        ]);
      const [statsData, readingsData, purchasesData, changesData, outagesData] =
        await Promise.all([
          statsRes.json(),
          readingsRes.json(),
          purchasesRes.json(),
          changesRes.json(),
          outagesRes.json(),
        ]);
      setStats(statsData);
      setReadings(readingsData);
      setPurchases(purchasesData);
      setChanges(changesData.changes || []);
      setOutages(outagesData);
    } catch {
      // silent
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Install prompt state
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const savedLang = localStorage.getItem("luku-lang") as Lang | null;
    const savedTheme = localStorage.getItem("luku-theme") as
      | "dark"
      | "light"
      | null;
    if (savedLang) setLangState(savedLang);
    if (savedTheme) setThemeState(savedTheme);
    setMounted(true);

    // Fetch all data once on app load
    refreshData();

    // Check if already installed (standalone mode or previously accepted)
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      localStorage.getItem("luku-installed") === "1"
    ) {
      setIsInstalled(true);
    }

    // Register service worker and re-schedule reminder if active
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(() => {
        // Re-send reminder schedule to SW on every load (SW may have restarted)
        const reminder = localStorage.getItem("luku-reminder");
        if (reminder) {
          try {
            const { enabled, time, title, body } = JSON.parse(reminder);
            if (enabled && time && navigator.serviceWorker.controller) {
              navigator.serviceWorker.controller.postMessage({
                type: "SCHEDULE_REMINDER",
                time,
                title,
                body,
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }).catch(() => {});
    }

    // Capture install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setIsInstalled(true);
      setCanInstall(false);
      localStorage.setItem("luku-installed", "1");
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme, mounted]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("luku-lang", l);
  };

  const setTheme = (t: "dark" | "light") => {
    setThemeState(t);
    localStorage.setItem("luku-theme", t);
  };

  const promptInstall = async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === "accepted") {
      setCanInstall(false);
      setIsInstalled(true);
      localStorage.setItem("luku-installed", "1");
    }
    deferredPrompt.current = null;
    // Dismiss banner regardless of outcome (don't nag)
    localStorage.setItem("luku-install-dismissed", "1");
  };

  if (!mounted) {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <ThemeContext.Provider value={{ theme, setTheme }}>
        <InstallContext.Provider value={{ canInstall, isInstalled, promptInstall }}>
          <DataContext.Provider
            value={{
              stats,
              readings,
              purchases,
              changes,
              outages,
              loading: dataLoading,
              refresh: refreshData,
            }}
          >
            {children}
          </DataContext.Provider>
        </InstallContext.Provider>
      </ThemeContext.Provider>
    </LangContext.Provider>
  );
}
