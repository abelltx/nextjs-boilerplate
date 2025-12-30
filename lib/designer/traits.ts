import { createClient } from "@/utils/supabase/server";

export async function listTraits(opts?: { q?: string; includeArchived?: boolean }) {
  const supabase = await createClient();
  const q = (opts?.q ?? "").trim();
  const includeArchived = !!opts?.includeArchived;

  let query = supabase
    .from("traits")
    .select("id,name,trait_type,description,notes_storyteller,is_archived")
    .order("name", { ascending: true });

  if (!includeArchived) query = query.eq("is_archived", false);
  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getNpcTraitIds(npcId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("npc_trait_links")
    .select("trait_id")
    .eq("npc_id", npcId);

  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.trait_id as string);
}

/**
 * Uses your view so it returns the "effective passives" for display.
 * If you want raw selected traits instead, tell me and I’ll add getNpcTraitsRaw().
 */
export async function getNpcPassives(npcId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_npc_passives")
    .select("*")
    .eq("npc_id", npcId);

  if (error) throw new Error(error.message);
  return data ?? [];
}
