-- Generic debug script for any class-package item.
-- Replace YOUR_CHARACTER_ID and YOUR_CLASS_ITEM_ID, then run sections in Supabase SQL editor.

-- =========================================================
-- 1) Inspect the class-package effect row and raw JSON notes
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
)
select
  i.id as item_id,
  i.name as item_name,
  i.category,
  ie.id as effect_id,
  ie.effect_type,
  ie.effect_key,
  ie.mode,
  ie.notes,
  ie.notes::jsonb as class_package_json
from params p
join public.items i
  on i.id = p.class_item_id
join public.item_effects ie
  on ie.item_id = i.id
where ie.effect_type = 'special'
  and ie.effect_key = 'class_package';

-- =========================================================
-- 2) Expand the JSON into readable top-level fields
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select
    i.id as item_id,
    i.name as item_name,
    ie.notes::jsonb as cfg
  from params p
  join public.items i
    on i.id = p.class_item_id
  join public.item_effects ie
    on ie.item_id = i.id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
)
select
  item_id,
  item_name,
  cfg->>'class_name' as class_name,
  cfg->>'package_id' as package_id,
  coalesce((cfg->>'consume_on_use')::boolean, false) as consume_on_use,
  cfg->'grant_item_ids' as grant_item_ids,
  cfg->'grant_trait_ids' as grant_trait_ids,
  cfg->'grant_action_ids' as grant_action_ids,
  cfg->'replace_stat_block' as replace_stat_block
from pkg;

-- =========================================================
-- 3) Compare configured stat block vs stored stat sources
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select ie.notes::jsonb as cfg
  from params p
  join public.item_effects ie
    on ie.item_id = p.class_item_id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
  limit 1
)
select
  c.id as character_id,
  c.name as character_name,
  c.class as character_class,
  c.stat_block as characters_stat_block,
  csc.stat_block_current,
  pkg.cfg->'replace_stat_block' as configured_replace_stat_block
from params p
join public.characters c
  on c.id = p.character_id
left join public.character_stats_current csc
  on csc.character_id = c.id
cross join pkg;

-- =========================================================
-- 4) Compare key fields side by side
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select ie.notes::jsonb as cfg
  from params p
  join public.item_effects ie
    on ie.item_id = p.class_item_id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
  limit 1
)
select
  c.id as character_id,
  c.class as actual_class,
  pkg.cfg->>'class_name' as expected_class,
  c.stat_block->'abilities' as actual_char_abilities,
  pkg.cfg->'replace_stat_block'->'abilities' as expected_abilities,
  c.stat_block->'derived' as actual_char_derived,
  pkg.cfg->'replace_stat_block'->'derived' as expected_derived,
  c.stat_block->'resources' as actual_char_resources,
  pkg.cfg->'replace_stat_block'->'resources' as expected_resources,
  csc.stat_block_current->'abilities' as current_abilities_seen_by_player_page,
  csc.stat_block_current->'derived' as current_derived_seen_by_player_page,
  csc.stat_block_current->'resources' as current_resources_seen_by_player_page
from params p
join public.characters c
  on c.id = p.character_id
left join public.character_stats_current csc
  on csc.character_id = c.id
cross join pkg;

-- =========================================================
-- 5) Check whether the package was marked as applied
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id
)
select
  c.id,
  c.class,
  c.stat_block->'meta'->'class_package_applied_ids' as applied_package_ids
from params p
join public.characters c
  on c.id = p.character_id;

-- =========================================================
-- 6) Verify granted inventory items
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select jsonb_array_elements_text(ie.notes::jsonb->'grant_item_ids') as granted_item_id
  from params p
  join public.item_effects ie
    on ie.item_id = p.class_item_id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
)
select
  pkg.granted_item_id,
  i.name as expected_item_name,
  ii.id as inventory_row_id,
  ii.character_id,
  ii.quantity
from params p
cross join pkg
left join public.items i
  on i.id::text = pkg.granted_item_id
left join public.inventory_items ii
  on ii.item_id::text = pkg.granted_item_id
 and ii.character_id = p.character_id
order by expected_item_name nulls last;

-- =========================================================
-- 7) Verify granted actions
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select jsonb_array_elements_text(ie.notes::jsonb->'grant_action_ids') as granted_action_id
  from params p
  join public.item_effects ie
    on ie.item_id = p.class_item_id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
)
select
  pkg.granted_action_id,
  a.name as expected_action_name,
  pal.id as player_action_link_id,
  pal.character_id
from params p
cross join pkg
left join public.actions a
  on a.id::text = pkg.granted_action_id
left join public.player_action_links pal
  on pal.action_id::text = pkg.granted_action_id
 and pal.character_id = p.character_id
order by expected_action_name nulls last;

-- =========================================================
-- 8) Verify granted traits
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select jsonb_array_elements_text(ie.notes::jsonb->'grant_trait_ids') as granted_trait_id
  from params p
  join public.item_effects ie
    on ie.item_id = p.class_item_id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
)
select
  pkg.granted_trait_id,
  t.name as expected_trait_name,
  ptl.id as player_trait_link_id,
  ptl.character_id
from params p
cross join pkg
left join public.traits t
  on t.id::text = pkg.granted_trait_id
left join public.player_trait_links ptl
  on ptl.trait_id::text = pkg.granted_trait_id
 and ptl.character_id = p.character_id
order by expected_trait_name nulls last;

-- =========================================================
-- 9) Check whether the source token was consumed
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
)
select
  ii.*
from params p
left join public.inventory_items ii
  on ii.character_id = p.character_id
 and ii.item_id = p.class_item_id;

-- =========================================================
-- 10) Optional diff summary
-- =========================================================

with params as (
  select
    'YOUR_CHARACTER_ID'::uuid as character_id,
    'YOUR_CLASS_ITEM_ID'::uuid as class_item_id
),
pkg as (
  select ie.notes::jsonb as cfg
  from params p
  join public.item_effects ie
    on ie.item_id = p.class_item_id
  where ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
  limit 1
)
select
  c.id as character_id,
  (c.class = pkg.cfg->>'class_name') as class_matches,
  (c.stat_block->'abilities' = pkg.cfg->'replace_stat_block'->'abilities') as abilities_match,
  (c.stat_block->'derived' = pkg.cfg->'replace_stat_block'->'derived') as derived_match,
  (c.stat_block->'resources' = pkg.cfg->'replace_stat_block'->'resources') as resources_match,
  (csc.stat_block_current->'abilities' = pkg.cfg->'replace_stat_block'->'abilities') as current_abilities_match,
  (csc.stat_block_current->'derived' = pkg.cfg->'replace_stat_block'->'derived') as current_derived_match,
  (csc.stat_block_current->'resources' = pkg.cfg->'replace_stat_block'->'resources') as current_resources_match
from params p
join public.characters c
  on c.id = p.character_id
left join public.character_stats_current csc
  on csc.character_id = c.id
cross join pkg;
