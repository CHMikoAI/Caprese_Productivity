-- Caprese schema — run this once in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8E9196',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_id uuid references categories(id) on delete set null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  category_id uuid references categories(id) on delete set null,
  task_id uuid unique references tasks(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null unique,
  pillar text not null check (pillar in ('freedom', 'health', 'relationship')),
  content text not null,
  created_at timestamptz not null default now()
);

-- The app talks to the database exclusively through the Next.js server using
-- the service-role key. RLS stays enabled with no policies, so the public
-- anon key cannot read or write anything.
alter table categories enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table journal_entries enable row level security;

-- Optional starter categories
insert into categories (name, color) values
  ('Work', '#6E7F98'),
  ('Personal', '#7C8B6F'),
  ('Health', '#A67C7C')
on conflict (name) do nothing;
