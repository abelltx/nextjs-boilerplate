"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
}

export async function saveNpcRuntimeConfigAction(npcId: string, formData: FormData) {
  const id = String(npcId ?? "").trim();
  if (!isUuid(id)) throw new Error("Invalid npcId");

  const raw = String(formData.get("meta_json") ?? "").trim();
  let parsed: any = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Invalid runtime JSON.");
    }
  }
  const meta = parsed?.npc_tabs ? { npc_tabs: parsed.npc_tabs } : { npc_tabs: {} };

  const supabase = createAdminClient() ?? (await createClient());
  const { error } = await supabase
    .from("npc_runtime_configs")
    .upsert({ npc_id: id, meta_json: meta }, { onConflict: "npc_id" });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/designer/npcs/edit?id=${id}`);
}
