# Luku Yangu

Personal prepaid electricity (LUKU) consumption tracker for households in Tanzania. Track meter readings, token purchases, power outages, consumption trends, and plan your electricity budget, all from your phone.

## Features

- **Dashboard** — today's usage, 7-day average, last purchase with duration tracking, outage count, burn rate predictions
- **Quick Log** — log meter readings with optional backdated timestamps via preset chips (30min ago, 1h ago, etc.)
- **Purchase Tracking** — log every LUKU token purchase, see how long each purchase lasts, cost per kWh
- **Power Outage Tracking** — log TANESCO power cuts (live or retroactive), automatically adjusts consumption calculations for accuracy
- **Analytics** — daily/weekly/monthly consumption charts, time-of-day breakdown (Today/All Time toggle), cost summary, month-over-month comparison, anomaly detection (flags weeks with >=20% deviation), outage stats
- **Plan (Mipango)** — your daily usage rate with trend direction, depletion prediction with calendar date, purchase calculator ("I have TZS X" or "I need X days"), smart contextual tips
- **History** — view, edit, and delete all readings, purchases (with "lasted X days"), and outages with inline editing
- **Time-of-Day Labels** — Swahili time periods (Alfajiri, Asubuhi, Mchana, Jioni, Usiku) shown on every entry
- **Daily Reminders** — push notification reminders to log your meter reading (configurable time)
- **PWA Installable** — install on your phone for quick access, works offline for cached pages
- **Bilingual** — English (default) and Swahili (Kiswahili), switchable in settings
- **Dark/Light Theme** — dark mode default, toggle in settings
- **CSV Export** — download all data as CSV from settings
- **AI Summary** — copy a text summary of your data for pasting into Claude, ChatGPT, etc.

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Today's usage, last purchase duration, quick log, outage tracker |
| History | `/history` | Readings, purchases (with duration), outages — full CRUD |
| Analytics | `/analytics` | Charts, time-of-day breakdown, cost summary, change detection |
| Plan | `/plan` | Predictions, purchase calculator, depletion date, tips |
| Settings | `/settings` | Language, theme, meter number, export, install, reminders |

## Tech Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** (CSS-based config, class-based dark mode via `@custom-variant`)
- **Turso (libSQL)** for persistence (free tier)
- **Recharts** for analytics charts
- **Vercel** for deployment

## Getting Started

### Prerequisites

- Node.js 20+
- A [Turso](https://turso.tech) database

### Setup

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Create `.env.local` with your Turso credentials:
   ```
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your-token
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Initialize the database by visiting:
   ```
   http://localhost:3000/api/setup
   ```

5. Open [http://localhost:3000](http://localhost:3000) and start logging.

## Domain Context

LUKU is Tanzania's prepaid electricity system. Meters display **remaining units** that count down as you consume. Users buy tokens (units) via mobile money or vendors and load them onto the meter. Power outages from TANESCO (the utility company) are common and unpredictable, the app tracks these to keep consumption predictions accurate. Generator power bypasses the LUKU meter entirely, so outages should be logged regardless.

## Deployment

Deploy to Vercel and set the two environment variables (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) in project settings. The database tables only need to be created once via `/api/setup`.

## Author

Made with love by [Bernard Masika](https://www.bernardmasika.com)
