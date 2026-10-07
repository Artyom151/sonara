-- Sonara: accounts, profiles, avatars and timed track comments.
-- Run once in Supabase Dashboard → SQL Editor (or `supabase db push`).

-- ───────────── Profiles ─────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null default '' check (char_length(display_name) <= 40),
  -- 'preset:<n>' for a built-in avatar, or a public Storage URL
  avatar       text not null default 'preset:0',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles
  for select using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "users insert own profile" on public.profiles;
create policy "users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

-- Create the profile from sign-up metadata (username, display_name, avatar).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)), '[^a-z0-9_.]', '', 'g'));
  candidate text;
begin
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 20);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := base || floor(random() * 10000)::text;
  end loop;
  insert into public.profiles (id, username, display_name, avatar)
  values (
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data ->> 'display_name', candidate),
    coalesce(new.raw_user_meta_data ->> 'avatar', 'preset:0')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ───────────── Comments (timed, per track) ─────────────
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  track_key  text not null check (char_length(track_key) <= 120),  -- e.g. 'soundcloud:123' / 'youtube:abc'
  user_id    uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 500),
  position   real not null default 0 check (position >= 0),          -- seconds into the track
  created_at timestamptz not null default now()
);

create index if not exists comments_track_idx on public.comments (track_key, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments are public" on public.comments;
create policy "comments are public" on public.comments
  for select using (true);

drop policy if exists "signed-in users comment as themselves" on public.comments;
create policy "signed-in users comment as themselves" on public.comments
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users delete own comments" on public.comments;
create policy "users delete own comments" on public.comments
  for delete using (auth.uid() = user_id);

-- Live updates in the player
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;
end $$;

-- ───────────── Avatar storage ─────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users replace own avatar" on storage.objects;
create policy "users replace own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "users delete own avatar" on storage.objects;
create policy "users delete own avatar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
