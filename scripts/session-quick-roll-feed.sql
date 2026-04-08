alter table if exists public.session_state
  add column if not exists quick_roll_feed jsonb not null default '[]'::jsonb;

comment on column public.session_state.quick_roll_feed is
  'Recent player quick-roll results for storyteller visibility.';
