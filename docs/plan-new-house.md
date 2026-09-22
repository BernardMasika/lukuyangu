# Plan: Google Doc feature backlog + new-house reset

Created 2026-09-22. Source: Feature Requests doc (struck-through = already shipped).
Branch: `feat/ledger-and-insights`. Re-read this file on resume.

## Root cause behind 9 of the 10 items

There is no chronological **ledger**. `app/api/stats/route.ts` walks `readings`
alone and treats any upward move as "give up" (`todayUsage = 0`). Purchases are
never merged into the timeline, so the app cannot answer: how much did I use
today (across a top-up), how long did purchase P actually last, when did P run
out, is this reading a typo, was there an unlogged outage, did I skip logging.

Fix once in `lib/ledger.ts`; every item below reads from it.

## Decisions taken (user, 2026-09-22)

- DB reset: archive to CSV first, then wipe readings/purchases/outages. **Runs last.**
- AI: server-side Claude API, new `/api/insight`, cached. Degrades silently with no key.
- Vendor: new `purchases.vendor` column + picker on the form.
- Dashboard: restructure only, keep current styling. No design-skill pipeline.

## Stages

- [x] 1. `lib/ledger.ts` — merge readings+purchases+outages into segments; FIFO
      unit accounting so each purchase has a real lifetime. + `lib/ledger.test.ts`
      (node:test, zero deps, `npm test`).
- [x] 2. Schema: `purchases.vendor` (guarded ALTER). Purchase form: vendor picker
      + time label clarified to *activation* time.            [doc #6, #7]
- [x] 3. `/api/stats` rewritten on the ledger: today's usage accumulates across
      a purchase; purchase lifetime + depletion estimate.     [doc #1, #5]
- [x] 4. Dashboard restructure, kill the duplicated "days left". [doc #3]
- [x] 5. Mistype guard in QuickLog (client-side, uses cached data). [doc #2]
- [x] 6. Detections: suspected unlogged outage, missing purchase,
      skipped-logging gap. One-tap confirm.                   [doc #8, #9]
- [x] 7. `/api/insight` — Claude-backed analysis, cached in `settings`. [doc #4]
- [x] 8. Analytics: TZS-per-unit by vendor, best channel.      [doc #7 display]
- [x] 9. Verify: `npm test`, `npm run lint`, `npm run build`, drive the app.
- [x] 10. Archive DB to CSV, then wipe. **Confirm with user before delete.**

## Open

- `ANTHROPIC_API_KEY` is NOT in `.env.local`. Stage 7 ships working but inert
  until the user adds it locally and in Vercel.
- Dashboard screenshot referenced in the doc was not available; restructure is
  based on reading `app/page.tsx` (duplication confirmed at lines 58-71 vs 128-137).

## Done 2026-09-22

All ten stages complete. Gates: `npm test` 12/12, `npm run build` clean,
`npm run lint` 5 errors + 2 warnings, **all pre-existing** in files this work did
not touch (`app/plan/page.tsx`, `app/settings/page.tsx`,
`components/ConsumptionChart.tsx`, `components/InstallBanner.tsx`).

Two bugs found by testing against the real database, not by review:

1. The 30-day burn-rate window matched on a segment's END, so the segment
   bridging a five-month logging break was averaged in and collapsed the rate to
   0.03 kWh/day, predicting the units would run out in 2055. Fixed by windowing
   on `from`, and by making `burnRateFrom` ignore segments longer than 14 days.
   Regression test: "a segment bridging a long break must not be averaged".
2. `avg7` divided by whatever active time existed in the window, so two hours of
   logging read as "60 kWh/day". Now needs a full active day or reports nothing.

Old house archived to `backups/2026-09-22T06-01-55/` before the wipe.

## Follow-ups not done (deliberately out of scope)

- 5 pre-existing lint errors above. All are the same two React Compiler rules and
  are one-line fixes, but they are in untouched files.
- `npm audit` reports vulnerabilities in `ws`, pulled in by `@libsql/client`.
  Pre-existing, not introduced here. `npm audit fix --force` would change the
  libsql major version, so it needs its own pass.
- `app/api/summary/route.ts` (the clipboard text generator) still computes
  consumption the old purchase-blind way. Lower stakes than the charts, but it is
  the last caller not reading the ledger.
