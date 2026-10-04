"use client";

import { useState } from "react";
import { useLang } from "./Providers";
import ConfirmModal from "./ConfirmModal";
import { tr } from "@/lib/i18n";
import { formatDateTimeEAT, getTimePeriod } from "@/lib/utils";
import { MAX_NOTES, STARTER_CAUSES, type Pin, type Status } from "@/lib/investigation";

const chip =
  "rounded-full border px-2.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500";
const chipOn = "border-[#003399] bg-[#003399] text-white";
const chipOff =
  "border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

/**
 * One pin: the evidence, then the user's investigation. Saving sends the whole
 * state (notes, causes, status) so the row always matches what is on screen.
 */
export default function PinCard({
  pin,
  tzsPerKwh,
  customTags,
  onChanged,
}: {
  pin: Pin;
  tzsPerKwh: number;
  customTags: string[];
  onChanged: () => void;
}) {
  const { lang } = useLang();
  const [notes, setNotes] = useState(pin.row?.notes ?? "");
  const [causes, setCauses] = useState<string[]>(pin.row?.causes ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<"saved" | "failed" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const e = pin.evidence;
  const status: Status = pin.status === "solved" ? "solved" : "open";
  const label = (c: string) =>
    (STARTER_CAUSES as readonly string[]).includes(c) ? tr(`cause.${c}`, lang) : c;
  const allTags = [
    ...STARTER_CAUSES,
    ...customTags,
    ...causes.filter(
      (c) => !(STARTER_CAUSES as readonly string[]).includes(c) && !customTags.includes(c)
    ),
  ];

  const save = async (nextStatus: Status) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/investigations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seg_from: pin.from,
          seg_to: pin.to,
          status: nextStatus,
          // Only used when this save creates the row.
          origin: pin.manual ? "manual" : "auto",
          causes,
          notes,
          snapshot: pin.evidence,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setMessage("saved");
      onChanged();
    } catch {
      setMessage("failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setConfirmClear(false);
    if (!pin.row) return;
    setBusy(true);
    try {
      await fetch(`/api/investigations/${pin.row.id}`, { method: "DELETE" });
      // The card keeps its key, so wipe the local state it was showing.
      setNotes("");
      setCauses([]);
      setMessage(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (c: string) =>
    setCauses((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const addTag = () => {
    // Same normalisation as the server, so the chip does not change on save.
    const tag = tagDraft.trim().replace(/\s+/g, " ").slice(0, 40).toLowerCase();
    if (tag && !causes.some((c) => c.toLowerCase() === tag.toLowerCase())) {
      setCauses((prev) => [...prev, tag]);
    }
    setTagDraft("");
  };

  return (
    <div
      id={`pin-${pin.number}`}
      className="scroll-mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      {/* Evidence */}
      <div className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-bold text-white">
          {pin.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">
            {formatDateTimeEAT(pin.from)} → {formatDateTimeEAT(pin.to)}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400">
            {tr(`period.${getTimePeriod(pin.from)}`, lang)} →{" "}
            {tr(`period.${getTimePeriod(pin.to)}`, lang)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {pin.status === "new" && (
              <span className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">
                {tr("pin.new", lang)}
              </span>
            )}
            {pin.manual && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                {tr("pin.manual", lang)}
              </span>
            )}
            {pin.belowThreshold && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {tr("pin.belowThreshold", lang)}
              </span>
            )}
            {pin.readingsChanged && (
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                {tr("pin.readingsChanged", lang)}
              </span>
            )}
          </div>
        </div>
      </div>

      {e ? (
        <div className="mt-3 space-y-0.5 text-sm">
          <p className="font-medium text-zinc-800 dark:text-zinc-100">
            {e.rate} kWh/{lang === "sw" ? "siku" : "day"} ·{" "}
            <span className="text-orange-700 dark:text-orange-400">
              {tr("pin.ratio", lang, { ratio: e.ratio })}
            </span>
          </p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("pin.extra", lang, {
              kwh: e.extraKwh,
              tzs: Math.round(e.extraKwh * tzsPerKwh).toLocaleString(),
            })}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {e.outageOverlap && <ContextChip text={tr("pin.outage", lang)} />}
            {e.purchaseInside && <ContextChip text={tr("pin.purchase", lang)} />}
            {e.overnight && <ContextChip text={tr("pin.overnight", lang)} />}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs italic text-zinc-400 dark:text-zinc-500">
          {tr("pin.noNumbers", lang)}
        </p>
      )}

      {/* Investigation */}
      <label className="mt-4 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {tr("pin.notes", lang)}
        <textarea
          value={notes}
          onChange={(ev) => setNotes(ev.target.value)}
          maxLength={MAX_NOTES}
          rows={3}
          placeholder={tr("pin.notesPlaceholder", lang)}
          className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-[#003399] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
        />
      </label>

      <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {tr("pin.causes", lang)}
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {allTags.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={causes.includes(c)}
            onClick={() => toggle(c)}
            className={`${chip} ${causes.includes(c) ? chipOn : chipOff}`}
          >
            {label(c)}
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={tagDraft}
          onChange={(ev) => setTagDraft(ev.target.value)}
          onKeyDown={(ev) => ev.key === "Enter" && addTag()}
          maxLength={40}
          placeholder={tr("pin.tagPlaceholder", lang)}
          aria-label={tr("pin.addTag", lang)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-[#003399] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
        />
        <button type="button" onClick={addTag} className={`${chip} ${chipOff}`}>
          {tr("pin.add", lang)}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => save(status)}
          className="rounded-md bg-[#003399] px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 text-xs font-medium text-white hover:bg-[#002277] disabled:opacity-50"
        >
          {tr("pin.save", lang)}
        </button>
        {status === "open" ? (
          <button
            type="button"
            disabled={busy || causes.length === 0}
            title={causes.length === 0 ? tr("pin.needCause", lang) : undefined}
            onClick={() => save("solved")}
            className="rounded-md border border-emerald-600 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
          >
            {tr("pin.markSolved", lang)}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => save("open")}
            className="rounded-md border border-zinc-300 px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {tr("pin.reopen", lang)}
          </button>
        )}
        {pin.row && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmClear(true)}
            className="ml-auto rounded px-2 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
          >
            {tr("pin.clear", lang)}
          </button>
        )}
        {status === "open" && causes.length === 0 && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {tr("pin.needCause", lang)}
          </span>
        )}
        <span role="status" className="text-xs">
          {message === "saved" && (
            <span className="text-emerald-600 dark:text-emerald-400">{tr("pin.saved", lang)}</span>
          )}
          {message === "failed" && (
            <span className="text-red-500 dark:text-red-400">{tr("pin.saveFailed", lang)}</span>
          )}
        </span>
      </div>

      <ConfirmModal
        open={confirmClear}
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function ContextChip({ text }: { text: string }) {
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
      {text}
    </span>
  );
}
