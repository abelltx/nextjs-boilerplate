import { createClient } from "@/utils/supabase/server";

export async function listActions(opts?: { q?: string; includeArchived?: boolean }) {
  const supabase = await createClient();
  const q = (opts?.q ?? "").trim();
  const includeArchived = !!opts?.includeArchived;

  let query = supabase
    .from("actions")
    .select("id,name,activation,tags,requirements,effect,description,notes_storyteller,is_archived")
    .order("name", { ascending: true });

  if (!includeArchived) query = query.eq("is_archived", false);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getNpcActionIds(npcId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("npc_action_links")
    .select("action_id")
    .eq("npc_id", npcId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.action_id as string);
}

/**
 * Uses your view so it returns effective actions for display.
 */
export async function getNpcEffectiveActions(npcId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_npc_effective_actions")
    .select("*")
    .eq("npc_id", npcId);

  if (error) throw new Error(error.message);
  return data ?? [];
}
