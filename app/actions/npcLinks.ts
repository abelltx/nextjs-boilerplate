"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

function uniq(xs: string[]) {
  return Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
}

export async function setNpcTraitIdsAction(npcId: string, traitIds: string[]) {
  const supabase = await createClient();
  const ids = uniq(traitIds);

  const { error: delErr } = await supabase.from("npc_trait_links").delete().eq("npc_id", npcId);
  if (delErr) throw new Error(delErr.message);

  if (ids.length) {
    const rows = ids.map((trait_id) => ({ npc_id: npcId, trait_id }));
    const { error: insErr } = await supabase.from("npc_trait_links").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath("/admin/designer/npcs");
  revalidatePath(`/admin/designer/npcs/edit?id=${npcId}`);
}

export async function setNpcActionIdsAction(npcId: string, actionIds: string[]) {
  const supabase = await createClient();
  const ids = uniq(actionIds);

  const { error: delErr } = await supabase.from("npc_action_links").delete().eq("npc_id", npcId);
  if (delErr) throw new Error(delErr.message);

  if (ids.length) {
    const rows = ids.map((action_id) => ({ npc_id: npcId, action_id }));
    const { error: insErr } = await supabase.from("npc_action_links").insert(rows);
    if (insErr) throw new Error(insErr.message);
  }

  revalidatePath("/admin/designer/npcs");
  revalidatePath(`/admin/designer/npcs/edit?id=${npcId}`);
}
