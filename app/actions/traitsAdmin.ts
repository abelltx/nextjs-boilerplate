"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export type TraitType = "calling" | "affliction" | "training" | "nature" | "office";

function s(formData: FormData, key: string) {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function b(formData: FormData, key: string) {
  const v = formData.get(key);
  return v === "on" || v === "true";
}

function tags(formData: FormData, key: string) {
  const raw = s(formData, key);
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 25);
}

export async function createTraitAction(formData: FormData) {
  const supabase = await createClient();

  const payload = {
    name: s(formData, "name"),
    type: (s(formData, "type") as TraitType) || "nature",
    summary: s(formData, "summary") || null,
    trigger: s(formData, "trigger") || null,
    mechanical_effect: s(formData, "mechanical_effect") || null,
    narrative_signal: s(formData, "narrative_signal") || null,
    growth_condition: s(formData, "growth_condition") || null,
    tags: tags(formData, "tags"),
    is_active: b(formData, "is_active"),
  };

  if (!payload.name) return;

  const { data, error } = await supabase
    .from("traits")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    console.error("createTraitAction:", error?.message);
    return;
  }

  redirect(`/admin/traits/${data.id}`);
}

export async function updateTraitAction(formData: FormData) {
  const supabase = await createClient();
  const id = s(formData, "id");
  if (!id) return;

  const payload = {
    name: s(formData, "name"),
    type: (s(formData, "type") as TraitType) || "nature",
    summary: s(formData, "summary") || null,
    trigger: s(formData, "trigger") || null,
    mechanical_effect: s(formData, "mechanical_effect") || null,
    narrative_signal: s(formData, "narrative_signal") || null,
    growth_condition: s(formData, "growth_condition") || null,
    tags: tags(formData, "tags"),
    is_active: b(formData, "is_active"),
  };

  if (!payload.name) return;

  const { error } = await supabase.from("traits").update(payload).eq("id", id);
  if (error) console.error("updateTraitAction:", error.message);

  redirect(`/admin/traits/${id}`);
}

export async function deleteTraitAction(formData: FormData) {
  const supabase = await createClient();
  const id = s(formData, "id");
  if (!id) return;

  const { error } = await supabase.from("traits").delete().eq("id", id);
  if (error) console.error("deleteTraitAction:", error.message);

  redirect("/admin/traits");
}
