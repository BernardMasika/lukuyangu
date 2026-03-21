# Luku Yangu

Personal prepaid electricity (LUKU) consumption tracker for a household in Dar es Salaam, Tanzania. Track meter readings, token purchases, consumption trends, and get depletion predictions — all from your phone.

## Features

- **Dashboard** — today's usage, 7-day average, monthly spending, and burn rate predictions
- **Quick Log** — log meter readings with optional backdated timestamps via preset chips (30min ago, 1h ago, etc.)
- **Purchase Tracking** — log every LUKU token purchase with units, amount (TZS), and payment method
- **Analytics** — daily/weekly/monthly consumption charts, cost summary, month-over-month comparison, and anomaly detection (flags weeks with >=20% deviation)
- **History** — view, edit, and delete all readings and purchases with inline editing
- **Daily Reminders** — push notification reminders to log your meter reading (configurable time)
- **PWA Installable** — install on your phone for quick access, works offline for cached pages
- **Bilingual** — English (default) and Swahili, switchable in settings
- **Dark/Light Theme** — dark mode default, toggle in settings
- **CSV Export** — download all data as CSV from settings
- **AI Summary** — copy a text summary of your data for pasting into Claude, ChatGPT, etc.

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

## Deployment

Deploy to Vercel and set the two environment variables (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) in project settings. The database tables only need to be created once via `/api/setup`.

## Author

Made with love by [Bernard Masika](https://www.bernardmasika.com)
