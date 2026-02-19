-- Optional phase-2 structure for reusable NPCs with episode-specific overrides.
-- Safe to run now; current implementation can adopt this table incrementally.

create table if not exists public.episode_npc_bindings (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  episode_block_id uuid null references public.episode_blocks(id) on delete cascade,
  scene_block_id uuid null references public.episode_blocks(id) on delete set null,
  npc_id uuid not null references public.npcs(id) on delete restrict,
  title_override text null,
  body_override text null,
  image_override text null,
  tab_overrides_json jsonb not null default '{}'::jsonb,
  quests_override_json jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.episode_npc_bindings
  add column if not exists episode_block_id uuid null references public.episode_blocks(id) on delete cascade;

create index if not exists episode_npc_bindings_episode_idx
  on public.episode_npc_bindings(episode_id, sort_order, created_at);

create unique index if not exists episode_npc_bindings_episode_block_uidx
  on public.episode_npc_bindings(episode_block_id)
  where episode_block_id is not null;

create index if not exists episode_npc_bindings_npc_idx
  on public.episode_npc_bindings(npc_id);

create or replace function public.touch_episode_npc_bindings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_episode_npc_bindings_touch_updated_at on public.episode_npc_bindings;
create trigger trg_episode_npc_bindings_touch_updated_at
before update on public.episode_npc_bindings
for each row execute function public.touch_episode_npc_bindings_updated_at();
