-- Adds item-level faith restriction used by NPC Gear purchases.
-- Run in Supabase SQL Editor.

alter table if exists public.items
  add column if not exists faith_required integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'items_faith_required_nonnegative'
  ) then
    alter table public.items
      add constraint items_faith_required_nonnegative
      check (faith_required >= 0);
  end if;
end $$;
