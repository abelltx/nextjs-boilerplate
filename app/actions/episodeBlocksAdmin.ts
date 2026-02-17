"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

const EPISODE_ASSETS_BUCKET = "episode-assets";

function requireUuid(id: string, label: string) {
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!ok) throw new Error(`Invalid ${label}`);
}

async function maybeUploadBlockImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  episodeId: string,
  fd: FormData
): Promise<string | null> {
  const fileValue = fd.get("image_file");
  if (!fileValue || typeof fileValue !== "object" || !("arrayBuffer" in fileValue)) return null;

  const file = fileValue as File;
  if (!file.size || file.size <= 0) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `episode-blocks/${episodeId}/${Date.now()}-${safeName}`;

  try {
    const { error: upErr } = await supabase.storage
      .from(EPISODE_ASSETS_BUCKET)
      .upload(path, file, {
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
    if (upErr) throw new Error(upErr.message);

    const { data: pub } = supabase.storage.from(EPISODE_ASSETS_BUCKET).getPublicUrl(path);
    return pub?.publicUrl ?? null;
  } catch (e) {
    console.error("maybeUploadBlockImage failed:", e);
    return null;
  }
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
  const uploadedImageUrl = await maybeUploadBlockImage(supabase, episodeId, fd);
  const finalImageUrl = uploadedImageUrl ?? image_url;
  const meta = parseMetaJson(fd.get("meta_json"));
  const sceneIdRaw = String(fd.get("scene_id") ?? "").trim();
  const sceneId = sceneIdRaw && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sceneIdRaw)
    ? sceneIdRaw
    : null;

  // Default append: max + 10. If scene_id is provided, insert at end of that scene.
  let nextOrder = 10;
  const { data: allRows, error: allErr } = await supabase
    .from("episode_blocks")
    .select("id,sort_order,block_type")
    .eq("episode_id", episodeId)
    .order("sort_order", { ascending: true });
  if (allErr) throw new Error(allErr.message);
  const all = (allRows ?? []) as Array<{ id: string; sort_order: number; block_type: string }>;

  if (!sceneId) {
    const last = all[all.length - 1];
    nextOrder = (last?.sort_order ?? 0) + 10;
  } else {
    const sceneIdx = all.findIndex((r) => r.id === sceneId && String(r.block_type).toLowerCase() === "scene");
    if (sceneIdx === -1) {
      const last = all[all.length - 1];
      nextOrder = (last?.sort_order ?? 0) + 10;
    } else {
      let endIdx = sceneIdx;
      for (let i = sceneIdx + 1; i < all.length; i++) {
        if (String(all[i].block_type).toLowerCase() === "scene") break;
        endIdx = i;
      }
      const prevOrder = all[endIdx]?.sort_order ?? all[sceneIdx].sort_order;
      const nextScene = all.slice(endIdx + 1).find((r) => String(r.block_type).toLowerCase() === "scene") ?? null;
      if (!nextScene) {
        nextOrder = prevOrder + 10;
      } else {
        const gap = Number(nextScene.sort_order) - Number(prevOrder);
        if (gap >= 2) {
          nextOrder = prevOrder + Math.floor(gap / 2);
        } else {
          // No room: shift everything from nextScene onward by +10.
          const toShift = all.filter((r) => Number(r.sort_order) >= Number(nextScene.sort_order));
          for (const r of toShift) {
            const { error: upErr } = await supabase
              .from("episode_blocks")
              .update({ sort_order: Number(r.sort_order) + 10 })
              .eq("id", r.id);
            if (upErr) throw new Error(upErr.message);
          }
          nextOrder = prevOrder + 10;
        }
      }
    }
  }

  const { error } = await supabase.from("episode_blocks").insert({
    episode_id: episodeId,
    sort_order: nextOrder,
    block_type,
    audience,
    mode,
    title,
    body,
    image_url: finalImageUrl,
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
  const uploadedImageUrl = await maybeUploadBlockImage(supabase, episodeId, fd);
  if (uploadedImageUrl) {
    patch.image_url = uploadedImageUrl;
  }

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
