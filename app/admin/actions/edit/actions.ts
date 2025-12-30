"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "action_edit_id";

/** Very small UUID guard (same spirit as Traits). */
function isUuid(v: unknown) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * List page POST handler:
 * - validates UUID
 * - sets cookie scoped to /admin/actions/edit
 * - redirects to /admin/actions/edit
 */
export async function openActionEditAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/actions?err=invalid_id");

  cookies().set(COOKIE_KEY, id, {
    path: "/admin/actions/edit",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 2, // 2 hours
  });

  redirect("/admin/actions/edit");
}

export async function updateActionAction(formData: FormData) {
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/actions?err=invalid_id");

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const rules_text = String(formData.get("rules_text") ?? "").trim() || null;

  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags =
    tagsRaw.length === 0
      ? null
      : tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);

  const is_active = formData.get("is_active") === "on";

  // Optional fields (keep permissive)
  const uses_attack_roll = formData.get("uses_attack_roll") === "on";
  const attack_bonus_overrideRaw = String(formData.get("attack_bonus_override") ?? "").trim();
  const attack_bonus_override = attack_bonus_overrideRaw === "" ? null : Number(attack_bonus_overrideRaw);

  const damage_dice = String(formData.get("damage_dice") ?? "").trim() || null;
  const damage_bonusRaw = String(formData.get("damage_bonus") ?? "").trim();
  const damage_bonus = damage_bonusRaw === "" ? null : Number(damage_bonusRaw);
  const damage_type = String(formData.get("damage_type") ?? "").trim() || null;

  const save_ability = String(formData.get("save_ability") ?? "").trim() || null;
  const save_dc_overrideRaw = String(formData.get("save_dc_override") ?? "").trim();
  const save_dc_override = save_dc_overrideRaw === "" ? null : Number(save_dc_overrideRaw);
  const on_fail = String(formData.get("on_fail") ?? "").trim() || null;
  const on_success = String(formData.get("on_success") ?? "").trim() || null;

  if (!name) redirect(`/admin/actions/edit?err=missing_name`);
  if (!["melee", "ranged", "other"].includes(type)) redirect(`/admin/actions/edit?err=bad_type`);

  // Basic numeric validation
  if (attack_bonus_override !== null && !Number.isFinite(attack_bonus_override)) {
    redirect(`/admin/actions/edit?err=bad_attack_bonus_override`);
  }
  if (damage_bonus !== null && !Number.isFinite(damage_bonus)) {
    redirect(`/admin/actions/edit?err=bad_damage_bonus`);
  }
  if (save_dc_override !== null && !Number.isFinite(save_dc_override)) {
    redirect(`/admin/actions/edit?err=bad_save_dc_override`);
  }

  const { error } = await supabase
    .from("actions")
    .update({
      name,
      type,
      summary,
      rules_text,
      tags,
      is_active,

      uses_attack_roll,
      attack_bonus_override,

      damage_dice,
      damage_bonus,
      damage_type,

      save_ability,
      save_dc_override,
      on_fail,
      on_success,
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/actions/edit?err=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/actions?saved=1");
}
