"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

function requireUuid(id: string, label: string) {
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!ok) throw new Error(`Invalid ${label}`);
}

function parseMetaJson(raw: FormDataEntryValue | null): any {
  if (!raw) return {};
  const s = String(raw).trim();
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    // Don’t brick the whole save if JSON is malformed.
    // Store an error wrapper so you can see what went wrong.
    return { __meta_error: "Invalid JSON", __raw: s };
  }
}

export async function addEpisodeBlockAction(episodeId: string, fd: FormData) {
  requireUuid(episodeId, "episodeId");
  const supabase = await createClient();

  const block_type = String(fd.get("block_type") ?? "scene");
  const audience = String(fd.get("audience") ?? "both");
  const mode = String(fd.get("mode") ?? "display");
  const title = String(fd.get("title") ?? "").trim() || null;
  const body = String(fd.get("body") ?? "").trim() || null;
  const image_url = String(fd.get("image_url") ?? "").trim() || null;
  const meta = parseMetaJson(fd.get("meta_json"));

  // Next sort_order = max + 10 (gives room for later inserts without reshuffling)
  const { data: last } = await supabase
    .from("episode_blocks")
    .select("sort_order")
    .eq("episode_id", episodeId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (last?.sort_order ?? 0) + 10;

  const { error } = await supabase.from("episode_blocks").insert({
    episode_id: episodeId,
    sort_order: nextOrder,
    block_type,
    audience,
    mode,
    title,
    body,
    image_url,
    meta,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/episodes/${episodeId}`);
}

export async function updateEpisodeBlockAction(blockId: string, episodeId: string, fd: FormData) {
  requireUuid(blockId, "blockId");
  requireUuid(episodeId, "episodeId");
  const supabase = await createClient();

  const patch: any = {
    block_type: String(fd.get("block_type") ?? "scene"),
    audience: String(fd.get("audience") ?? "both"),
    mode: String(fd.get("mode") ?? "display"),
    title: String(fd.get("title") ?? "").trim() || null,
    body: String(fd.get("body") ?? "").trim() || null,
    image_url: String(fd.get("image_url") ?? "").trim() || null,
  };

  // Only update meta if the field is present (prevents wiping meta accidentally)
  if (fd.has("meta_json")) {
    patch.meta = parseMetaJson(fd.get("meta_json"));
  }

  const { error } = await supabase.from("episode_blocks").update(patch).eq("id", blockId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/episodes/${episodeId}`);
}

export async function deleteEpisodeBlockAction(blockId: string, episodeId: string) {
  requireUuid(blockId, "blockId");
  requireUuid(episodeId, "episodeId");
  const supabase = await createClient();

  const { error } = await supabase.from("episode_blocks").delete().eq("id", blockId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/episodes/${episodeId}`);
}

export async function moveEpisodeBlockAction(blockId: string, episodeId: string, direction: "up" | "down") {
  requireUuid(blockId, "blockId");
  requireUuid(episodeId, "episodeId");
  const supabase = await createClient();

  const { data: current, error: curErr } = await supabase
    .from("episode_blocks")
    .select("id, sort_order")
    .eq("id", blockId)
    .single();

  if (curErr) throw new Error(curErr.message);

  const order = current.sort_order;

  // Find neighbor block
  const neighborQuery = supabase
    .from("episode_blocks")
    .select("id, sort_order")
    .eq("episode_id", episodeId);

  const { data: neighbor, error: nErr } =
    direction === "up"
      ? await neighborQuery.lt("sort_order", order).order("sort_order", { ascending: false }).limit(1).maybeSingle()
      : await neighborQuery.gt("sort_order", order).order("sort_order", { ascending: true }).limit(1).maybeSingle();

  if (nErr) throw new Error(nErr.message);
  if (!neighbor) {
    revalidatePath(`/admin/episodes/${episodeId}`);
    return;
  }

  // Swap sort_order
  const { error: e1 } = await supabase
    .from("episode_blocks")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", current.id);
  if (e1) throw new Error(e1.message);

  const { error: e2 } = await supabase
    .from("episode_blocks")
    .update({ sort_order: order })
    .eq("id", neighbor.id);
  if (e2) throw new Error(e2.message);

  revalidatePath(`/admin/episodes/${episodeId}`);
}
