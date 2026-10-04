"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/components/Providers";
import PinCard from "@/components/PinCard";
import { tr, type Lang } from "@/lib/i18n";
import { formatDateEAT } from "@/lib/utils";
import type { Pin } from "@/lib/investigation";

interface StripItem {
  from: string;
  to: string;
  hours: number;
  rate: number | null;
}

interface Board {
  pins: Pin[];
  strip: StripItem[];
  baseline: number | null;
  customTags: string[];
  tzsPerKwh: number;
}

/** Investigation board. Fetches its own data rather than going through the
 *  Providers cache: it is the only reader, and notes must always be fresh. */
export default function Investigate() {
  const { lang } = useLang();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/investigations")
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json() as Promise<Board>;
      })
      .then((data) => {
        if (!alive) return;
        setBoard(data);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [version]);

  const refresh = () => setVersion((v) => v + 1);

  const open = board
    ? board.pins.filter((p) => p.status !== "solved").sort((a, b) => b.number - a.number)
    : [];
  const solved = board
    ? board.pins.filter((p) => p.status === "solved").sort((a, b) => b.number - a.number)
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{tr("investigate.title", lang)}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {tr("investigate.description", lang)}
        </p>
      </div>

      {failed && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {tr("investigate.loadFailed", lang)}
        </p>
      )}

      {board && board.strip.length > 0 && board.baseline !== null && (
        <Strip board={board} lang={lang} />
      )}

      {board && board.pins.length === 0 && (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          {board.baseline !== null
            ? tr("investigate.empty", lang, { baseline: board.baseline })
            : tr("investigate.noBaseline", lang)}
        </p>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {tr("investigate.open", lang)}
          </h2>
          {open.map((pin) => (
            <PinCard
              key={`${pin.from}|${pin.to}`}
              pin={pin}
              tzsPerKwh={board!.tzsPerKwh}
              customTags={board!.customTags}
              onChanged={refresh}
            />
          ))}
        </section>
      )}

      {solved.length > 0 && (
        <details className="group space-y-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            {tr("investigate.solved", lang, { count: solved.length })}
          </summary>
          <div className="mt-3 space-y-3">
            {solved.map((pin) => (
              <PinCard
                key={`${pin.from}|${pin.to}`}
                pin={pin}
                tzsPerKwh={board!.tzsPerKwh}
                customTags={board!.customTags}
                onChanged={refresh}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Thirty days of segments: width follows duration, height follows rate. A
 * stretch over a day is drawn as a fixed hatched block, so a week away does
 * not squeeze everything else into a sliver.
 */
function Strip({ board, lang }: { board: Board; lang: Lang }) {
  const baseline = board.baseline ?? 0;
  const maxRate = Math.max(baseline * 2.5, ...board.strip.map((s) => s.rate ?? 0), 1);
  const pinAt = new Map(
    board.pins
      .filter((p) => !p.readingsChanged)
      .map((p): [string, number] => [`${p.from}|${p.to}`, p.number])
  );

  const jump = (n: number) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(`pin-${n}`)
      ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div
        role="img"
        aria-label={tr("investigate.stripLabel", lang, { count: pinAt.size })}
        className="relative h-28 w-full"
      >
        <div className="absolute inset-x-0 bottom-0 top-6 flex items-end gap-px">
          {board.strip.map((s) => {
            const gap = s.hours > 24;
            const n = pinAt.get(`${s.from}|${s.to}`);
            return (
              <div
                key={s.from}
                className="relative h-full min-w-px"
                style={{ flexGrow: gap ? 6 : Math.max(s.hours, 0.3), flexBasis: 0 }}
              >
                {gap ? (
                  <div
                    aria-hidden
                    title={tr("investigate.notLogged", lang)}
                    className="absolute inset-0 rounded-sm text-zinc-300 dark:text-zinc-700"
                    style={{
                      backgroundImage:
                        "repeating-linear-gradient(45deg, currentColor 0 2px, transparent 2px 6px)",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden
                    className={`absolute inset-x-0 bottom-0 rounded-t-sm ${
                      n ? "bg-orange-500" : "bg-[#003399] dark:bg-blue-500"
                    }`}
                    style={{ height: `${Math.min(1, (s.rate ?? 0) / maxRate) * 100}%` }}
                  />
                )}
                {n !== undefined && (
                  <button
                    type="button"
                    onClick={() => jump(n)}
                    aria-label={`${n}`}
                    className="absolute -top-6 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white"
                  >
                    {n}
                  </button>
                )}
              </div>
            );
          })}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-emerald-500"
            style={{ bottom: `${(baseline / maxRate) * 100}%` }}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>{formatDateEAT(board.strip[0].from)}</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          - - {tr("investigate.normal", lang, { baseline })}
        </span>
        <span>{formatDateEAT(board.strip[board.strip.length - 1].to)}</span>
      </div>
    </div>
  );
}
