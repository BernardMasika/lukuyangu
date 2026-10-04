"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/components/Providers";
import PinCard from "@/components/PinCard";
import { markDismissed } from "@/components/Detections";
import { tr, type Lang } from "@/lib/i18n";
import { formatDateEAT, formatDateTimeEAT, getTimePeriod } from "@/lib/utils";
import type { Pin } from "@/lib/investigation";
import type { Spike } from "@/lib/ledger";

interface StripItem {
  from: string;
  to: string;
  hours: number;
  rate: number | null;
  evidence: Spike | null;
}

interface Board {
  pins: Pin[];
  strip: StripItem[];
  baseline: number | null;
  customTags: string[];
  tzsPerKwh: number;
}

const keyOf = (from: string, to: string) => `${from}|${to}`;

async function fetchBoard(): Promise<Board> {
  const res = await fetch("/api/investigations");
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Scroll to a pin's card, opening the Solved section first if it is in
 *  there, or the scroll lands on a hidden card and nothing visibly happens. */
function jumpToPin(n: number) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const card = document.getElementById(`pin-${n}`);
  const folded = card?.closest("details");
  if (folded) folded.open = true;
  card?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/** Investigation board. Fetches its own data rather than going through the
 *  Providers cache: it is the only reader, and notes must always be fresh. */
export default function Investigate() {
  const { lang } = useLang();
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  const [picking, setPicking] = useState(false);
  const [pinning, setPinning] = useState<string | null>(null);
  const [pinFailed, setPinFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchBoard()
      .then((data) => {
        if (!alive) return;
        setBoard(data);
        setFailed(false);
        // Having opened the board, the Dashboard need not announce these again.
        markDismissed(
          data.pins.filter((p) => p.status === "new").map((p) => `spike:${p.from}:${p.to}`)
        );
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [version]);

  const refresh = () => setVersion((v) => v + 1);

  /** Pin a stretch by hand, then take the user straight to its card. */
  const pinStretch = async (item: StripItem) => {
    const key = keyOf(item.from, item.to);
    setPinning(key);
    setPinFailed(false);
    try {
      const res = await fetch("/api/investigations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seg_from: item.from,
          seg_to: item.to,
          status: "open",
          origin: "manual",
          causes: [],
          notes: "",
          snapshot: item.evidence,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await fetchBoard();
      setBoard(data);
      setPicking(false);
      const pinned = data.pins.find((p) => keyOf(p.from, p.to) === key);
      // Give React a frame to render the new card before scrolling to it.
      if (pinned) setTimeout(() => jumpToPin(pinned.number), 60);
    } catch {
      setPinFailed(true);
    } finally {
      setPinning(null);
    }
  };

  const onBoard = new Set(board ? board.pins.map((p) => keyOf(p.from, p.to)) : []);

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

      {board && board.strip.length > 0 && (
        <div>
          <button
            type="button"
            aria-expanded={picking}
            onClick={() => setPicking((v) => !v)}
            className="w-full rounded-xl border border-dashed border-[#003399] px-4 py-3 text-sm font-medium text-[#003399] hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-blue-950/30"
          >
            {picking ? tr("investigate.close", lang) : tr("investigate.pinStretch", lang)}
          </button>
          {picking && (
            <div className="mt-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {tr("investigate.pickTitle", lang)}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {tr("investigate.pickHint", lang)}
              </p>
              {pinFailed && (
                <p role="alert" className="mt-2 text-xs text-red-500 dark:text-red-400">
                  {tr("investigate.pinFailed", lang)}
                </p>
              )}
              <ul className="mt-2 max-h-96 divide-y divide-zinc-100 overflow-y-auto dark:divide-zinc-800">
                {[...board.strip].reverse().map((item) => {
                  const key = keyOf(item.from, item.to);
                  const already = onBoard.has(key);
                  const e = item.evidence;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        disabled={already || pinning !== null}
                        onClick={() => pinStretch(item)}
                        className="w-full px-1 py-2.5 text-left hover:bg-zinc-50 disabled:cursor-default disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-zinc-800"
                      >
                        <span className="block text-sm text-zinc-800 dark:text-zinc-100">
                          {formatDateTimeEAT(item.from)} → {formatDateTimeEAT(item.to)}
                        </span>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                          {tr(`period.${getTimePeriod(item.from)}`, lang)} →{" "}
                          {tr(`period.${getTimePeriod(item.to)}`, lang)}
                          {e && (
                            <>
                              {" · "}
                              {tr("investigate.used", lang, { kwh: e.consumption })}
                              {" · "}
                              {e.rate} kWh/{lang === "sw" ? "siku" : "day"}
                              {" · "}
                              {tr("pin.ratio", lang, { ratio: e.ratio })}
                            </>
                          )}
                          {already && (
                            <span className="ml-1 font-medium text-blue-700 dark:text-blue-300">
                              · {tr("investigate.onBoard", lang)}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
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


  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div
        role="group"
        aria-label={tr("investigate.stripLabel", lang, { count: pinAt.size })}
        className="relative h-28 w-full"
      >
        <div className="absolute inset-x-0 bottom-0 top-7 flex items-end gap-px">
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
                    onClick={() => jumpToPin(n)}
                    aria-label={tr("investigate.jumpTo", lang, { n })}
                    className="absolute -top-7 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-orange-700 text-[11px] font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
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
      <div className="mt-2 flex flex-wrap justify-between gap-x-3 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{formatDateEAT(board.strip[0].from)}</span>
        <span className="text-emerald-700 dark:text-emerald-400">
          - - {tr("investigate.normal", lang, { baseline })}
        </span>
        <span>{formatDateEAT(board.strip[board.strip.length - 1].to)}</span>
      </div>
    </div>
  );
}
