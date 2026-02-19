-- Player quest progress + reward claim tracking
-- Run in Supabase SQL Editor.

create table if not exists public.player_quest_progress (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  quest_id text not null,
  quest_title text null,
  status text not null default 'active',
  completed_task_ids text[] not null default '{}'::text[],
  reward_meta jsonb not null default '{}'::jsonb,
  last_task_at timestamptz null,
  completed_at timestamptz null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists player_quest_progress_character_quest_uidx
  on public.player_quest_progress(character_id, quest_id);

create index if not exists player_quest_progress_player_idx
  on public.player_quest_progress(player_id);

create index if not exists player_quest_progress_character_idx
  on public.player_quest_progress(character_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'player_quest_progress_status_check'
  ) then
    alter table public.player_quest_progress
      add constraint player_quest_progress_status_check
      check (status in ('available', 'active', 'completed', 'claimed'));
  end if;
end $$;

create or replace function public.touch_player_quest_progress_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_player_quest_progress_touch_updated_at on public.player_quest_progress;
create trigger trg_player_quest_progress_touch_updated_at
before update on public.player_quest_progress
for each row execute function public.touch_player_quest_progress_updated_at();

alter table public.player_quest_progress enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_quest_progress' and policyname = 'player quest progress select own'
  ) then
    create policy "player quest progress select own"
      on public.player_quest_progress
      for select
      using (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_quest_progress' and policyname = 'player quest progress insert own'
  ) then
    create policy "player quest progress insert own"
      on public.player_quest_progress
      for insert
      with check (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_quest_progress' and policyname = 'player quest progress update own'
  ) then
    create policy "player quest progress update own"
      on public.player_quest_progress
      for update
      using (auth.uid() = player_id)
      with check (auth.uid() = player_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'player_quest_progress' and policyname = 'player quest progress delete own'
  ) then
    create policy "player quest progress delete own"
      on public.player_quest_progress
      for delete
      using (auth.uid() = player_id);
  end if;
end $$;
