-- Sonara: liked tracks (synced library + "Liked by" in the player).
-- Run after 0001_sonara_init.sql in Supabase Dashboard → SQL Editor.

create table if not exists public.likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  track_key  text not null check (char_length(track_key) <= 120),
  -- Track snapshot (title, artist, artwork…) so the library syncs across devices.
  track      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, track_key)
);

create index if not exists likes_track_idx on public.likes (track_key, created_at desc);

alter table public.likes enable row level security;

-- Public so the player can show who liked a track.
drop policy if exists "likes are public" on public.likes;
create policy "likes are public" on public.likes
  for select using (true);

drop policy if exists "users like as themselves" on public.likes;
create policy "users like as themselves" on public.likes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "users update own likes" on public.likes;
create policy "users update own likes" on public.likes
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users remove own likes" on public.likes;
create policy "users remove own likes" on public.likes
  for delete to authenticated using (auth.uid() = user_id);
