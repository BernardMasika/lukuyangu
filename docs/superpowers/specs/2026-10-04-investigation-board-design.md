# Investigation board: design

Date: 2026-10-04
Status: approved in conversation (sections 1-3), awaiting written-spec review

## Purpose

When usage jumps abruptly, the app pins that stretch on an investigation board.
Bernard works through the pins to figure out what caused each one and why: he
writes notes and suspects, then closes the pin with one or more causes. Over time
the board becomes a record of what drives his consumption.

The app supplies evidence only. It never guesses an appliance or a cause
(CLAUDE.md: "all insights derived from user data only, never assume appliances or
lifestyle"). Detections stay questions, not assertions.

## Success criteria

- A stretch that runs well above normal appears as a numbered pin without any
  action from the user.
- Each pin shows enough evidence to start investigating: when, how far above
  normal, extra kWh and TZS, and context (outage, purchase, overnight).
- Notes, causes and solved status persist in Turso and survive reloads,
  devices and baseline shifts.
- A pin the user has written on never silently disappears.

## 1. What counts as a spike

- **Unit:** a ledger `Segment` (reading to reading), so a top-up inside the
  stretch is already accounted for.
- **Normal (baseline):** `currentBurnRate()`, the same rate the Plan page shows.
  It is per active day (outage hours removed) and excludes unlogged stretches
  over 2 days (time away). The live value on 2026-10-04 is 3.07 kWh/day.
- **Rule:** a segment is a spike when **all** of these hold:
  1. `rate >= minRatio × baseline` (default `minRatio = 2`).
  2. `extraKwh = consumption − baseline × activeHours / 24 >= minExtraKwh`
     (default `0.5`). This stops a 20-minute blip from pinning.
  3. `activeHours >= minActiveHours` (default `1`).
  4. `hours / 24 <= 2`: a bridge across a logging break is not a rate.
- **Live check (2026-10-04, baseline 3.07):** exactly one pin, 04 Oct 00:39 →
  10:25 at 7.0 kWh/day (2.3×, +1.55 kWh). The 1 Oct afternoon stretch (4.7,
  1.5×) does not pin; the user accepted this.
- The thresholds are named defaults in an options argument, the single place to
  tune them.

### Evidence per spike (computed, no guesses)

- `from`, `to`, plus the Swahili periods of each end.
- `rate`, `baseline`, `ratio`.
- `extraKwh`, and `extraTzs = extraKwh × average TZS/kWh across all purchases`.
- Context flags:
  - `outageOverlap` (a logged outage overlaps the window).
  - `purchaseInside` (`segment.purchaseIds.length > 0`).
  - `overnight`: the window includes any hour in 00:00-04:00 EAT.

## 2. Storage and API

### Table `investigations` (created in `initDb()`, applied by `GET /api/setup`)

```sql
CREATE TABLE IF NOT EXISTS investigations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seg_from TEXT NOT NULL,          -- ISO timestamp of the opening reading
  seg_to TEXT NOT NULL,            -- ISO timestamp of the closing reading
  status TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'solved'
  causes TEXT NOT NULL DEFAULT '[]',     -- JSON array of tag strings
  notes TEXT NOT NULL DEFAULT '',
  snapshot TEXT NOT NULL DEFAULT '{}',   -- JSON evidence at first save
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (seg_from, seg_to)
);
```

- **Lazy rows:** a detected spike nobody has touched has no row. The first save
  (a note, a cause or a status change) creates the row by upsert on
  `(seg_from, seg_to)` and stores the current evidence as `snapshot`.
- **Pin states on the board:**
  - `new`: detected, no row.
  - `open` / `solved`: has a row and is still detected.
  - `belowThreshold`: has a row, but the segment exists and no longer passes
    the rule. Shown with its live numbers and a label.
  - `readingsChanged`: has a row, but no segment matches `(seg_from, seg_to)`
    any more because a bounding reading was edited or deleted. Shown with the
    `snapshot` numbers and a label. The notes are never lost.

### Ledger (`lib/ledger.ts`, no imports, unit tested)

- `detectSpikes(segments, baseline, opts?) → Spike[]` implements rule 1.
  Context flags that need outages take the outage list as a parameter.

### API

- `GET /api/investigations` returns:
  - `pins`: detected spikes merged with rows, each carrying its state, and
    numbered 1..n by `from` (oldest = 1), so numbers are stable as new pins
    arrive.
  - `strip`: segments from the last 30 days as `{from, to, hours, rate}`, for
    the timeline.
  - `baseline`.
  - `customTags`: distinct causes used in rows that are not starter tags.
- `PUT /api/investigations` takes body
  `{seg_from, seg_to, notes?, status?, causes?, snapshot?}` and upserts. It
  validates `status ∈ {open, solved}` and `causes` as an array of non-empty
  strings of at most 40 chars.
  - **Solved needs a cause:** `status = solved` with empty `causes` returns
    400.
- `DELETE /api/investigations/[id]` removes the row. If the segment is still a
  spike it reappears as `new`.
- `/api/stats` gains `newSpikes`: detected spikes with no row (one extra
  `SELECT seg_from, seg_to FROM investigations`).
- All routes export `dynamic = "force-dynamic"`. Route params are a
  `Promise<{ id: string }>` (Next 16).

## 3. UI

### `/investigate` page

- Not a nav tab. It is reached from:
  - A Dashboard "Worth a look" card, *New usage spike pinned → Open board*,
    shown when `stats.newSpikes.length > 0`.
  - An "Investigation board →" link on the Analytics page.
- It opens with a title and a one-line page description, like the other pages.
- It fetches `/api/investigations` itself, outside the Providers cache.

**Timeline strip (last 30 days)**

- One bar per segment: width proportional to duration, height proportional to
  rate.
- A dashed baseline line.
- Segments longer than 24 hours render as a fixed-width hatched block labelled
  "not logged".
- Numbered pin markers sit above spike bars. Tapping a marker scrolls to its
  card.
- Plain flex divs, no chart library.

**Pin cards**

- Open pins (`new`, `open`, `belowThreshold`, `readingsChanged` when unsolved)
  come newest first. Solved pins sit in a collapsed section below.
- Each card shows:
  - The number, the window with its periods, rate, × normal, +extra kWh and
    ≈ TZS.
  - Context chips.
  - State badges: New, Below threshold now, Readings changed.
- **Notes:** a textarea with a Save button.
- **Causes:** multi-select chips.
  - Starter tags: `fridge`, `multicooker`, `pc`, `guests`, `unknown`,
    `falseAlarm`. These come from the user's own appliance list plus generic
    outcomes, never assumed appliances.
  - **+ own tag** adds free text, and `customTags` show up as chips on every
    pin.
- **Mark solved** is disabled until a cause is selected. Solved cards show a
  **Reopen** button.

**Empty state:** "No spikes. Normal is {baseline} kWh/day; a pin appears when a
stretch runs 2× that for an hour or more."

**Style:** the existing card styling, TANESCO blue `#003399` and dark mode
default. All strings are in `lib/i18n.ts` (sw/en), commas not em dashes.
Mobile-first, no horizontal scroll at phone width.

## Testing

- **Ledger unit tests** (`lib/ledger.test.mts`) for `detectSpikes`:
  - Passes at 2× / +0.5 kWh / 1 h.
  - Fails at 1.99×, at +0.49 kWh and at 59 minutes.
  - Excludes a segment over 2 days.
  - An outage-heavy segment (most hours removed) uses active hours.
  - Context flags are set correctly.
- **API**, run on dev against Turso:
  - Upsert creates the row, a second PUT updates it, and a reload keeps the
    notes.
  - Solved without a cause returns 400.
  - DELETE turns a pin back into `new`.
  - A row whose segment no longer exists returns `readingsChanged` with its
    snapshot.
- **Page:** driven in Chrome at phone width: add a note, tag a cause, mark
  solved, reopen.
- **Ship gate:** `impeccable:audit` on `/investigate`, already approved by the
  user on 2026-10-04.

## Out of scope

- Experiments or "test it" tasks checked against later readings. The user chose
  the notes-and-verdict scope.
- Learning causes automatically, or suggesting causes.
- Pinning on weekly or monthly aggregates; Analytics change detection already
  covers those.
- Push notifications for new spikes.
