"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "item_edit_id";
const COOKIE_PATH = "/admin/items/edit";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function openItemEditAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(itemId)) redirect("/admin/items");

  const c = await cookies();
  c.set(COOKIE_KEY, itemId, {
    path: COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
  });

  redirect("/admin/items/edit");
}

export async function updateItemAction(formData: FormData) {
  const itemId = String(formData.get("id") ?? "");
  if (!isUuid(itemId)) redirect("/admin/items");

  const supabase = await createClient();

  const payload: any = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    rarity: (String(formData.get("rarity") ?? "").trim() || null) as string | null,
    weight_lb: formData.get("weight_lb") ? Number(formData.get("weight_lb")) : null,
    summary: (String(formData.get("summary") ?? "").trim() || null) as string | null,
    rules_text: (String(formData.get("rules_text") ?? "").trim() || null) as string | null,
    image_url: (String(formData.get("image_url") ?? "").trim() || null) as string | null,

    is_active: String(formData.get("is_active") ?? "") === "on",

    carry_behavior: String(formData.get("carry_behavior") ?? "loose"),
    stackable: String(formData.get("stackable") ?? "") === "on",
    max_stack: formData.get("max_stack") ? Number(formData.get("max_stack")) : null,

    is_weaponizable: String(formData.get("is_weaponizable") ?? "") === "on",
    weapon_kind: (String(formData.get("weapon_kind") ?? "").trim() || null) as string | null,
    uses_attack_roll: String(formData.get("uses_attack_roll") ?? "on") === "on",
    attack_bonus_override: formData.get("attack_bonus_override")
      ? Number(formData.get("attack_bonus_override"))
      : null,

    damage_dice: (String(formData.get("damage_dice") ?? "").trim() || null) as string | null,
    damage_bonus: formData.get("damage_bonus") ? Number(formData.get("damage_bonus")) : null,
    damage_type: (String(formData.get("damage_type") ?? "").trim() || null) as string | null,

    range_normal: formData.get("range_normal") ? Number(formData.get("range_normal")) : null,
    range_max: formData.get("range_max") ? Number(formData.get("range_max")) : null,

    save_ability: (String(formData.get("save_ability") ?? "").trim() || null) as string | null,
    save_dc_override: formData.get("save_dc_override") ? Number(formData.get("save_dc_override")) : null,
    on_fail: (String(formData.get("on_fail") ?? "").trim() || null) as string | null,
    on_success: (String(formData.get("on_success") ?? "").trim() || null) as string | null,
  };

  // equip_slots: comma-separated or empty
  const slotsRaw = String(formData.get("equip_slots") ?? "").trim();
  payload.equip_slots = slotsRaw
    ? slotsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  // tags: comma-separated or empty
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  payload.tags = tagsRaw
    ? tagsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  // Basic sanity: required
  if (!payload.name || !payload.category) redirect("/admin/items/edit");

  const { error } = await supabase.from("items").update(payload).eq("id", itemId);
  if (error) {
    console.error("updateItemAction error:", error.message);
  }

  redirect("/admin/items/edit");
}

export async function addItemEffectAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(itemId)) redirect("/admin/items");

  const effect_type = String(formData.get("effect_type") ?? "").trim();
  const effect_key = String(formData.get("effect_key") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const sort_order = formData.get("sort_order") ? Number(formData.get("sort_order")) : 0;

  const valueRaw = formData.get("value");
  const value = valueRaw === null || valueRaw === "" ? null : Number(valueRaw);

  // Enforce requireds per your rules:
  if (!effect_type || !effect_key || !mode) redirect("/admin/items/edit");

  if (["ability", "ac", "speed", "skill", "save"].includes(effect_type)) {
    if (value === null || !isFinite(value)) redirect("/admin/items/edit");
  }

  if (effect_type === "special") {
    if (!notes) redirect("/admin/items/edit");
  }

  if (["resistance", "immunity", "advantage"].includes(effect_type)) {
    // value must be null; ignore if provided
  }

  const supabase = await createClient();
  const { error } = await supabase.from("item_effects").insert({
    item_id: itemId,
    effect_type,
    effect_key,
    mode,
    value: ["resistance", "immunity", "advantage", "special"].includes(effect_type) ? null : value,
    notes: effect_type === "special" ? notes : (notes || null),
    sort_order,
  });

  if (error) console.error("addItemEffectAction error:", error.message);

  redirect("/admin/items/edit");
}

export async function deleteItemEffectAction(formData: FormData) {
  const effectId = String(formData.get("effect_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(effectId) || !isUuid(itemId)) redirect("/admin/items/edit");

  const supabase = await createClient();
  const { error } = await supabase.from("item_effects").delete().eq("id", effectId);
  if (error) console.error("deleteItemEffectAction error:", error.message);

  redirect("/admin/items/edit");
}

export async function deleteItemAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(itemId)) redirect("/admin/items");

  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) console.error("deleteItemAction error:", error.message);

  // Clear cookie (optional); still only in action
  const c = await cookies();
  c.set(COOKIE_KEY, "", { path: COOKIE_PATH, maxAge: 0 });

  redirect("/admin/items");
}
