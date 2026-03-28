"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

function numberOrNull(raw: FormDataEntryValue | null) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function mergeActionTags(tagsRaw: string) {
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  return Array.from(new Set(tags));
}

function buildActionConfig(formData: FormData) {
  const rawJson = String(formData.get("action_config_json") ?? "").trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      redirect("/admin/actions/new?err=bad_action_config_json");
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

export async function createActionAction(formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const type = String(formData.get("type") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim() || null;
  const rules_text = String(formData.get("rules_text") ?? "").trim() || null;
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const tags = mergeActionTags(tagsRaw);
  const action_config = buildActionConfig(formData);
  const is_active = formData.get("is_active") === "on";
  const uses_attack_roll = formData.get("uses_attack_roll") === "on";
  const attack_bonus_override = numberOrNull(formData.get("attack_bonus_override"));
  const range_normal = numberOrNull(formData.get("range_normal"));
  const range_max = numberOrNull(formData.get("range_max"));
  const damage_dice = String(formData.get("damage_dice") ?? "").trim() || null;
  const damage_bonus = numberOrNull(formData.get("damage_bonus"));
  const damage_type = String(formData.get("damage_type") ?? "").trim() || null;
  const save_ability = String(formData.get("save_ability") ?? "").trim() || null;
  const save_dc_override = numberOrNull(formData.get("save_dc_override"));
  const on_fail = String(formData.get("on_fail") ?? "").trim() || null;
  const on_success = String(formData.get("on_success") ?? "").trim() || null;

  if (!name) redirect("/admin/actions/new?err=missing_name");
  if (!["melee", "ranged", "other"].includes(type)) redirect("/admin/actions/new?err=bad_type");

  const payload = {
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
  };

  let { data, error } = await supabase
    .from("actions")
    .insert(payload)
    .select("id")
    .maybeSingle();

  // Backward-compat fallback if combat columns are not deployed yet.
  if (error && String(error.message ?? "").toLowerCase().includes("column")) {
    const fallbackPayload = {
      name,
      type,
      summary,
      rules_text,
      tags,
      action_config,
      is_active,
    };
    const retry = await supabase.from("actions").insert(fallbackPayload).select("id").maybeSingle();
    data = retry.data as any;
    error = retry.error as any;
  }

  if (error) redirect(`/admin/actions/new?err=${encodeURIComponent(error.message)}`);
  if (!data?.id) redirect(`/admin/actions/new?err=insert_failed`);

  redirect(`/admin/actions/edit?id=${encodeURIComponent(data.id)}&saved=1`);
}
