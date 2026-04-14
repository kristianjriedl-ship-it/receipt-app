create extension if not exists pgcrypto;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists workspace_members_select_member on public.workspace_members;
drop policy if exists workspaces_select_member on public.workspaces;
drop policy if exists receipts_select_member on public.receipts;
drop policy if exists receipts_insert_member on public.receipts;
drop policy if exists receipts_update_owner on public.receipts;
drop policy if exists receipt_items_select_member on public.receipt_items;
drop policy if exists receipt_items_insert_member on public.receipt_items;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'Submitter',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  submitted_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  vendor text not null default 'Unknown vendor',
  receipt_date date not null default current_date,
  amount numeric(12,2) not null default 0,
  category text not null default 'Other',
  notes text,
  status text not null default 'Pending',
  cost_centre text,
  file_name text,
  image_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts(id) on delete cascade,
  description text not null,
  amount numeric(12,2) not null default 0,
  category text not null default 'Other',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

create policy profiles_select_own on public.profiles
for select using (auth.uid() = id);

create policy profiles_insert_own on public.profiles
for insert with check (auth.uid() = id);

create policy profiles_update_own on public.profiles
for update using (auth.uid() = id);

create policy workspace_members_select_member on public.workspace_members
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_members.workspace_id and wm.user_id = auth.uid()
  )
);

create policy workspaces_select_member on public.workspaces
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspaces.id and wm.user_id = auth.uid()
  )
);

create policy receipts_select_member on public.receipts
for select using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id and wm.user_id = auth.uid()
  )
);

create policy receipts_insert_member on public.receipts
for insert with check (
  submitted_by = auth.uid() and exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id and wm.user_id = auth.uid()
  )
);

create policy receipts_update_owner on public.receipts
for update using (
  exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = receipts.workspace_id and wm.user_id = auth.uid() and wm.role = 'Owner'
  )
);

create policy receipt_items_select_member on public.receipt_items
for select using (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id and wm.user_id = auth.uid()
  )
);

create policy receipt_items_insert_member on public.receipt_items
for insert with check (
  exists (
    select 1
    from public.receipts r
    join public.workspace_members wm on wm.workspace_id = r.workspace_id
    where r.id = receipt_items.receipt_id and wm.user_id = auth.uid()
  )
);
