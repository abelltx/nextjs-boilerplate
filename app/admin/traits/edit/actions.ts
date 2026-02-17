"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

// Used by the LIST page (POST) to open the editor
export async function openTraitEditAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/traits");

  const c = await cookies();
  c.set("trait_edit_id", id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 60 * 5,
  });

  redirect("/admin/traits/edit");
}

// Used by the EDIT page (Save button)
export async function updateTraitAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/traits");

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();

  const isActiveRaw = String(formData.get("is_active") ?? "off");
  const is_active = isActiveRaw === "on" || isActiveRaw === "true";

  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags =
    tagsRaw.length === 0
      ? null
      : tagsRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  if (!name) {
    redirect(`/admin/traits/edit?err=${encodeURIComponent("Name is required")}`);
  }

  // Optional: enforce known types (adjust if you add more)
  const allowedTypes = new Set([
    "nature",
    "training",
    "affliction",
    "calling",
    "office",
  ]);
  const safeType = allowedTypes.has(type) ? type : "nature";

  const supabase = await createClient();
  const { error } = await supabase
    .from("traits")
    .update({
      name,
      type: safeType,
      summary: summary.length ? summary : null,
      tags,
      is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    // If RLS blocks update, you'll see it here
    redirect(
      `/admin/traits/edit?err=${encodeURIComponent(error.message)}`
    );
  }

  // After save, bounce back to list
  redirect("/admin/traits?saved=1");
}

export async function addTraitEffectAction(formData: FormData) {
  const traitId = String(formData.get("trait_id") ?? "").trim();
  if (!isUuid(traitId)) redirect("/admin/traits/edit?err=bad_trait_id");

  const effect_type = String(formData.get("effect_type") ?? "").trim();
  const effect_key = String(formData.get("effect_key") ?? "").trim();
  const mode = String(formData.get("mode") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const sort_order = formData.get("sort_order") ? Number(formData.get("sort_order")) : 0;

  const valueRaw = formData.get("value");
  const value = valueRaw === null || valueRaw === "" ? null : Number(valueRaw);

  if (!effect_type || !effect_key || !mode) redirect("/admin/traits/edit?err=bad_effect");
  if (["ability", "ac", "speed", "skill", "save"].includes(effect_type)) {
    if (value === null || !isFinite(value)) redirect("/admin/traits/edit?err=value_required");
  }
  if (effect_type === "special" && !notes) redirect("/admin/traits/edit?err=notes_required");

  const supabase = await createClient();
  const { error } = await supabase.from("trait_effects").insert({
    trait_id: traitId,
    effect_type,
    effect_key,
    mode,
    value: ["resistance", "immunity", "advantage", "special"].includes(effect_type) ? null : value,
    notes: effect_type === "special" ? notes : (notes || null),
    sort_order,
  });
  if (error) redirect(`/admin/traits/edit?err=${encodeURIComponent(error.message)}`);
  redirect("/admin/traits/edit");
}

export async function deleteTraitEffectAction(formData: FormData) {
  const effectId = String(formData.get("effect_id") ?? "").trim();
  if (!isUuid(effectId)) redirect("/admin/traits/edit?err=bad_effect_id");
  const supabase = await createClient();
  const { error } = await supabase.from("trait_effects").delete().eq("id", effectId);
  if (error) redirect(`/admin/traits/edit?err=${encodeURIComponent(error.message)}`);
  redirect("/admin/traits/edit");
}
