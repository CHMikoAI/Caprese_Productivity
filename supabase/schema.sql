-- Caprese schema — run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8E9196',
  created_at timestamptz not null default now()
);

-- One unified table for the four creatable kinds: task, event, goal, todo.
-- They share all fields; `type` is the only discriminator.
--  * event         -> always timed, shown on the calendar; never tracked
--                     (just past or future).
--  * task / goal    -> timed entries show on the calendar; a task with no
--                      start_at is "unscheduled". Their lifecycle is
--                      upcoming (dated, future) -> open (time passed / undated)
--                      -> terminal `status`: done/cancelled (task),
--                      achieved/missed (goal).
--  * todo           -> short reminder, never on the calendar (start_at stays
--                      null); an optional deadline lives in end_at. Resolves
--                      done/cancelled like a task; every 3 done pays 1 pick.
-- all_day marks date-only entries (no time); goals default to it.
create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('task', 'event', 'goal', 'todo')),
  title text not null,
  category_id uuid references categories(id) on delete set null,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  description text,           -- rich text stored as sanitized HTML
  status text not null default 'active'
    check (status in ('active', 'done', 'cancelled', 'achieved', 'missed')),
  created_at timestamptz not null default now(),
  constraint entries_event_timed
    check (type <> 'event' or (start_at is not null and end_at is not null))
);

create index if not exists entries_type_idx on entries (type);
create index if not exists entries_start_at_idx on entries (start_at);
create index if not exists entries_status_idx on entries (status);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null unique,
  pillar text not null check (pillar in ('freedom', 'health', 'relationship')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pantry gamification: picks are earned via journal/tasks/goals, spent on
-- card draws; drawn ingredients are crafted into caprese salads.

create table if not exists salads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz,
  reward_note text
);

-- Ledger of earned picks. unique (source, source_key) makes every award
-- idempotent: re-completing a task or re-saving a journal day never pays twice.
create table if not exists reward_grants (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('journal', 'task', 'goal', 'journal_streak', 'todo_streak')),
  source_key text not null,
  picks int not null check (picks > 0),
  created_at timestamptz not null default now(),
  unique (source, source_key)
);

-- One row per drawn card; salad_id is set when the ingredient is spent.
create table if not exists card_draws (
  id uuid primary key default gen_random_uuid(),
  ingredient text not null check (ingredient in ('tomato', 'basil', 'oil', 'mozzarella')),
  salad_id uuid references salads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists card_draws_open_idx
  on card_draws (ingredient) where salad_id is null;

-- Picks earned minus cards drawn.
create or replace function picks_available()
returns int
language sql
as $$
  select coalesce((select sum(picks) from reward_grants), 0)::int
       - (select count(*) from card_draws)::int;
$$;

-- Draw `draw_count` cards atomically. Rates per card (not per set):
-- tomato 50 %, basil 20 %, oil 20 %, mozzarella 10 %.
-- Keep in sync with INGREDIENT_META in src/lib/rewards.ts (display only).
create or replace function draw_cards(draw_count int)
returns text[]
language plpgsql
as $$
declare
  available int;
  result text[] := '{}';
  roll double precision;
  ingredient_name text;
begin
  if draw_count < 1 or draw_count > 100 then
    raise exception 'draw count out of range';
  end if;

  -- Serialize pantry writes so the balance check cannot race.
  perform pg_advisory_xact_lock(hashtext('caprese_pantry'));

  available := picks_available();
  if available < draw_count then
    raise exception 'not enough picks';
  end if;

  for i in 1..draw_count loop
    roll := random();
    ingredient_name := case
      when roll < 0.50 then 'tomato'
      when roll < 0.70 then 'basil'
      when roll < 0.90 then 'oil'
      else 'mozzarella'
    end;
    insert into card_draws (ingredient) values (ingredient_name);
    result := result || ingredient_name;
  end loop;

  return result;
end;
$$;

-- Craft one salad from 5 tomatoes, 2 basil, 2 oil, 1 mozzarella (oldest cards
-- are spent first). Keep in sync with SALAD_RECIPE in src/lib/rewards.ts.
create or replace function craft_caprese_salad()
returns uuid
language plpgsql
as $$
declare
  new_salad uuid;
begin
  perform pg_advisory_xact_lock(hashtext('caprese_pantry'));

  if (select count(*) from card_draws where salad_id is null and ingredient = 'tomato') < 5
     or (select count(*) from card_draws where salad_id is null and ingredient = 'basil') < 2
     or (select count(*) from card_draws where salad_id is null and ingredient = 'oil') < 2
     or (select count(*) from card_draws where salad_id is null and ingredient = 'mozzarella') < 1
  then
    raise exception 'not enough ingredients';
  end if;

  insert into salads default values returning id into new_salad;

  update card_draws set salad_id = new_salad
  where id in (
    select id from (
      select id, ingredient,
             row_number() over (partition by ingredient order by created_at, id) as rn
      from card_draws
      where salad_id is null
    ) ranked
    where (ingredient = 'tomato' and rn <= 5)
       or (ingredient = 'basil' and rn <= 2)
       or (ingredient = 'oil' and rn <= 2)
       or (ingredient = 'mozzarella' and rn <= 1)
  );

  return new_salad;
end;
$$;

-- The app talks to the database exclusively through the Next.js server using
-- the secret (service-role) key. RLS stays enabled with no policies, so the
-- public anon/publishable keys cannot read or write anything.
alter table categories enable row level security;
alter table entries enable row level security;
alter table journal_entries enable row level security;
alter table salads enable row level security;
alter table reward_grants enable row level security;
alter table card_draws enable row level security;

-- Optional starter categories
insert into categories (name, color) values
  ('Work', '#6E7F98'),
  ('Personal', '#7C8B6F'),
  ('Health', '#A67C7C')
on conflict (name) do nothing;
