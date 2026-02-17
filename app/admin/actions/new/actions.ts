"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "action_edit_id";

export async function createActionAction(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const rules_text = String(formData.get("rules_text") ?? "").trim() || null;
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : null;
  const is_active = formData.get("is_active") === "on";
  const uses_attack_roll = formData.get("uses_attack_roll") === "on";
  const attack_bonus_overrideRaw = String(formData.get("attack_bonus_override") ?? "").trim();
  const attack_bonus_override = attack_bonus_overrideRaw === "" ? null : Number(attack_bonus_overrideRaw);
  const range_normalRaw = String(formData.get("range_normal") ?? "").trim();
  const range_normal = range_normalRaw === "" ? null : Number(range_normalRaw);
  const range_maxRaw = String(formData.get("range_max") ?? "").trim();
  const range_max = range_maxRaw === "" ? null : Number(range_maxRaw);
  const damage_dice = String(formData.get("damage_dice") ?? "").trim() || null;
  const damage_bonusRaw = String(formData.get("damage_bonus") ?? "").trim();
  const damage_bonus = damage_bonusRaw === "" ? null : Number(damage_bonusRaw);
  const damage_type = String(formData.get("damage_type") ?? "").trim() || null;
  const save_ability = String(formData.get("save_ability") ?? "").trim() || null;
  const save_dc_overrideRaw = String(formData.get("save_dc_override") ?? "").trim();
  const save_dc_override = save_dc_overrideRaw === "" ? null : Number(save_dc_overrideRaw);
  const on_fail = String(formData.get("on_fail") ?? "").trim() || null;
  const on_success = String(formData.get("on_success") ?? "").trim() || null;

  if (!name) redirect("/admin/actions/new?err=missing_name");
  if (!["melee", "ranged", "other"].includes(type)) redirect("/admin/actions/new?err=bad_type");

  const { data, error } = await supabase
    .from("actions")
    .insert({
      name,
      type,
      summary,
      rules_text,
      tags,
      is_active,
      uses_attack_roll,
      attack_bonus_override,
      range_normal,
      range_max,
      damage_dice,
      damage_bonus,
      damage_type,
      save_ability,
      save_dc_override,
      on_fail,
      on_success,
    })
    .select("id")
    .maybeSingle();

  if (error) redirect(`/admin/actions/new?err=${encodeURIComponent(error.message)}`);
  if (!data?.id) redirect(`/admin/actions/new?err=insert_failed`);

  // Optional: jump straight to edit by setting cookie (server action OK)
  // Next 16.0.10 types: cookies() is async -> await it before .set()
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_KEY, data.id, {
    path: "/admin/actions/edit",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 2, // 2 hours
  });

  redirect("/admin/actions/edit");
}
