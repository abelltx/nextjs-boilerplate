-- Session-scoped support effects such as Prophet "Point".
-- Run in Supabase SQL Editor.

alter table if exists public.session_state
  add column if not exists support_effects jsonb not null default '[]'::jsonb;

comment on column public.session_state.support_effects is
  'Session-scoped temporary support effects and pending ally choices, e.g. Prophet Point.';
