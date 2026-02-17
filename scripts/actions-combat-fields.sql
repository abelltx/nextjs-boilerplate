-- Adds optional combat columns to public.actions used by player Actions tab.
-- Run in Supabase SQL Editor.

alter table if exists public.actions
  add column if not exists uses_attack_roll boolean not null default true,
  add column if not exists attack_bonus_override integer null,
  add column if not exists range_normal integer null,
  add column if not exists range_max integer null,
  add column if not exists damage_dice text null,
  add column if not exists damage_bonus integer null,
  add column if not exists damage_type text null,
  add column if not exists save_ability text null,
  add column if not exists save_dc_override integer null,
  add column if not exists on_fail text null,
  add column if not exists on_success text null;
