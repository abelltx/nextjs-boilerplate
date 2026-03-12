-- Session hex focus runtime state for hex_crawl presentation.
alter table if exists public.session_state
  add column if not exists hex_focus jsonb;

-- Optional helpful comment.
comment on column public.session_state.hex_focus is
  'Runtime focused hex marker state (block_id, marker_id, check info, reward state) for storyteller/player dashboards.';

