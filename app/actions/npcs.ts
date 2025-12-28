"use server";

import { createClient } from "@/utils/supabase/server";

function safeJsonParse(input: string | null) {
  if (!input) return {};
  try { return JSON.parse(input); } catch { return {}; }
}

export async function createNpcAction(formData: FormData): Promise<string> {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const npc_type = String(formData.get("npc_type") ?? "human");
  const default_role = String(formData.get("default_role") ?? "neutral");
  const description = String(formData.get("description") ?? "");

  const { data, error } = await supabase
    .from("npcs")
    .insert([{ name, npc_type, default_role, description }])
    .select("id")
    .single();
    if (error) throw new Error(error.message);
    if (!data?.id) throw new Error("Create NPC failed: no id returned.");
    return data.id as string;


  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateNpcAction(npcId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const npc_type = String(formData.get("npc_type") ?? "human");
  const default_role = String(formData.get("default_role") ?? "neutral");
  const description = String(formData.get("description") ?? "");
  const image_alt = String(formData.get("image_alt") ?? "") || null;
  const notes_storyteller = String(formData.get("notes_storyteller") ?? "") || null;

  const stat_block_json = String(formData.get("stat_block_json") ?? "");
  const stat_block = safeJsonParse(stat_block_json);

  const { error } = await supabase
    .from("npcs")
    .update({ name, npc_type, default_role, description, image_alt, notes_storyteller, stat_block })
    .eq("id", npcId);

  if (error) throw new Error(error.message);
}

export async function archiveNpcAction(npcId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("npcs").update({ is_archived: true }).eq("id", npcId);
  if (error) throw new Error(error.message);
}

export async function npcSetImageMetaAction(npcId: string, imageAlt: string | null) {
  const supabase = await createClient();
  const image_base_path = `${npcId}/`;

  const { error } = await supabase
    .from("npcs")
    .update({
      image_base_path,
      image_alt: imageAlt,
      image_updated_at: new Date().toISOString(),
    })
    .eq("id", npcId);

  if (error) throw new Error(error.message);
}

export async function npcClearImageMetaAction(npcId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("npcs")
    .update({
      image_base_path: null,
      image_alt: null,
      image_updated_at: new Date().toISOString(),
    })
    .eq("id", npcId);

  if (error) throw new Error(error.message);
}
