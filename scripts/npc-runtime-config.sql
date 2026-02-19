-- NPC runtime config (player-facing tabs, quests, gear/training ids)
-- Run in Supabase SQL Editor.

create table if not exists public.npc_runtime_configs (
  id uuid primary key default gen_random_uuid(),
  npc_id uuid not null unique references public.npcs(id) on delete cascade,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_npc_runtime_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_npc_runtime_configs_touch_updated_at on public.npc_runtime_configs;
create trigger trg_npc_runtime_configs_touch_updated_at
before update on public.npc_runtime_configs
for each row execute function public.touch_npc_runtime_configs_updated_at();

alter table public.npc_runtime_configs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='npc_runtime_configs' and policyname='npc runtime read all'
  ) then
    create policy "npc runtime read all"
      on public.npc_runtime_configs
      for select
      using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='npc_runtime_configs' and policyname='npc runtime admin write'
  ) then
    create policy "npc runtime admin write"
      on public.npc_runtime_configs
      for all
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.is_admin, false) = true
        )
      )
      with check (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and coalesce(p.is_admin, false) = true
        )
      );
  end if;
end $$;
