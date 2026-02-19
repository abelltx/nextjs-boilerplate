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
  const nextTabs = parsed?.npc_tabs && typeof parsed.npc_tabs === "object" ? parsed.npc_tabs : {};
  const scopeIdRaw = String(formData.get("episode_scope_id") ?? "").trim();
  const scopeId = scopeIdRaw && isUuid(scopeIdRaw) ? scopeIdRaw : "";

  const supabase = createAdminClient() ?? (await createClient());
  const { data: current, error: readErr } = await supabase
    .from("npc_runtime_configs")
    .select("meta_json")
    .eq("npc_id", id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);

  const existingMeta =
    current?.meta_json && typeof current.meta_json === "object"
      ? (current.meta_json as Record<string, any>)
      : {};
  const mergedMeta: Record<string, any> = { ...existingMeta };
  if (scopeId) {
    const byEpisode =
      existingMeta.npc_tabs_by_episode && typeof existingMeta.npc_tabs_by_episode === "object"
        ? { ...(existingMeta.npc_tabs_by_episode as Record<string, any>) }
        : {};
    byEpisode[scopeId] = nextTabs;
    mergedMeta.npc_tabs_by_episode = byEpisode;
  } else {
    mergedMeta.npc_tabs = nextTabs;
  }

  const { error } = await supabase
    .from("npc_runtime_configs")
    .upsert({ npc_id: id, meta_json: mergedMeta }, { onConflict: "npc_id" });
  if (error) throw new Error(error.message);

  const suffix = scopeId ? `&episode_scope=${encodeURIComponent(scopeId)}` : "";
  revalidatePath(`/admin/designer/npcs/edit?id=${id}${suffix}`);
}
