-- Player learned actions links
-- Run in Supabase SQL Editor.

create table if not exists public.player_action_links (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists player_action_links_character_action_uidx
  on public.player_action_links(character_id, action_id);

create index if not exists player_action_links_player_idx
  on public.player_action_links(player_id);

create index if not exists player_action_links_character_idx
  on public.player_action_links(character_id);

alter table public.player_action_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_action_links' and policyname = 'player action links select own'
  ) then
    create policy "player action links select own"
      on public.player_action_links
      for select
      using (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_action_links' and policyname = 'player action links insert own'
  ) then
    create policy "player action links insert own"
      on public.player_action_links
      for insert
      with check (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_action_links' and policyname = 'player action links delete own'
  ) then
    create policy "player action links delete own"
      on public.player_action_links
      for delete
      using (auth.uid() = player_id);
  end if;
end $$;
