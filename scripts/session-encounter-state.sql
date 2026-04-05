alter table if exists public.session_state
  add column if not exists encounter_state jsonb not null default 'null'::jsonb;

comment on column public.session_state.encounter_state is
  'Live encounter runtime state, including initiative, combatants, objectives, and map/grid metadata.';
