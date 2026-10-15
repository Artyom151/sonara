-- Sonara: replies to comments (one level: a reply points to a top-level comment).
-- Run after 0001 … 0003 in Supabase Dashboard → SQL Editor.

alter table public.comments
  add column if not exists parent_id uuid references public.comments (id) on delete cascade;

create index if not exists comments_parent_idx on public.comments (parent_id);
