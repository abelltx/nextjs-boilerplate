-- Atomic class-package apply + optional consume
-- Run in Supabase SQL Editor.

create or replace function public.apply_class_package_from_inventory(
  p_character_id uuid,
  p_inventory_item_id uuid,
  p_package_id text,
  p_class_name text default null,
  p_replace_stat_block jsonb default null,
  p_grant_item_ids uuid[] default null,
  p_grant_trait_ids uuid[] default null,
  p_grant_action_ids uuid[] default null,
  p_consume_on_use boolean default true
)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_now timestamptz := now();
  v_uid uuid := auth.uid();
  v_character record;
  v_inv record;
  v_cur record;
  v_base jsonb;
  v_next jsonb;
  v_meta jsonb;
  v_ids jsonb;
  v_pkg text := nullif(trim(coalesce(p_package_id, '')), '');
  v_it record;
  v_existing record;
  v_qty int;
begin
  if v_uid is null then
    raise exception 'Not signed in.';
  end if;

  if p_character_id is null or p_inventory_item_id is null then
    raise exception 'Missing item or character.';
  end if;

  select c.id, c.user_id, c.stat_block
  into v_character
  from public.characters c
  where c.id = p_character_id
  for update;

  if not found or v_character.user_id <> v_uid then
    raise exception 'Character not found.';
  end if;

  select ii.id, ii.item_id, coalesce(ii.quantity, 1)::int as quantity
  into v_inv
  from public.inventory_items ii
  where ii.id = p_inventory_item_id
    and ii.character_id = p_character_id
  for update;

  if not found then
    raise exception 'Inventory item not found.';
  end if;

  if v_pkg is null then
    v_pkg := coalesce(v_inv.item_id::text, p_inventory_item_id::text);
  end if;

  select csc.id, csc.stat_block_current
  into v_cur
  from public.character_stats_current csc
  where csc.character_id = p_character_id
  for update;

  v_base := coalesce(v_cur.stat_block_current, v_character.stat_block, '{}'::jsonb);
  v_meta := coalesce(v_base->'meta', '{}'::jsonb);
  v_ids := coalesce(v_meta->'class_package_applied_ids', '[]'::jsonb);

  if exists (
    select 1
    from jsonb_array_elements_text(v_ids) x(val)
    where x.val = v_pkg
  ) then
    return jsonb_build_object(
      'ok', true,
      'already_applied', true,
      'message', 'Class package already applied.'
    );
  end if;

  v_next := coalesce(p_replace_stat_block, v_base);
  v_meta := coalesce(v_next->'meta', '{}'::jsonb);
  v_ids := coalesce(v_meta->'class_package_applied_ids', '[]'::jsonb) || to_jsonb(v_pkg);
  v_meta := jsonb_set(v_meta, '{class_package_applied_ids}', v_ids, true);
  v_next := jsonb_set(v_next, '{meta}', v_meta, true);

  if v_cur.id is not null then
    update public.character_stats_current
       set stat_block_current = v_next
     where id = v_cur.id;
  else
    update public.characters
       set stat_block = v_next
     where id = p_character_id;
  end if;

  if nullif(trim(coalesce(p_class_name, '')), '') is not null then
    update public.characters
       set class = trim(p_class_name)
     where id = p_character_id;
  end if;

  if coalesce(array_length(p_grant_trait_ids, 1), 0) > 0 then
    insert into public.player_trait_links (player_id, character_id, trait_id)
    select v_uid, p_character_id, t
    from unnest(p_grant_trait_ids) t
    where t is not null
    on conflict (character_id, trait_id) do nothing;
  end if;

  if coalesce(array_length(p_grant_action_ids, 1), 0) > 0 then
    insert into public.player_action_links (player_id, character_id, action_id)
    select v_uid, p_character_id, a
    from unnest(p_grant_action_ids) a
    where a is not null
    on conflict (character_id, action_id) do nothing;
  end if;

  if coalesce(array_length(p_grant_item_ids, 1), 0) > 0 then
    for v_it in
      select i.id, i.name, coalesce(i.stackable, true) as stackable, i.max_stack
      from public.items i
      where i.id = any(p_grant_item_ids)
        and coalesce(i.is_active, true) = true
    loop
      select ii.id, coalesce(ii.quantity, 1)::int as quantity
      into v_existing
      from public.inventory_items ii
      where ii.character_id = p_character_id
        and ii.item_id = v_it.id
      order by ii.created_at asc
      limit 1
      for update;

      if found and v_it.stackable then
        v_qty := greatest(1, v_existing.quantity);
        if v_it.max_stack is not null and v_it.max_stack > 0 then
          if v_qty < v_it.max_stack then
            update public.inventory_items
               set quantity = least(v_it.max_stack, v_qty + 1)
             where id = v_existing.id;
          end if;
        else
          update public.inventory_items
             set quantity = v_qty + 1
           where id = v_existing.id;
        end if;
      elsif not found then
        insert into public.inventory_items (character_id, item_id, name, quantity)
        values (p_character_id, v_it.id, coalesce(v_it.name, 'Class Reward'), 1);
      end if;
    end loop;
  end if;

  if coalesce(p_consume_on_use, true) then
    if v_inv.quantity > 1 then
      update public.inventory_items
         set quantity = v_inv.quantity - 1
       where id = v_inv.id;
    else
      delete from public.inventory_items where id = v_inv.id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'already_applied', false,
    'consumed', coalesce(p_consume_on_use, true),
    'message', 'Class package applied.',
    'applied_at', v_now
  );
end;
$$;

grant execute on function public.apply_class_package_from_inventory(
  uuid, uuid, text, text, jsonb, uuid[], uuid[], uuid[], boolean
) to authenticated, service_role;

