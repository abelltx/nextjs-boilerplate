"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "item_edit_id";
const COOKIE_PATH = "/admin/items/edit";
const IMAGE_BUCKET = "item-images";

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
    // IMPORTANT: We keep this field so updates don't wipe existing image_url.
    image_url: (String(formData.get("image_url") ?? "").trim() || null) as string | null,

    is_active: String(formData.get("is_active") ?? "") === "on",

    carry_behavior: String(formData.get("carry_behavior") ?? "loose"),
    stackable: String(formData.get("stackable") ?? "") === "on",
    max_stack: formData.get("max_stack") ? Number(formData.get("max_stack")) : null,

    is_weaponizable: String(formData.get("is_weaponizable") ?? "") === "on",
    weapon_kind: (String(formData.get("weapon_kind") ?? "").trim() || null) as string | null,
    uses_attack_roll: String(formData.get("uses_attack_roll") ?? "on") === "on",
    attack_bonus_override: formData.get("attack_bonus_override") ? Number(formData.get("attack_bonus_override")) : null,

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

  // equip_slots: comma-separated
  const slotsRaw = String(formData.get("equip_slots") ?? "").trim();
  payload.equip_slots = slotsRaw ? slotsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;

  // tags: comma-separated
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  payload.tags = tagsRaw ? tagsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null;

  if (!payload.name || !payload.category) redirect("/admin/items/edit?err=missing_required");

  const { error: updateErr } = await supabase.from("items").update(payload).eq("id", itemId);
  if (updateErr) console.error("updateItemAction error:", updateErr.message);

  redirect("/admin/items/edit?saved=1");
}

/**
 * Uploads an image file to Supabase Storage and updates items.image_url
 * Bucket: item-images (public recommended OR use signed URLs)
 */
export async function uploadItemImageAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(itemId)) redirect("/admin/items/edit?err=bad_id");

  const file = formData.get("file");
  if (!(file instanceof File)) redirect("/admin/items/edit?err=no_file");

  // basic guards
  if (!file.type.startsWith("image/")) redirect("/admin/items/edit?err=not_image");
  if (file.size > 5 * 1024 * 1024) redirect("/admin/items/edit?err=file_too_large"); // 5MB

  const supabase = await createClient();

  // Use a stable folder per item
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `items/${itemId}/${Date.now()}_${safeName}`;

  // ✅ Upload ONCE (you had it duplicated)
  const { error: uploadErr } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadErr) {
    const msg = String((uploadErr as any)?.message ?? "upload_failed");
    console.error("uploadItemImageAction upload:", msg);
    redirect(`/admin/items/edit?err=${encodeURIComponent(msg)}`);
  }

  const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  const publicUrl = pub?.publicUrl || null;

  if (!publicUrl) redirect("/admin/items/edit?err=no_public_url");

  const { error: upErr } = await supabase.from("items").update({ image_url: publicUrl }).eq("id", itemId);

  if (upErr) {
    console.error("uploadItemImageAction update item error:", upErr.message);
    redirect("/admin/items/edit?err=db_update_failed");
  }

  redirect("/admin/items/edit?img=1");
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

  if (!effect_type || !effect_key || !mode) redirect("/admin/items/edit?err=bad_effect");

  if (["ability", "ac", "speed", "skill", "save"].includes(effect_type)) {
    if (value === null || !isFinite(value)) redirect("/admin/items/edit?err=value_required");
  }

  if (effect_type === "special") {
    if (!notes) redirect("/admin/items/edit?err=notes_required");
  }

  const supabase = await createClient();
  const { error: insertErr } = await supabase.from("item_effects").insert({
    item_id: itemId,
    effect_type,
    effect_key,
    mode,
    value: ["resistance", "immunity", "advantage", "special"].includes(effect_type) ? null : value,
    notes: effect_type === "special" ? notes : notes || null,
    sort_order,
  });

  if (insertErr) console.error("addItemEffectAction error:", insertErr.message);

  redirect("/admin/items/edit");
}

export async function deleteItemEffectAction(formData: FormData) {
  const effectId = String(formData.get("effect_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(effectId) || !isUuid(itemId)) redirect("/admin/items/edit?err=bad_effect_id");

  const supabase = await createClient();
  const { error: delErr } = await supabase.from("item_effects").delete().eq("id", effectId);
  if (delErr) console.error("deleteItemEffectAction error:", delErr.message);

  redirect("/admin/items/edit");
}

export async function deleteItemAction(formData: FormData) {
  const itemId = String(formData.get("item_id") ?? "");
  if (!isUuid(itemId)) redirect("/admin/items");

  const supabase = await createClient();
  const { error: delItemErr } = await supabase.from("items").delete().eq("id", itemId);
  if (delItemErr) console.error("deleteItemAction error:", delItemErr.message);

  const c = await cookies();
  c.set(COOKIE_KEY, "", { path: COOKIE_PATH, maxAge: 0 });

  redirect("/admin/items?deleted=1");
}
export async function itemSetImageAction(itemId: string) {
  if (!isUuid(itemId)) redirect("/admin/items/edit?err=bad_id");

  const supabase = await createClient();

  // public URL for `${itemId}/medium.webp`
  const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(`${itemId}/medium.webp`);
  const url = pub?.publicUrl ?? null;
  if (!url) redirect("/admin/items/edit?err=no_public_url");

  const { error: upErr } = await supabase.from("items").update({ image_url: url }).eq("id", itemId);
  if (upErr) {
    console.error("itemSetImageAction:", upErr.message);
    redirect("/admin/items/edit?err=db_update_failed");
  }
}

export async function itemClearImageAction(itemId: string) {
  if (!isUuid(itemId)) redirect("/admin/items/edit?err=bad_id");

  const supabase = await createClient();
  const { error: upErr } = await supabase.from("items").update({ image_url: null }).eq("id", itemId);
  if (upErr) {
    console.error("itemClearImageAction:", upErr.message);
    redirect("/admin/items/edit?err=db_update_failed");
  }
}
export async function itemSetImageAction(itemId: string) {
  if (!isUuid(itemId)) redirect("/admin/items/edit?err=bad_id");

  const supabase = await createClient();

  // Use medium.webp as the canonical item image URL
  const { data: pub } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(`${itemId}/medium.webp`);
  const url = pub?.publicUrl ?? null;
  if (!url) redirect("/admin/items/edit?err=no_public_url");

  const { error: upErr } = await supabase.from("items").update({ image_url: url }).eq("id", itemId);
  if (upErr) {
    console.error("itemSetImageAction:", upErr.message);
    redirect("/admin/items/edit?err=db_update_failed");
  }
}

export async function itemClearImageAction(itemId: string) {
  if (!isUuid(itemId)) redirect("/admin/items/edit?err=bad_id");

  const supabase = await createClient();
  const { error: upErr } = await supabase.from("items").update({ image_url: null }).eq("id", itemId);
  if (upErr) {
    console.error("itemClearImageAction:", upErr.message);
    redirect("/admin/items/edit?err=db_update_failed");
  }
}
