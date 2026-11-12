# Caprese

Personal weekly planning — calendar, tasks, thoughts, journal. Dark, quiet, one tomato-red accent.

## Features

- **One "New" dialog, four kinds** — Task, Event, To do and Goal share a single dialog built for one-handed entry: type the title, tap a day in the two-week strip (or open the full month in place), set *Starts* / *Ends* on the 24-hour clock or tap a duration chip, pick the project from chips (the chosen one wears its colour), and add notes if needed (bold, italic, strikethrough, bullet & numbered lists). An **All day** toggle turns any dated task/event into a date-only entry (no time); goals default to all-day. A **To do** is a short reminder — just a title, a project and notes; no date, never placed on the calendar. Under the hood they are one `entries` table with a `type` discriminator plus an `all_day` flag.
- **Calendar** — Day / Workweek / Week / Month views on desktop; phones get a compact Day / 3 days / Month set (Day by default) where a horizontal swipe pages the grid endlessly (one day at a time, or three in the 3-day view). Monday start, 24h times, "KW" week numbers, dashed 30-minute lines. Hover a 30-minute slot to add (tap it on a phone); drag blocks to move them in 30-minute steps across days. Events and scheduled tasks/goals appear as blocks (a check circle for tasks, a target for goals; goals also get a colored frame). A collapsible right sidebar lists unscheduled tasks; drag one onto the grid to schedule it.
- **Planner** — entries grouped by what they need from you: **To review** (time has passed — tick it off, plan it again, or cancel it; done pays pantry picks and archives), **Upcoming** (same decisions available early), **To plan** (no date yet — plan via a quick dialog or drag onto the calendar from its sidebar), **To do** (short reminders; finishing 3 pays a pick, with an inline quick-add), and a collapsible **Archive**. Every row leads with its check — round for a task, square for a to-do, a trophy for a goal — so resolving takes one tap; *Plan* and *Cancel* sit beside it as icons. Because one tap is enough, every resolution and every delete comes with an **Undo**. On wide screens it lays out as a two-column board (time-driven on the left, backlog on the right). Every section collapses. The *Plan* dialog offers Today / Tomorrow / Next week, sets date, time and duration — or whole days for an all-day entry — or clears the date, parking the item under To plan. Filters (type incl. To do, project), an events toggle for Upcoming, and title search keep it tidy. Full category management (create, rename, recolor, delete) with a muted color palette.
- **Thoughts** — a capture inbox. Thoughts are added on this tab: **New** opens a text field, the microphone records a voice note that is transcribed and shown for a quick review before saving (either way you can switch). A thought lives in exactly one place: the **Inbox** until it is sorted, **Sorted** once it belongs to a project (optionally right at capture), the **Archive** once completed — where it can be restored or deleted.
- **Journal** — one sentence per day, assigned to one of three pillars: Freedom, Health, Relationship. Streak + per-pillar stats, history grouped by calendar week.
- **Partner (archived)** — the "find a life partner" track of weekly goals and debriefs is archived: it is off the navigation, its goals and notes stay in the database and are shown read-only at `/partner` (linked from the Planner's archive), and its server actions refuse changes. Nothing was deleted — set `PARTNER_ARCHIVED` to `false` in [`src/lib/features.ts`](src/lib/features.ts) and the tab is back exactly as it was (weekly goals closed with an outcome, a difficulty rating and a note; stats, streak and picks by outcome).
- **Pantry (gamification)** — doing things earns *picks*: journal entry +1, completed task +2, achieved goal +3, +1 for every 3 completed to-dos, and +2 for every 10 consecutive journal days. Each pick draws one card (flip it to reveal): tomato 50 %, basil 20 %, olive oil 20 %, mozzarella 10 % — rolled per card, server-side. Collect 5 tomatoes + 2 basil + 2 olive oil + 1 mozzarella to craft a caprese salad, then redeem a salad for a private treat (with a note of what it was). Awards are idempotent (a ledger with unique source keys), drawing and crafting run atomically in Postgres functions.
- **Keyboard shortcuts** — app-style single keys (never while typing, never in dialogs): `1–5` switch pages in tab order (Calendar, Planner, Thoughts, Journal, Pantry), `?` shows the full overview (also behind the keyboard button in the top bar), `Esc` closes dialogs. Calendar mirrors Google Calendar: `N` new, `T` today, `D`/`W`/`M` views, `←`/`→` navigate, `S` sidebar. Planner: `N` new, `Q` quick add, `/` search. Thoughts: `N` new, `V` voice note. Journal: `N` write. Pantry: `D` draw a card.
- **Phone layout** — full-screen: no top bar, the page runs from the status bar to the bottom edge and the tab bar floats over it as a glass pill (Calendar, Planner, Thoughts, Journal and Pantry, which carries the salad tracker and the picks badge). Content scrolls behind the bar; every scroller keeps `--tabbar-space` free at its end so the last row clears it. Tapping the open tab scrolls back to the top (the calendar jumps to today), and Planner and Thoughts fold their title into a compact bar with *New* once it has scrolled away. Dialogs are bottom sheets that can be flicked away and that follow the on-screen keyboard (via the visual viewport), so nothing ends up underneath it; the entry dialog keeps *Cancel* and *Save* in its title row and opens whole — the keyboard comes with a tap on the title, not on its own. On desktop the same dialogs are centred cards and the tabs live in the top bar.
- **Installable (PWA)** — a web manifest, maskable icons and an Apple touch icon make it installable on the home screen. On iOS it runs standalone (no browser chrome) with a translucent dark status bar and `env(safe-area-inset-*)` padding so nothing hides under the notch or home indicator. A deliberately minimal service worker ([`public/sw.js`](public/sw.js)) caches nothing but the icons and an `/offline` fallback page — pages come from live, gated data and are never cached.
- **Gate** — no accounts. A single PIN (env var) unlocks the app; a hashed cookie keeps you signed in for 30 days. PWA assets (manifest, icons, service worker, offline page) stay public so the phone can fetch them outside a session.

### Pantry artwork

The pantry ships with built-in SVG illustrations. To use the nicer hand-made PNG set instead, drop the files into `public/pantry/` as `tomato.png`, `basil.png`, `oil.png`, `mozzarella.png` and `salad.png` — they are picked up automatically (no rebuild needed).

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Database** — the schema (`categories`, `entries`, `journal_entries`, `partner_goals`, `thoughts`, pantry tables) is already provisioned in the Supabase project "Caprese App". To recreate it elsewhere, run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.

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
- Dragging tasks from the sidebar uses HTML5 drag & drop, which doesn't work on touch screens; on mobile, plan them from the Planner instead. Moving and resizing calendar blocks by drag is a mouse affordance too — on a phone a touch on the grid scrolls and pages it, and a tap opens the entry.
- Pages are drawn in the browser, not on the server: the layout depends on the viewer's time zone (where 09:00 sits, what counts as today) and device, and the server runs in UTC. The server sends the data and a skeleton (`ClientOnly`).
