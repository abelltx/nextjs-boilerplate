-- Replace the session id in both queries before running.

-- Rat NPC repair
-- 1) Ensure the Rat NPC runtime config exposes Bite.
insert into public.npc_runtime_configs (npc_id, meta_json)
values (
  '07c12506-c76f-4fc7-a0eb-320cc0e73ed6'::uuid,
  jsonb_build_object(
    'npc_tabs',
    jsonb_build_object(
      'training',
      jsonb_build_object(
        'action_ids',
        jsonb_build_array('56c98b1b-dfa4-4bdd-b86d-b553570aeeb9')
      )
    )
  )
)
on conflict (npc_id)
do update
set meta_json = jsonb_set(
  coalesce(public.npc_runtime_configs.meta_json, '{}'::jsonb),
  '{npc_tabs,training,action_ids}',
  jsonb_build_array('56c98b1b-dfa4-4bdd-b86d-b553570aeeb9'),
  true
);

-- 2) Patch the active encounter so current Rat combatants immediately get AC 10.
-- Replace the session id before running.
with expanded as (
  select
    ss.session_id,
    jsonb_array_elements(coalesce(ss.encounter_state->'combatants', '[]'::jsonb)) as combatant
  from public.session_state ss
  where ss.session_id = 'YOUR_SESSION_ID'::uuid
),
rebuilt as (
  select jsonb_agg(
    case
      when combatant->>'npc_id' = '07c12506-c76f-4fc7-a0eb-320cc0e73ed6' then
        jsonb_set(combatant, '{defense}', to_jsonb(10), true)
      else combatant
    end
  ) as combatants
  from expanded
)
update public.session_state ss
set encounter_state = jsonb_set(ss.encounter_state, '{combatants}', rebuilt.combatants, true)
from rebuilt
where ss.session_id = 'YOUR_SESSION_ID'::uuid;

-- Full encounter/NPC/action resolution view
with encounter as (
  select
    ss.session_id,
    jsonb_array_elements(coalesce(ss.encounter_state->'combatants', '[]'::jsonb)) as combatant
  from public.session_state ss
  where ss.session_id = 'YOUR_SESSION_ID'::uuid
),
enemies as (
  select
    e.session_id,
    e.combatant->>'id' as combatant_id,
    e.combatant->>'name' as combatant_name,
    e.combatant->>'npc_id' as combatant_npc_id,
    e.combatant->>'source_id' as source_id,
    e.combatant->>'defense' as encounter_defense,
    e.combatant as combatant_json
  from encounter e
  where lower(coalesce(e.combatant->>'kind', '')) = 'enemy'
),
runtime as (
  select
    n.id as npc_id,
    n.name as npc_name,
    n.stat_block,
    nrc.meta_json,
    coalesce(
      nrc.meta_json->'npc_tabs'->'training'->'action_ids',
      '[]'::jsonb
    ) as global_action_ids
  from public.npcs n
  left join public.npc_runtime_configs nrc
    on nrc.npc_id = n.id
),
resolved_action_ids as (
  select
    e.combatant_id,
    e.combatant_name,
    e.combatant_npc_id,
    r.npc_name,
    e.encounter_defense,
    r.stat_block->>'ac' as npc_ac,
    r.stat_block->'derived'->>'defense' as npc_derived_defense,
    r.meta_json,
    x.action_id
  from enemies e
  left join runtime r
    on r.npc_id::text = e.combatant_npc_id
  left join lateral (
    select jsonb_array_elements_text(
      coalesce(
        r.meta_json->'npc_tabs'->'training'->'action_ids',
        '[]'::jsonb
      )
    ) as action_id
  ) x on true
)
select
  rai.combatant_id,
  rai.combatant_name,
  rai.combatant_npc_id,
  rai.npc_name,
  rai.encounter_defense,
  rai.npc_ac,
  rai.npc_derived_defense,
  rai.action_id,
  a.name as action_name
from resolved_action_ids rai
left join public.actions a
  on a.id::text = rai.action_id
order by rai.combatant_name, a.name nulls last;

-- Broken rows only
with encounter as (
  select
    ss.session_id,
    jsonb_array_elements(coalesce(ss.encounter_state->'combatants', '[]'::jsonb)) as combatant
  from public.session_state ss
  where ss.session_id = 'YOUR_SESSION_ID'::uuid
),
enemies as (
  select
    e.combatant->>'id' as combatant_id,
    e.combatant->>'name' as combatant_name,
    e.combatant->>'npc_id' as combatant_npc_id,
    e.combatant->>'defense' as encounter_defense
  from encounter e
  where lower(coalesce(e.combatant->>'kind', '')) = 'enemy'
)
select
  e.*,
  n.name as npc_name,
  n.stat_block->>'ac' as npc_ac,
  n.stat_block->'derived'->>'defense' as npc_derived_defense,
  nrc.meta_json->'npc_tabs'->'training'->'action_ids' as runtime_action_ids
from enemies e
left join public.npcs n
  on n.id::text = e.combatant_npc_id
left join public.npc_runtime_configs nrc
  on nrc.npc_id::text = e.combatant_npc_id
where
  e.combatant_npc_id is null
  or e.combatant_npc_id = ''
  or n.id is null
  or coalesce(jsonb_array_length(nrc.meta_json->'npc_tabs'->'training'->'action_ids'), 0) = 0
  or (
    e.encounter_defense is null
    and n.stat_block->>'ac' is null
    and n.stat_block->'derived'->>'defense' is null
  );
