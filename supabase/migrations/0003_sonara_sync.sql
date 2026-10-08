-- Sonara: sync between devices on one account.
-- Run after 0002_sonara_likes.sql in Supabase Dashboard → SQL Editor.
--
-- One row per user. Every column is a self-contained JSON section written by the app:
--   playlists    { items: LocalPlaylist[], deleted: { [id]: timestamp } }  merged per playlist
--   saved        { v: Playlist[], at }   saved SoundCloud / YouTube playlists
--   recent       { v: Track[], at }      listening history ("Jump back in")
--   dislikes     { v: string[], at }     "Don't recommend"
--   prefs        { v: {...}, at }        language, accent, sources, playback options
--   now_playing  { track, queue, index, position, playing, at, device, deviceName }
--   likes_at     bumped after a like / unlike so other devices re-read public.likes
-- Likes themselves stay in public.likes (they also power "Liked by").

create table if not exists public.user_sync (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  playlists   jsonb,
  saved       jsonb,
  recent      jsonb,
  dislikes    jsonb,
  prefs       jsonb,
  now_playing jsonb,
  likes_at    bigint,
  updated_at  timestamptz not null default now()
);

alter table public.user_sync enable row level security;

drop policy if exists "users read own sync" on public.user_sync;
create policy "users read own sync" on public.user_sync
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "users create own sync" on public.user_sync;
create policy "users create own sync" on public.user_sync
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users update own sync" on public.user_sync;
create policy "users update own sync" on public.user_sync
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users delete own sync" on public.user_sync;
create policy "users delete own sync" on public.user_sync
  for delete to authenticated using (auth.uid() = user_id);

-- Tables created by an earlier draft of this migration.
alter table public.user_sync add column if not exists likes_at bigint;

-- Live updates: other devices pick up changes immediately.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_sync'
  ) then
    alter publication supabase_realtime add table public.user_sync;
  end if;
end $$;
