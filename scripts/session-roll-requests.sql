-- Session roll-request queue fields for player-initiated roll approvals
-- Run in Supabase SQL Editor.

alter table if exists public.session_state
  add column if not exists roll_requests jsonb not null default '[]'::jsonb;

alter table if exists public.session_state
  add column if not exists roll_request_id text null;

alter table if exists public.session_state
  add column if not exists roll_request_source text null;

