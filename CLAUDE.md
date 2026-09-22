# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project: Luku Yangu

Personal prepaid electricity (LUKU) consumption tracker for households in Dar es Salaam, Tanzania. Single-user, no auth. User logs meter readings, token purchases, and power outages; app shows consumption trends, cost tracking, depletion predictions, purchase planning, anomaly detection, and outage impact. Deployed on Vercel + Turso (free tier).

## Commands

- `npm run dev` — start dev server (turbopack)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — run ESLint (flat config, ESLint 9)
- `npm test` — run ledger unit tests (`node --test`, no framework, no deps)
- `npm run inspect` — print the live ledger segment by segment (the "show your working" tool)
- `npm run archive` — dump every table to `backups/<timestamp>/` as CSV + JSON
- `npm run reset -- --yes` — archive, then clear readings/purchases/outages for a new house
- First-time DB setup: hit `GET /api/setup` after configuring `.env.local`

## Tech Stack

- **Next.js 16.2.1** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/postcss` (CSS-based config in `app/globals.css`, no `tailwind.config` file)
- **Turso (libSQL)** for persistence — `@libsql/client` (lazy-initialized via Proxy in `lib/db.ts`)
- **Recharts** for analytics charts
- **ESLint 9** flat config with `eslint-config-next`
- Path alias: `@/*` maps to project root

## Architecture

- `app/` — App Router. Pages (dashboard, history, analytics, plan, settings, log/purchase), layouts, and API route handlers
- `app/api/` — REST API routes (all export `dynamic = "force-dynamic"`):
  - `readings/` + `[id]/` — CRUD for meter readings
  - `purchases/` + `[id]/` — CRUD for token purchases
  - `outages/` + `[id]/` — CRUD for power outages (TANESCO cuts)
  - `stats/` — All computed stats, derived from `lib/ledger.ts` in one pass
  - `insight/` — Claude-backed analysis (GET reads cache, POST regenerates)
  - `changes/` — Weekly anomaly detection (>=20% deviation)
  - `summary/` — AI clipboard text generator (sw/en)
  - `settings/` — Key-value settings
  - `export/` — CSV download
  - `setup/` — One-time DB table creation
- `lib/` — Core utilities:
  - `ledger.ts` — **The spine.** Merges readings + purchases + outages into one
    chronological list of `Segment`s, so consumption is correct across a top-up.
    FIFO unit accounting gives each purchase a real lifetime and infers when it
    ran out. Also holds the detections (missing purchase, suspected outage,
    logging gap) and the mistype guard's expected-reading band. Deliberately has
    **no imports** so `node --test` can type-strip it directly.
    Any new consumption question belongs here, not in a page.
  - `db.ts` — Turso client singleton (lazy init to avoid build-time errors). Use `db` import for queries, `initDb()` for table creation. The Proxy requires `.bind(getDb())` for methods due to libSQL private fields.
  - `i18n.ts` — Flat `{ key: { sw, en } }` translation map, `tr()` helper with variable interpolation
  - `utils.ts` — Consumption calc, burn rate (with outage adjustment), predictions, weekly change detection, Swahili time-of-day periods. All date helpers use `Africa/Dar_es_Salaam` timezone. Includes `isoToDatetimeLocal()`, `datetimeLocalToISO()`, `getTimePeriod()`, and `calcOutageDurationDays()`.
- `components/` — Shared UI:
  - `Detections.tsx` — One-tap questions raised by the ledger, dismissals in localStorage
  - `AiInsight.tsx` — Claude analysis card (Analytics page), inert without an API key
  - `VendorRates.tsx` — TZS per unit by vendor, names the cheapest channel
  - `Providers.tsx` — React Context for theme, language, PWA install prompt state, and data cache (stats, readings, purchases, changes, outages)
  - `OutageTracker.tsx` — Live power outage tracking widget (two-state: report outage / end outage)
  - `Nav.tsx` — Bottom tab navigation
  - `StatCard.tsx` — Responsive stat display card
  - `QuickLog.tsx` — Meter reading quick-entry form
  - `TimePicker.tsx` — Preset time chips (30m/1h/2h/etc.) + custom datetime fallback
  - `InstallBanner.tsx` — PWA install prompt banner (dismissible, persists to localStorage)
  - `ConsumptionChart.tsx` — Recharts bar/area chart with theme-aware colors
  - `ConfirmModal.tsx`, `Nudge.tsx` — UI primitives
- `public/` — Static assets, PWA manifest (`manifest.json`), service worker (`sw.js`), icons

## Database Schema (Turso/SQLite)

Four tables, created by `initDb()` in `lib/db.ts`:
- **readings** — `id` INTEGER PK, `reading` REAL, `note` TEXT, `created_at` TEXT (ISO 8601)
- **purchases** — `id` INTEGER PK, `units` REAL, `amount_tzs` REAL, `note` TEXT, `vendor` TEXT, `created_at` TEXT
- **outages** — `id` INTEGER PK, `start_at` TEXT (ISO 8601), `end_at` TEXT (nullable — NULL = ongoing), `note` TEXT, `created_at` TEXT
- **settings** — `key` TEXT PK, `value` TEXT (key-value store for currency, meter_no, etc.)

## Key Domain Logic

- LUKU meters display **remaining units** (counts DOWN). Consumption for a pair of
  readings is `previous + unitsPurchasedBetween - current`, never `previous - current`.
  Anything that drops the purchase term under-reports every period containing a top-up.
  Use `buildSegments()`; do not hand-roll this in a page.
- Purchase lifetimes are **FIFO**: units already on the meter burn before newly bought
  ones. A purchase made while units remain is `started: false` and has no lifetime yet.
  This is why "days since purchase" is the wrong number to show.
- Depletion times are interpolated on the cumulative-consumption curve, so they carry
  `exhaustedEstimated` and a bracketing window. Show the uncertainty, do not hide it.
- Burn rate is per **active day** (outage hours removed) and ignores segments longer
  than 14 days, since a bridge across a logging break is not a daily rate.
- Detections are **questions, never assertions**: a meter that barely moved looks
  identical whether the power was cut or nobody was home.
- All timestamps in EAT (Africa/Dar_es_Salaam, UTC+3), stored as ISO 8601 TEXT in SQLite.
- Burn rate needs 3+ readings over 3+ days before showing predictions. Outage hours are subtracted from elapsed time for accuracy.
- Swahili time-of-day periods: Alfajiri (04-05), Asubuhi (06-11), Mchana (12-15), Jioni (16-18), Usiku (19-03). Shown as badges on readings/purchases and as analytics breakdown.
- Change detection needs 5+ weeks of data before flagging anomalies (>=20% deviation from 4-week rolling baseline).
- Purchase duration tracking: each purchase shows how long it lasted (days until next purchase) or "Day X so far" for the current purchase. Dashboard shows last purchase with estimated total days.
- Generator users: LUKU meter doesn't count generator power, so units last longer during outages. System accounts for this correctly via outage tracking.
- All insights derived from user data only, never assume appliances or lifestyle.
- POST/PUT API routes accept optional `created_at` for backdating entries. Defaults to `new Date().toISOString()`.

## Pages

- **Dashboard** (`/`) — Today's usage, 7-day avg, last purchase (with duration), outage count, burn rate prediction, quick log, outage tracker
- **History** (`/history`) — Three tabs: Readings, Purchases (with "lasted X days"), Outages. Full CRUD with inline edit. Time period badges on each entry.
- **Analytics** (`/analytics`) — Historical analysis: daily/weekly/monthly charts, time-of-day breakdown (Today/All Time toggle), cost summary, month comparison, change detection, outage stats, AI summary export
- **Plan** (`/plan`) — Future-focused: daily usage rate with trend, depletion prediction with calendar date, purchase calculator (budget-to-days or days-to-cost), contextual tips (logging advice, generator awareness)
- **Settings** (`/settings`) — Meter number, language, theme, export, install app, daily reminder

## i18n Style

- All user-facing strings in `lib/i18n.ts` with `{ sw, en }` pairs
- Use commas instead of em dashes in sentences
- Variable interpolation: `{varName}` syntax in `tr()` helper

## Design

- Mobile-first, PWA installable (manifest.json + sw.js for app shell caching)
- Dark mode default, light mode toggle (stored in localStorage as `luku-theme`)
- English default language, Swahili toggle (stored in localStorage as `luku-lang`)
- TANESCO blue (#003399) accent, green for positive trends, red/orange for high consumption
- Theme and language managed via React Context in `components/Providers.tsx`
- Bottom tab navigation (Dashboard, History, Analytics, Plan/Mipango, Settings)
- Impeccable design plugin is available — **always ask user before running any Impeccable command**

## PWA & Notifications

- Install prompt shared via `useInstall()` context (banner + settings page)
- Install state persisted in `localStorage("luku-installed")` and `localStorage("luku-install-dismissed")`
- Manifest icons must have **separate** `"purpose": "any"` and `"purpose": "maskable"` entries (not combined)
- Daily reminder notifications scheduled via service worker `postMessage` (`SCHEDULE_REMINDER` / `CANCEL_REMINDER`)
- Reminder settings stored in `localStorage("luku-reminder")` as JSON `{ enabled, time, title, body }`
- Active outage state persisted in `localStorage("luku-outage-active")` as JSON `{ id, start_at }`
- SW re-receives schedule on every app load (handles SW restarts)

## Tailwind CSS v4 Dark Mode

Class-based dark mode requires this line in `app/globals.css`:
```css
@custom-variant dark (&:where(.dark, .dark *));
```
Without it, `dark:` variants use `prefers-color-scheme` media query instead of the `.dark` class. After changing this, **clear `.next/` cache and restart dev server** — Turbopack caches CSS aggressively.

## Environment Variables

Required in `.env.local` (not committed):
- `TURSO_DATABASE_URL` — Turso database URL
- `TURSO_AUTH_TOKEN` — Turso auth token

Optional:
- `ANTHROPIC_API_KEY` — enables `/api/insight`. Without it the AI analysis card
  says so and nothing else changes. Model is `claude-opus-5`; results are cached
  in `settings.insight_cache` and only regenerate when the data fingerprint
  changes, so page loads cost nothing.

## Migrations

SQLite has no `ADD COLUMN IF NOT EXISTS`, so `migrate()` in `lib/db.ts` holds a list
of columns added after first release and swallows duplicate-column errors. Add new
columns there and hit `GET /api/setup` to apply them to a deployed database.

## Critical: Next.js 16 Breaking Changes

**Always read the relevant guide in `node_modules/next/dist/docs/` before writing new Next.js patterns.** Key paths:
- App Router guides: `node_modules/next/dist/docs/01-app/`
- API reference: `node_modules/next/dist/docs/01-app/03-api-reference/`

Key differences already handled in this codebase:
- Route handler params are `Promise<{ id: string }>` (must be awaited)
- `useRef` requires an initial value in React 19
- `viewport` and `metadata` are separate exports in layout.tsx
- All API routes export `dynamic = "force-dynamic"` for Turso compatibility
