# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project: Luku Yangu

Personal prepaid electricity (LUKU) consumption tracker for a household in Dar es Salaam, Tanzania. Single-user, no auth. User logs meter readings and token purchases; app shows consumption trends, cost tracking, depletion predictions, and anomaly detection. Deployed on Vercel + Turso (free tier).

## Commands

- `npm run dev` — start dev server (turbopack)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — run ESLint (flat config, ESLint 9)
- First-time DB setup: hit `GET /api/setup` after configuring `.env.local`

## Tech Stack

- **Next.js 16.2.1** (App Router), **React 19**, **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/postcss` (CSS-based config in `app/globals.css`, no `tailwind.config` file)
- **Turso (libSQL)** for persistence — `@libsql/client` (lazy-initialized via Proxy in `lib/db.ts`)
- **Recharts** for analytics charts
- **ESLint 9** flat config with `eslint-config-next`
- Path alias: `@/*` maps to project root

## Architecture

- `app/` — App Router. Pages, layouts, and API route handlers
- `app/api/` — REST API routes (all export `dynamic = "force-dynamic"`):
  - `readings/` + `[id]/` — CRUD for meter readings
  - `purchases/` + `[id]/` — CRUD for token purchases
  - `stats/` — Dashboard computed stats (burn rate, predictions)
  - `changes/` — Weekly anomaly detection (>=20% deviation)
  - `summary/` — AI clipboard text generator (sw/en)
  - `settings/` — Key-value settings
  - `export/` — CSV download
  - `setup/` — One-time DB table creation
- `lib/` — Core utilities:
  - `db.ts` — Turso client singleton (lazy init to avoid build-time errors). Use `db` import for queries, `initDb()` for table creation. The Proxy requires `.bind(getDb())` for methods due to libSQL private fields.
  - `i18n.ts` — Flat `{ key: { sw, en } }` translation map, `tr()` helper with variable interpolation
  - `utils.ts` — Consumption calc, burn rate, predictions, weekly change detection. All date helpers use `Africa/Dar_es_Salaam` timezone. Includes `isoToDatetimeLocal()` and `datetimeLocalToISO()` for EAT conversion.
- `components/` — Shared UI:
  - `Providers.tsx` — React Context for theme, language, and PWA install prompt state
  - `Nav.tsx` — Bottom tab navigation
  - `StatCard.tsx` — Responsive stat display card
  - `QuickLog.tsx` — Meter reading quick-entry form
  - `TimePicker.tsx` — Preset time chips (30m/1h/2h/etc.) + custom datetime fallback
  - `InstallBanner.tsx` — PWA install prompt banner (dismissible, persists to localStorage)
  - `ConsumptionChart.tsx` — Recharts bar/area chart with theme-aware colors
  - `ConfirmModal.tsx`, `Nudge.tsx` — UI primitives
- `public/` — Static assets, PWA manifest (`manifest.json`), service worker (`sw.js`), icons

## Database Schema (Turso/SQLite)

Three tables, created by `initDb()` in `lib/db.ts`:
- **readings** — `id` INTEGER PK, `reading` REAL, `note` TEXT, `created_at` TEXT (ISO 8601)
- **purchases** — `id` INTEGER PK, `units` REAL, `amount_tzs` REAL, `note` TEXT, `created_at` TEXT
- **settings** — `key` TEXT PK, `value` TEXT (key-value store for currency, meter_no, etc.)

## Key Domain Logic

- LUKU meters display **remaining units** (counts DOWN). Consumption = previous - current reading.
- If current > previous, a top-up occurred — match against purchases table.
- All timestamps in EAT (Africa/Dar_es_Salaam, UTC+3), stored as ISO 8601 TEXT in SQLite.
- Burn rate needs 3+ readings over 3+ days before showing predictions.
- Change detection needs 5+ weeks of data before flagging anomalies (>=20% deviation from 4-week rolling baseline).
- All insights derived from user data only — never assume appliances or lifestyle.
- POST/PUT API routes accept optional `created_at` for backdating entries. Defaults to `new Date().toISOString()`.

## Design

- Mobile-first, PWA installable (manifest.json + sw.js for app shell caching)
- Dark mode default, light mode toggle (stored in localStorage as `luku-theme`)
- English default language, Swahili toggle (stored in localStorage as `luku-lang`)
- TANESCO blue (#003399) accent, green for positive trends, red/orange for high consumption
- Theme and language managed via React Context in `components/Providers.tsx`
- Bottom tab navigation (Dashboard, History, Analytics, Settings)
- Impeccable design plugin is available — **always ask user before running any Impeccable command**

## PWA & Notifications

- Install prompt shared via `useInstall()` context (banner + settings page)
- Install state persisted in `localStorage("luku-installed")` and `localStorage("luku-install-dismissed")`
- Manifest icons must have **separate** `"purpose": "any"` and `"purpose": "maskable"` entries (not combined)
- Daily reminder notifications scheduled via service worker `postMessage` (`SCHEDULE_REMINDER` / `CANCEL_REMINDER`)
- Reminder settings stored in `localStorage("luku-reminder")` as JSON `{ enabled, time, title, body }`
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

## Critical: Next.js 16 Breaking Changes

**Always read the relevant guide in `node_modules/next/dist/docs/` before writing new Next.js patterns.** Key paths:
- App Router guides: `node_modules/next/dist/docs/01-app/`
- API reference: `node_modules/next/dist/docs/01-app/03-api-reference/`

Key differences already handled in this codebase:
- Route handler params are `Promise<{ id: string }>` (must be awaited)
- `useRef` requires an initial value in React 19
- `viewport` and `metadata` are separate exports in layout.tsx
- All API routes export `dynamic = "force-dynamic"` for Turso compatibility
