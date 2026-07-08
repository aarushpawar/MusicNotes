create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,32}$')
);

create table public.tracks (
  spotify_track_id text primary key,
  spotify_url text not null,
  title text not null,
  artists text[] not null default '{}',
  album text,
  artwork_url text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  track_id text not null references public.tracks(spotify_track_id) on delete cascade,
  body text not null default '',
  shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, track_id)
);

create table public.sync_subscriptions (
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  followed_user_id uuid not null references public.profiles(id) on delete cascade,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner_id, followed_user_id),
  constraint cannot_follow_self check (owner_id <> followed_user_id)
);

create index notes_track_shared_idx on public.notes (track_id, shared) where shared;
create index sync_owner_priority_idx on public.sync_subscriptions (owner_id, priority);

alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.notes enable row level security;
alter table public.sync_subscriptions enable row level security;

create policy "profiles are searchable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "tracks are readable"
  on public.tracks for select
  to authenticated
  using (true);

create policy "authenticated users can upsert tracks"
  on public.tracks for insert
  to authenticated
  with check (true);

create policy "authenticated users can update tracks"
  on public.tracks for update
  to authenticated
  using (true)
  with check (true);

create policy "users can read own notes or shared notes"
  on public.notes for select
  to authenticated
  using (user_id = auth.uid() or shared = true);

create policy "users can insert own notes"
  on public.notes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can update own notes"
  on public.notes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "users can delete own notes"
  on public.notes for delete
  to authenticated
  using (user_id = auth.uid());

create policy "users can read own sync subscriptions"
  on public.sync_subscriptions for select
  to authenticated
  using (owner_id = auth.uid());

create policy "users can insert own sync subscriptions"
  on public.sync_subscriptions for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy "users can update own sync subscriptions"
  on public.sync_subscriptions for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "users can delete own sync subscriptions"
  on public.sync_subscriptions for delete
  to authenticated
  using (owner_id = auth.uid());
