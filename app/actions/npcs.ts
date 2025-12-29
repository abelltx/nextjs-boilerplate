"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

function errMsg(err: unknown, fallback = "Unknown error") {
  if (!err) return fallback;
  if (typeof err === "string") return err;
  if (typeof err === "object" && err && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  return fallback;
}

function requireUuidLike(id: string, label = "id") {
  const v = String(id ?? "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
    throw new Error(`Invalid ${label}.`);
  }
  return v;
}

function parseStatBlockJson(formData: FormData) {
  const raw = String(formData.get("stat_block_json") ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    // Ensure object-y payloads only (avoid arrays / primitives)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    throw new Error("Stat Block JSON is invalid. Fix it before saving.");
  }
}

export async function createNpcAction(formData: FormData): Promise<string> {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const npc_type = String(formData.get("npc_type") ?? "human");
  const default_role = String(formData.get("default_role") ?? "neutral");
  const description = String(formData.get("description") ?? "");

  const { data, error } = await supabase
    .from("npcs")
    .insert([{ name, npc_type, default_role, description }])
    .select("id")
    .single();

  if (error) throw new Error(errMsg(error));
  if (!data?.id) throw new Error("Create NPC failed: no id returned.");

  return data.id as string;
}

export async function updateNpcAction(npcId: string, formData: FormData) {
  const supabase = await createClient();
  const id = requireUuidLike(npcId, "NPC id");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Name is required.");

  const npc_type = String(formData.get("npc_type") ?? "human");
  const default_role = String(formData.get("default_role") ?? "neutral");
  const description = String(formData.get("description") ?? "");
  const image_alt = (String(formData.get("image_alt") ?? "").trim() || null) as string | null;
  const notes_storyteller = (String(formData.get("notes_storyteller") ?? "").trim() || null) as string | null;

  // Stat block is posted via hidden input "stat_block_json"
  // SAFETY: parse and store AS-IS (do not coerce or strip fields).
  const raw = formData.get("stat_block_json");
  let stat_block: any | undefined = undefined;

  if (typeof raw === "string" && raw.trim()) {
    try {
      stat_block = JSON.parse(raw);
    } catch {
      throw new Error("Stat block JSON is invalid.");
    }
  }

  // Build update patch. Only set stat_block if provided so we never wipe it.
  const patch: Record<string, any> = {
    name,
    npc_type,
    default_role,
    description,
    image_alt,
    notes_storyteller,
  };

  if (stat_block !== undefined) patch.stat_block = stat_block;

  const { error } = await supabase.from("npcs").update(patch).eq("id", id);

  if (error) throw new Error(errMsg(error));
}


export async function archiveNpcAction(npcId: string) {
  const supabase = await createClient();
  const id = requireUuidLike(npcId, "NPC id");

  const { error } = await supabase.from("npcs").update({ is_archived: true }).eq("id", id);
  if (error) throw new Error(errMsg(error));

  // UX: go back to list after archive
  redirect("/admin/designer/npcs");
}

export async function deleteNpcAction(npcId: string) {
  const supabase = await createClient();
  const id = requireUuidLike(npcId, "NPC id");

  const { error } = await supabase.from("npcs").delete().eq("id", id);

  if (error) {
    console.error("deleteNpcAction error:", error.message);
    throw new Error("Failed to delete NPC.");
  }

  redirect("/admin/designer/npcs");
}

/**
 * Image metadata helpers. Actual Storage upload happens client-side.
 */
export async function npcSetImageMetaAction(npcId: string, imageAlt: string | null) {
  const supabase = await createClient();
  const id = requireUuidLike(npcId, "NPC id");

  const image_base_path = `${id}/`;

  const { error } = await supabase
    .from("npcs")
    .update({
      image_base_path,
      image_alt: imageAlt,
      image_updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(errMsg(error));
}

export async function npcClearImageMetaAction(npcId: string) {
  const supabase = await createClient();
  const id = requireUuidLike(npcId, "NPC id");

  const { error } = await supabase
    .from("npcs")
    .update({
      image_base_path: null,
      image_alt: null,
      image_updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(errMsg(error));
}
