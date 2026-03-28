"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const COOKIE_KEY = "action_edit_id";

/** Small UUID guard */
function isUuid(v: unknown) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function mergeActionTags(tagsRaw: string) {
  const tags =
    tagsRaw.length === 0
      ? []
      : tagsRaw
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
  return Array.from(new Set(tags));
}

function numberOrNull(raw: FormDataEntryValue | null) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function buildActionConfig(formData: FormData) {
  const rawJson = String(formData.get("action_config_json") ?? "").trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      redirect("/admin/actions/edit?err=bad_action_config_json");
    }
  }

  const behavior = String(formData.get("action_behavior") ?? "").trim().toLowerCase();
  if (behavior !== "targeted_support") return null;

  const targetScope = String(formData.get("support_target_scope") ?? "ally").trim().toLowerCase() || "ally";
  const choiceOwner = String(formData.get("support_choice_owner") ?? "target").trim().toLowerCase() || "target";
  const grantAttackAdvantage = formData.get("support_grant_attack_roll_advantage") === "on";
  const damageBonus = numberOrNull(formData.get("support_damage_bonus"));
  const options: Array<Record<string, unknown>> = [];

  if (grantAttackAdvantage) {
    options.push({
      id: "attack_roll_advantage",
      label: "Advantage on next attack roll",
      trigger: "next_attack_roll",
      grant_advantage: true,
      consume_on_use: true,
    });
  }
  if (damageBonus !== null && damageBonus !== 0) {
    options.push({
      id: "damage_bonus",
      label: `${damageBonus > 0 ? "+" : ""}${damageBonus} damage on next hit`,
      trigger: "next_damage_roll",
      damage_bonus: damageBonus,
      consume_on_use: true,
    });
  }
  if (!options.length) return null;

  return {
    kind: "targeted_support",
    target_scope: targetScope,
    choice_owner: choiceOwner,
    options,
  };
}

/**
 * List page POST handler:
 * - validates UUID
 * - sets cookie scoped to /admin/actions/edit
 * - redirects to /admin/actions/edit
 *
 * NOTE: In your Next 16.0.10 types, cookies() is async (returns a Promise),
 * so we MUST await it before calling .set().
 */
export async function openActionEditAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/actions?err=invalid_id");

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_KEY, id, {
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
  const tags = mergeActionTags(tagsRaw);
  const action_config = buildActionConfig(formData);

  const is_active = formData.get("is_active") === "on";

  // Optional fields (keep permissive)
  const uses_attack_roll = formData.get("uses_attack_roll") === "on";

  const attack_bonus_overrideRaw = String(
    formData.get("attack_bonus_override") ?? ""
  ).trim();
  const attack_bonus_override =
    attack_bonus_overrideRaw === "" ? null : Number(attack_bonus_overrideRaw);

  const damage_dice = String(formData.get("damage_dice") ?? "").trim() || null;
  const range_normalRaw = String(formData.get("range_normal") ?? "").trim();
  const range_normal = range_normalRaw === "" ? null : Number(range_normalRaw);
  const range_maxRaw = String(formData.get("range_max") ?? "").trim();
  const range_max = range_maxRaw === "" ? null : Number(range_maxRaw);

  const damage_bonusRaw = String(formData.get("damage_bonus") ?? "").trim();
  const damage_bonus = damage_bonusRaw === "" ? null : Number(damage_bonusRaw);

  const damage_type = String(formData.get("damage_type") ?? "").trim() || null;

  const save_ability = String(formData.get("save_ability") ?? "").trim() || null;

  const save_dc_overrideRaw = String(
    formData.get("save_dc_override") ?? ""
  ).trim();
  const save_dc_override =
    save_dc_overrideRaw === "" ? null : Number(save_dc_overrideRaw);

  const on_fail = String(formData.get("on_fail") ?? "").trim() || null;
  const on_success = String(formData.get("on_success") ?? "").trim() || null;

  // Basic validation
  if (!name) redirect(`/admin/actions/edit?err=missing_name`);
  if (!["melee", "ranged", "other"].includes(type))
    redirect(`/admin/actions/edit?err=bad_type`);

  if (attack_bonus_override !== null && !Number.isFinite(attack_bonus_override)) {
    redirect(`/admin/actions/edit?err=bad_attack_bonus_override`);
  }
  if (damage_bonus !== null && !Number.isFinite(damage_bonus)) {
    redirect(`/admin/actions/edit?err=bad_damage_bonus`);
  }
  if (range_normal !== null && !Number.isFinite(range_normal)) {
    redirect(`/admin/actions/edit?err=bad_range_normal`);
  }
  if (range_max !== null && !Number.isFinite(range_max)) {
    redirect(`/admin/actions/edit?err=bad_range_max`);
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
      action_config,
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
    .eq("id", id);

  if (error) {
    redirect(`/admin/actions/edit?err=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/actions?saved=1");
}

export async function quickUpdateActionDamageAction(formData: FormData) {
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/actions?err=invalid_id");

  const damage_dice = String(formData.get("damage_dice") ?? "").trim() || null;
  const damage_type = String(formData.get("damage_type") ?? "").trim() || null;
  const damage_bonusRaw = String(formData.get("damage_bonus") ?? "").trim();
  const damage_bonus = damage_bonusRaw === "" ? null : Number(damage_bonusRaw);

  if (damage_bonus !== null && !Number.isFinite(damage_bonus)) {
    redirect("/admin/actions?err=bad_damage_bonus");
  }

  const { error } = await supabase
    .from("actions")
    .update({
      damage_dice,
      damage_type,
      damage_bonus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/admin/actions?err=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/actions?saved=1");
}
export async function deleteActionAction(formData: FormData) {
  const supabase = await createClient();

  const id = String(formData.get("id") ?? "").trim();
  if (!isUuid(id)) redirect("/admin/actions?err=invalid_id");

  const { error } = await supabase.from("actions").delete().eq("id", id);

  if (error) {
    redirect(`/admin/actions/edit?err=${encodeURIComponent(error.message)}`);
  }

  redirect("/admin/actions?deleted=1");
}
