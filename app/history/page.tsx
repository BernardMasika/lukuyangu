"use client";

import { useState } from "react";
import { useLang, useData } from "@/components/Providers";
import { tr, VENDORS } from "@/lib/i18n";
import { formatDateTimeEAT, getTimePeriod } from "@/lib/utils";
import { buildSegments, purchaseLifetimes } from "@/lib/ledger";
import ConfirmModal from "@/components/ConfirmModal";
import TimePicker from "@/components/TimePicker";

export default function History() {
  const { lang } = useLang();
  const { readings, purchases, outages, refresh } = useData();

  // Readings arrive newest first; the ledger wants them chronological.
  const chronological = [...readings].reverse();
  const lifetimes = purchaseLifetimes(
    buildSegments(chronological, purchases, outages),
    purchases,
    chronological[0]?.reading ?? 0
  );
  const [tab, setTab] = useState<"readings" | "purchases" | "outages">("readings");
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "reading" | "purchase" | "outage";
    id: number;
  } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const endpointMap = {
      reading: `/api/readings/${deleteTarget.id}`,
      purchase: `/api/purchases/${deleteTarget.id}`,
      outage: `/api/outages/${deleteTarget.id}`,
    };
    await fetch(endpointMap[deleteTarget.type], { method: "DELETE" });
    setDeleteTarget(null);
    refresh();
  };

  const startEdit = (type: "reading" | "purchase", item: (typeof readings)[0] | (typeof purchases)[0]) => {
    setEditId(item.id);
    if (type === "reading") {
      const r = item as (typeof readings)[0];
      setEditValues({ reading: String(r.reading), note: r.note, created_at: r.created_at });
    } else {
      const p = item as (typeof purchases)[0];
      setEditValues({
        units: String(p.units),
        amount_tzs: String(p.amount_tzs),
        note: p.note,
        vendor: p.vendor ?? "",
        created_at: p.created_at,
      });
    }
  };

  const saveEdit = async (type: "reading" | "purchase") => {
    if (!editId) return;
    const endpoint =
      type === "reading"
        ? `/api/readings/${editId}`
        : `/api/purchases/${editId}`;
    const body =
      type === "reading"
        ? { reading: Number(editValues.reading), note: editValues.note, created_at: editValues.created_at }
        : {
            units: Number(editValues.units),
            amount_tzs: Number(editValues.amount_tzs),
            note: editValues.note,
            // Carried through so editing a purchase does not silently drop
            // where it was bought.
            vendor: editValues.vendor ?? "",
            created_at: editValues.created_at,
          };
    await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setEditId(null);
    refresh();
  };

  const startEditOutage = (item: (typeof outages)[0]) => {
    setEditId(item.id);
    setEditValues({
      start_at: item.start_at,
      end_at: item.end_at || "",
      note: item.note,
    });
  };

  const saveEditOutage = async () => {
    if (!editId) return;
    await fetch(`/api/outages/${editId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        start_at: editValues.start_at,
        end_at: editValues.end_at || null,
        note: editValues.note,
      }),
    });
    setEditId(null);
    refresh();
  };

  const formatOutageDuration = (start: string, end: string | null): string => {
    if (!end) return tr("outage.ongoing", lang);
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const totalMin = Math.floor(ms / 60_000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h} ${tr("outage.hours", lang)} ${m} ${tr("outage.minutes", lang)}`;
    return `${m} ${tr("outage.minutes", lang)}`;
  };

  const readingsWithDelta = readings.map((r, i) => {
    if (i === readings.length - 1) return { ...r, delta: null as number | null };
    const next = readings[i + 1];
    const delta = next.reading > r.reading ? next.reading - r.reading : null;
    return { ...r, delta };
  });

  const inputClass = "w-full rounded border border-zinc-300 bg-zinc-50 px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{tr("history.title", lang)}</h1>

      {/* Tabs */}
      <div className="flex rounded-lg border border-zinc-300 overflow-hidden dark:border-zinc-700">
        <button
          onClick={() => setTab("readings")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === "readings"
              ? "bg-[#003399] text-white"
              : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {tr("history.readings", lang)}
        </button>
        <button
          onClick={() => setTab("purchases")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === "purchases"
              ? "bg-[#003399] text-white"
              : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {tr("history.purchases", lang)}
        </button>
        <button
          onClick={() => setTab("outages")}
          className={`flex-1 py-2 text-sm font-medium transition-colors ${
            tab === "outages"
              ? "bg-[#003399] text-white"
              : "bg-zinc-100 text-zinc-500 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {tr("history.outages", lang)}
        </button>
      </div>

      {/* Readings */}
      {tab === "readings" && (
        <div className="space-y-2">
          {readings.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {tr("history.noReadings", lang)}
            </p>
          )}
          {readingsWithDelta.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {editId === r.id ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    step="0.1"
                    value={editValues.reading}
                    onChange={(e) =>
                      setEditValues({ ...editValues, reading: e.target.value })
                    }
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={editValues.note}
                    onChange={(e) =>
                      setEditValues({ ...editValues, note: e.target.value })
                    }
                    className={inputClass}
                  />
                  <TimePicker
                    value={editValues.created_at}
                    onChange={(iso) =>
                      setEditValues({ ...editValues, created_at: iso })
                    }
                    variant="compact"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit("reading")}
                      className="rounded bg-[#003399] px-3 py-1 text-xs text-white"
                    >
                      {tr("history.save", lang)}
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                    >
                      {tr("history.cancel", lang)}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {r.reading} kWh
                      {r.delta !== null && (
                        <span className="ml-2 text-xs text-orange-500 dark:text-orange-400">
                          -{r.delta} {tr("history.consumption", lang)}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDateTimeEAT(r.created_at)}
                      <span className="ml-1 text-blue-500 dark:text-blue-400">
                        · {tr(`period.${getTimePeriod(r.created_at)}`, lang)}
                      </span>
                      {r.note && ` · ${r.note}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => startEdit("reading", r)}
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
                    >
                      {tr("history.edit", lang)}
                    </button>
                    <button
                      onClick={() =>
                        setDeleteTarget({ type: "reading", id: r.id })
                      }
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                    >
                      {tr("history.delete", lang)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Purchases */}
      {tab === "purchases" && (
        <div className="space-y-2">
          {purchases.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {tr("history.noPurchases", lang)}
            </p>
          )}
          {purchases.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {editId === p.id ? (
                <div className="space-y-2">
                  <input
                    type="number"
                    step="0.1"
                    value={editValues.units}
                    onChange={(e) =>
                      setEditValues({ ...editValues, units: e.target.value })
                    }
                    className={inputClass}
                    placeholder="Units"
                  />
                  <input
                    type="number"
                    value={editValues.amount_tzs}
                    onChange={(e) =>
                      setEditValues({
                        ...editValues,
                        amount_tzs: e.target.value,
                      })
                    }
                    className={inputClass}
                    placeholder="Amount TZS"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {VENDORS.map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setEditValues({
                            ...editValues,
                            vendor: editValues.vendor === v ? "" : v,
                          })
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          editValues.vendor === v
                            ? "border-[#003399] bg-[#003399] text-white"
                            : "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {tr(`vendor.${v}`, lang)}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={editValues.note}
                    onChange={(e) =>
                      setEditValues({ ...editValues, note: e.target.value })
                    }
                    className={inputClass}
                  />
                  <TimePicker
                    value={editValues.created_at}
                    onChange={(iso) =>
                      setEditValues({ ...editValues, created_at: iso })
                    }
                    variant="compact"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEdit("purchase")}
                      className="rounded bg-[#003399] px-3 py-1 text-xs text-white"
                    >
                      {tr("history.save", lang)}
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                    >
                      {tr("history.cancel", lang)}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {p.units} kWh ·{" "}
                      <span className="text-zinc-600 dark:text-zinc-300">
                        TZS {p.amount_tzs.toLocaleString()}
                      </span>
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                        {tr("history.rate", lang)}: TZS{" "}
                        {Math.round(p.amount_tzs / p.units)}/kWh
                      </span>
                    </p>
                    {/* How long this purchase actually lasted, FIFO. The old
                        version measured purchase-to-purchase, which counted
                        the days a top-up sat unused behind older units. */}
                    {(() => {
                      const life = lifetimes.find((l) => l.purchaseId === p.id);
                      if (!life) return null;

                      if (!life.started) {
                        return (
                          <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                            {tr("history.notStarted", lang)}
                          </p>
                        );
                      }
                      if (life.running) {
                        return (
                          <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                            {tr("history.stillRunning", lang, {
                              days: Math.max(1, Math.round(life.days)),
                            })}
                          </p>
                        );
                      }
                      return (
                        <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                          {tr("history.lastedDays", lang, { days: life.days })}
                          {life.exhaustedAt && (
                            <span className="text-zinc-400 dark:text-zinc-500">
                              {" · "}
                              {tr(
                                life.exhaustedEstimated
                                  ? "detect.ranOutAbout"
                                  : "detect.ranOutAt",
                                lang,
                                { when: formatDateTimeEAT(life.exhaustedAt) }
                              )}
                            </span>
                          )}
                        </p>
                      );
                    })()}
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDateTimeEAT(p.created_at)}
                      <span className="ml-1 text-blue-500 dark:text-blue-400">
                        · {tr(`period.${getTimePeriod(p.created_at)}`, lang)}
                      </span>
                      {p.vendor && ` · ${tr(`vendor.${p.vendor}`, lang)}`}
                      {p.note && ` · ${p.note}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => startEdit("purchase", p)}
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
                    >
                      {tr("history.edit", lang)}
                    </button>
                    <button
                      onClick={() =>
                        setDeleteTarget({ type: "purchase", id: p.id })
                      }
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                    >
                      {tr("history.delete", lang)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Outages */}
      {tab === "outages" && (
        <div className="space-y-2">
          {outages.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
              {tr("outage.noOutages", lang)}
            </p>
          )}
          {outages.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {editId === o.id ? (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                      {tr("outage.start", lang)}
                    </label>
                    <TimePicker
                      value={editValues.start_at}
                      onChange={(iso) =>
                        setEditValues({ ...editValues, start_at: iso })
                      }
                      variant="compact"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400">
                      {tr("outage.end", lang)}
                    </label>
                    <TimePicker
                      value={editValues.end_at}
                      onChange={(iso) =>
                        setEditValues({ ...editValues, end_at: iso })
                      }
                      variant="compact"
                    />
                  </div>
                  <input
                    type="text"
                    value={editValues.note}
                    onChange={(e) =>
                      setEditValues({ ...editValues, note: e.target.value })
                    }
                    className={inputClass}
                    placeholder={tr("quicklog.note", lang)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEditOutage}
                      className="rounded bg-[#003399] px-3 py-1 text-xs text-white"
                    >
                      {tr("history.save", lang)}
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="rounded border border-zinc-300 px-3 py-1 text-xs text-zinc-500 dark:border-zinc-600 dark:text-zinc-400"
                    >
                      {tr("history.cancel", lang)}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      {!o.end_at && (
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
                      )}
                      <p className="text-sm font-medium text-zinc-900 dark:text-white">
                        {formatOutageDuration(o.start_at, o.end_at)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      {formatDateTimeEAT(o.start_at)}
                      {o.end_at && ` → ${formatDateTimeEAT(o.end_at)}`}
                      {o.note && ` · ${o.note}`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => startEditOutage(o)}
                      className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-white"
                    >
                      {tr("history.edit", lang)}
                    </button>
                    <button
                      onClick={() =>
                        setDeleteTarget({ type: "outage", id: o.id })
                      }
                      className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
                    >
                      {tr("history.delete", lang)}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
