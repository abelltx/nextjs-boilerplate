-- Player training traits and trait effects
-- Run in Supabase SQL Editor.

create table if not exists public.player_trait_links (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  trait_id uuid not null references public.traits(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists player_trait_links_character_trait_uidx
  on public.player_trait_links(character_id, trait_id);

create index if not exists player_trait_links_player_idx
  on public.player_trait_links(player_id);

create index if not exists player_trait_links_character_idx
  on public.player_trait_links(character_id);

create table if not exists public.trait_effects (
  id uuid primary key default gen_random_uuid(),
  trait_id uuid not null references public.traits(id) on delete cascade,
  effect_type text not null,
  effect_key text not null,
  mode text not null,
  value numeric null,
  notes text null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists trait_effects_trait_sort_idx
  on public.trait_effects(trait_id, sort_order, created_at);

alter table public.player_trait_links enable row level security;
alter table public.trait_effects enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_trait_links' and policyname = 'player trait links select own'
  ) then
    create policy "player trait links select own"
      on public.player_trait_links
      for select
      using (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_trait_links' and policyname = 'player trait links insert own'
  ) then
    create policy "player trait links insert own"
      on public.player_trait_links
      for insert
      with check (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_trait_links' and policyname = 'player trait links delete own'
  ) then
    create policy "player trait links delete own"
      on public.player_trait_links
      for delete
      using (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trait_effects' and policyname = 'trait effects read all'
  ) then
    create policy "trait effects read all"
      on public.trait_effects
      for select
      using (true);
  end if;
end $$;
