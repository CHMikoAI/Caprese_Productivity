# Caprese

Personal weekly planning — calendar, tasks, journal. Dark, quiet, one tomato-red accent.

## Features

- **One "New" dialog, three kinds** — Task, Event and Goal share a single Outlook-style dialog: title, category, start date + time (shown as `DD.MM.YYYY`), duration *or* explicit end date + time, and a simple rich-text notes field (bold, italic, strikethrough, bullet & numbered lists). Under the hood they are one `entries` table with a `type` discriminator.
- **Calendar** — Day / Workweek / Week / Month views on desktop; phones get a compact Day / 3 days / Month set (Day by default) where a horizontal swipe pages the grid endlessly (one day at a time, or three in the 3-day view). Monday start, 24h times, "KW" week numbers, dashed 30-minute lines. Hover a 30-minute slot to add; drag blocks to move them in 30-minute steps across days. Events and scheduled tasks/goals appear as blocks (a check circle for tasks, a target for goals; goals also get a colored frame). A collapsible right sidebar lists unscheduled tasks; drag one onto the grid to schedule it.
- **Planner** — tasks and goals grouped by what they need from you: **To review** (time has passed — decide *Done / Plan / Cancel*; Done pays pantry picks and archives), **Upcoming** (same decisions available early), **To plan** (no date yet — plan via a quick dialog or drag onto the calendar from its sidebar), and a collapsible **Archive**. The *Plan* dialog sets date, time and duration — or clears the date, parking the item under To plan. Filters (type, project), an events toggle for Upcoming, quick-add and title search keep it tidy. Full category management (create, rename, recolor, delete) with a muted color palette.
- **Journal** — one sentence per day, assigned to one of three pillars: Freedom, Health, Relationship. Streak + per-pillar stats, history grouped by calendar week.
- **Pantry (gamification)** — doing things earns *picks*: journal entry +1, completed task +2, achieved goal +3, and +2 for every 10 consecutive journal days. Each pick draws one card (flip it to reveal): tomato 50 %, basil 20 %, olive oil 20 %, mozzarella 10 % — rolled per card, server-side. Collect 5 tomatoes + 2 basil + 2 olive oil + 1 mozzarella to craft a caprese salad, then redeem a salad for a private treat (with a note of what it was). Awards are idempotent (a ledger with unique source keys), drawing and crafting run atomically in Postgres functions.
- **Keyboard shortcuts** — app-style single keys (never while typing, never in dialogs): `1–4` switch pages, `?` shows the full overview, `Esc` closes dialogs. Calendar mirrors Google Calendar: `N` new, `T` today, `D`/`W`/`M` views, `←`/`→` navigate, `S` sidebar. Planner: `N` new, `Q` quick add, `/` search. Journal: `N` write. Pantry: `D` draw a card.
- **Gate** — no accounts. A single PIN (env var) unlocks the app; a hashed cookie keeps you signed in for 30 days.

### Pantry artwork

The pantry ships with built-in SVG illustrations. To use the nicer hand-made PNG set instead, drop the files into `public/pantry/` as `tomato.png`, `basil.png`, `oil.png`, `mozzarella.png` and `salad.png` — they are picked up automatically (no rebuild needed).

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Database** — the schema (`categories`, `tasks`, `events`, `journal_entries`) is already provisioned in the Supabase project "Caprese App". To recreate it elsewhere, run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.

3. **Configure `.env.local`** (copy from [`.env.example`](.env.example))

   ```bash
   APP_PASSWORD=your-pin
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   The service-role key lives under **Project Settings → API Keys → `service_role`**. Without it the UI still runs, but nothing is saved (a banner reminds you).

4. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, enter the PIN, plan your week.

## Security & hosting

Keys are stored so they can't be stolen:

- **Never in the repo.** `.env.local` is git-ignored (only the secret-free [`.env.example`](.env.example) template is committed).
- **Never in the browser.** The service-role key is read only in server code. `src/lib/supabase.ts` starts with `import "server-only"`, so the build fails if it is ever pulled into a Client Component — the key cannot end up in the JS bundle.
- **Database locked down.** Row-level security is enabled on every table with **no policies**, so the public anon/publishable key can read and write nothing. Only the Next.js server, holding the secret key, reaches the data.

**Hosting (Vercel / Netlify / …):** do *not* put keys in the code. Add `APP_PASSWORD`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in the host's **Environment Variables** settings (mark the service-role key as *Sensitive* on Vercel so it is write-only after saving). Redeploy to pick them up.

## Stack

- Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS 4
- Supabase (Postgres) via `@supabase/supabase-js`, server-side only
- lucide-react icons

## Notes

- The password gate is convenience, not security — fine for uncritical personal planning data.
- Dragging tasks from the sidebar uses HTML5 drag & drop, which doesn't work on touch screens; on mobile, create events via tap instead. Moving events by drag works with touch.
