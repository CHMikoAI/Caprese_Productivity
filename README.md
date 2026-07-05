# Caprese

Personal weekly planning — calendar, tasks, journal. Dark, quiet, one tomato-red accent.

## Features

- **Calendar** — Outlook-style week view (Monday start, 24h times, "KW" week numbers). Click an empty slot to create an event, drag events to move them in 30-minute steps (also across days). A collapsible right sidebar lists open tasks; drag one onto the grid to schedule it.
- **Tasks** — add tasks, assign categories, mark done. Full category management (create, rename, recolor, delete) with a muted color palette.
- **Journal** — one sentence per day, assigned to one of three pillars: Freedom, Health, Relationship. Streak + per-pillar stats, history grouped by calendar week.
- **Gate** — no accounts. A single password (env var) unlocks the app; a hashed cookie keeps you signed in for 30 days.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the Supabase schema**

   In your Supabase project, open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
   RLS stays enabled with no policies — the app only talks to the database from the server using the service-role key, so the anon key can't touch your data.

3. **Configure `.env.local`**

   ```bash
   APP_PASSWORD=your-password
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

   URL and key are under **Project Settings → API** in Supabase. Without them the UI still runs, but nothing is saved (a banner reminds you).

4. **Run**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, enter the password, plan your week.

## Stack

- Next.js 16 (App Router, Server Actions), TypeScript, Tailwind CSS 4
- Supabase (Postgres) via `@supabase/supabase-js`, server-side only
- lucide-react icons

## Notes

- The password gate is convenience, not security — fine for uncritical personal planning data.
- Dragging tasks from the sidebar uses HTML5 drag & drop, which doesn't work on touch screens; on mobile, create events via tap instead. Moving events by drag works with touch.
