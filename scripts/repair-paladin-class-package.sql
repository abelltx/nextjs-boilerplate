-- Repair script for the Paladin class-package on character
-- 2e1e9cee-5611-4922-8f85-7b75b7dd1a2e
--
-- Run sections in order in Supabase SQL editor.

-- =========================================================
-- 1) Give the Paladin class item back to the character
-- =========================================================

with params as (
  select
    '2e1e9cee-5611-4922-8f85-7b75b7dd1a2e'::uuid as character_id,
    '59d0fb62-e201-4be9-b603-17cd53d503a5'::uuid as item_id
),
updated as (
  update public.inventory_items ii
     set quantity = coalesce(ii.quantity, 1) + 1
    from params p
   where ii.character_id = p.character_id
     and ii.item_id = p.item_id
  returning ii.id
)
insert into public.inventory_items (character_id, item_id, name, quantity)
select
  p.character_id,
  p.item_id,
  i.name,
  1
from params p
join public.items i
  on i.id = p.item_id
where not exists (select 1 from updated);

-- =========================================================
-- 2) Remove the Paladin package applied marker
-- =========================================================

with pkg as (
  select
    coalesce(
      nullif(trim(ie.notes::jsonb->>'package_id'), ''),
      '59d0fb62-e201-4be9-b603-17cd53d503a5'
    ) as package_id
  from public.item_effects ie
  where ie.item_id = '59d0fb62-e201-4be9-b603-17cd53d503a5'::uuid
    and ie.effect_type = 'special'
    and ie.effect_key = 'class_package'
  limit 1
),
next_meta as (
  select
    c.id,
    jsonb_set(
      coalesce(c.stat_block, '{}'::jsonb),
      '{meta,class_package_applied_ids}',
      coalesce(
        (
          select jsonb_agg(to_jsonb(val))
          from jsonb_array_elements_text(
            coalesce(c.stat_block->'meta'->'class_package_applied_ids', '[]'::jsonb)
          ) as x(val)
          where x.val <> pkg.package_id
        ),
        '[]'::jsonb
      ),
      true
    ) as next_stat_block
  from public.characters c
  cross join pkg
  where c.id = '2e1e9cee-5611-4922-8f85-7b75b7dd1a2e'::uuid
)
update public.characters c
set stat_block = n.next_stat_block
from next_meta n
where c.id = n.id;

-- =========================================================
-- 3) Sync the current stat mirror used by /player
-- =========================================================

update public.character_stats_current csc
set stat_block_current = c.stat_block
from public.characters c
where csc.character_id = c.id
  and c.id = '2e1e9cee-5611-4922-8f85-7b75b7dd1a2e'::uuid;

-- =========================================================
-- 4) Optional verification
-- =========================================================

select
  c.id,
  c.name,
  c.class,
  c.stat_block->'meta'->'class_package_applied_ids' as applied_package_ids
from public.characters c
where c.id = '2e1e9cee-5611-4922-8f85-7b75b7dd1a2e'::uuid;

select
  ii.id,
  ii.character_id,
  ii.item_id,
  ii.name,
  ii.quantity
from public.inventory_items ii
where ii.character_id = '2e1e9cee-5611-4922-8f85-7b75b7dd1a2e'::uuid
  and ii.item_id = '59d0fb62-e201-4be9-b603-17cd53d503a5'::uuid;
