-- Supabase schema for RedReader
--
-- This file is intended to be run in the Supabase SQL editor.
-- It creates:
-- - documents (stored tokens + ORP indexes + raw text)
-- - folders (for organizing documents)
-- - reading_state (per-document reader progress)
--
-- Notes:
-- - Uses RLS with auth.uid() ownership checks.
-- - If you already created tables, adjust to use ALTER TABLE snippets instead.

-- Extensions (uuid generation)
create extension if not exists pgcrypto;

-- ========== folders ==========
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint folders_name_nonempty check (length(trim(name)) > 0),
  constraint folders_user_name_unique unique (user_id, name)
);

alter table public.folders enable row level security;

drop policy if exists "folders_select_own" on public.folders;
create policy "folders_select_own"
on public.folders for select
using (auth.uid() = user_id);

drop policy if exists "folders_insert_own" on public.folders;
create policy "folders_insert_own"
on public.folders for insert
with check (auth.uid() = user_id);

drop policy if exists "folders_update_own" on public.folders;
create policy "folders_update_own"
on public.folders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "folders_delete_own" on public.folders;
create policy "folders_delete_own"
on public.folders for delete
using (auth.uid() = user_id);

-- ========== documents ==========
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  folder_id uuid null references public.folders (id) on delete set null,
  title text not null,
  raw_text text not null,
  tokens text[] not null default '{}'::text[],
  orp_indexes int[] not null default '{}'::int[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documents_title_nonempty check (length(trim(title)) > 0)
);

-- If `documents` already existed from an earlier version, ensure folder support is added.
alter table public.documents add column if not exists folder_id uuid;
create index if not exists documents_folder_id_idx on public.documents (folder_id);
do $$
begin
  alter table public.documents
    add constraint documents_folder_id_fkey
    foreign key (folder_id) references public.folders (id) on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists documents_user_id_idx on public.documents (user_id);

alter table public.documents enable row level security;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
on public.documents for select
using (auth.uid() = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
on public.documents for insert
with check (auth.uid() = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
on public.documents for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
on public.documents for delete
using (auth.uid() = user_id);

-- ========== reading_state ==========
create table if not exists public.reading_state (
  document_id uuid primary key references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  idx int not null default 0,
  wpm int not null default 600,
  theme jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.reading_state enable row level security;

drop policy if exists "reading_state_select_own" on public.reading_state;
create policy "reading_state_select_own"
on public.reading_state for select
using (auth.uid() = user_id);

drop policy if exists "reading_state_insert_own" on public.reading_state;
create policy "reading_state_insert_own"
on public.reading_state for insert
with check (auth.uid() = user_id);

drop policy if exists "reading_state_update_own" on public.reading_state;
create policy "reading_state_update_own"
on public.reading_state for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "reading_state_delete_own" on public.reading_state;
create policy "reading_state_delete_own"
on public.reading_state for delete
using (auth.uid() = user_id);
