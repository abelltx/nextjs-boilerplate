-- Adds machine-readable action configuration for advanced action mechanics.
-- Run in Supabase SQL Editor.

alter table if exists public.actions
  add column if not exists action_config jsonb null;

comment on column public.actions.action_config is
  'Machine-readable action behavior config, e.g. targeted support options, triggers, and consumption rules.';
