-- DFI compliance — Supabase schema.
-- Run this once in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- The app talks to these tables with the SERVICE ROLE key (server-side only),
-- which bypasses row-level security, so no RLS policies are needed here.

-- Users: full user object (incl. salt/hash for password accounts) stored in `data`.
create table if not exists public.users (
  id         text primary key,
  email      text unique,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- Projects: the whole project blob in `data`; id/owner_id/updated_at duplicated
-- as columns for filtering and sorting.
create table if not exists public.projects (
  id         text primary key,
  owner_id   text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists projects_owner_idx   on public.projects (owner_id);
create index if not exists projects_updated_idx on public.projects (updated_at desc);
