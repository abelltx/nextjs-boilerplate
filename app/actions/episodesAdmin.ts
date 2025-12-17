"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

const EPISODE_ASSETS_BUCKET = "episode-assets";

type EpisodeUpsert = {
  title: string;
  episode_code?: string | null;
  story_text: string;
  default_duration_seconds: number;
  summary?: string | null;
  map_image_url?: string | null;
};

async function requireAdmin() {
  const supabase = await createClient();

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) redirect("/login");

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", authData.user.id)
    .single();

  if (pErr) throw new Error(pErr.message);
  if (!profile?.is_admin) redirect("/storyteller/sessions");

  return supabase;
}

function normalizeEpisodeCode(input: unknown): string | null {
  const s = String(input ?? "").trim().toUpperCase();
  return s ? s : null;
}

function minutesToSeconds(minsRaw: unknown): number {
  const mins = Number(minsRaw ?? 0);
  if (!Number.isFinite(mins) || mins < 0) return 0;
  return Math.round(mins * 60);
}

async function maybeUploadMap(
  supabase: Awaited<ReturnType<typeof requireAdmin>>,
  episodeId: string,
  fd: FormData
): Promise<string | null> {
  const mapFile = fd.get("map_file");
  if (!mapFile || typeof mapFile !== "object" || !("arrayBuffer" in mapFile)) return null;

  const file = mapFile as File;

  // Some browsers send a 0-byte File when nothing was chosen
  if (!file.size || file.size <= 0) return null;

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `episode-maps/${episodeId}/${Date.now()}-${safeName}`;

  const { error: upErr } = await supabase.storage
    .from(EPISODE_ASSETS_BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (upErr) throw new Error(upErr.message);

  const { data: pub } = supabase.storage.from(EPISODE_ASSETS_BUCKET).getPublicUrl(path);
  return pub?.publicUrl ?? null;
}

export async function createEpisodeAction(fd: FormData) {
  const supabase = await requireAdmin();

  const title = String(fd.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");

  const episode_code = normalizeEpisodeCode(fd.get("episode_code"));
  const story_text = String(fd.get("story_text") ?? "");
  const summary = String(fd.get("summary") ?? "").trim() || null;

  // Use minutes input if present, otherwise default to 45 minutes
  const default_duration_seconds = minutesToSeconds(fd.get("default_duration_minutes") ?? 45);

  const payload: EpisodeUpsert = {
    title,
    episode_code,
    story_text,
    default_duration_seconds,
    summary,
  };

  const { data, error } = await supabase.from("episodes").insert(payload).select("id").single();
  if (error) throw new Error(error.message);

  // Optional map upload at creation time
  const mapUrl = await maybeUploadMap(supabase, data.id, fd);
  if (mapUrl) {
    const { error: upErr } = await supabase.from("episodes").update({ map_image_url: mapUrl }).eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
  }

  revalidatePath("/admin/episodes");
  redirect(`/admin/episodes/${data.id}`);
}

export async function updateEpisodeAction(episodeId: string, fd: FormData) {
  const supabase = await requireAdmin();

  const title = String(fd.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required");

  const episode_code = normalizeEpisodeCode(fd.get("episode_code"));
  const summary = String(fd.get("summary") ?? "").trim() || null;

  // minutes -> seconds (DB column stays default_duration_seconds)
  const default_duration_seconds = minutesToSeconds(fd.get("default_duration_minutes"));

  // Announcement board
  const story_text = String(fd.get("story_text") ?? "");

  // Optional map file upload
  const map_image_url = await maybeUploadMap(supabase, episodeId, fd);

  const payload: any = {
    title,
    episode_code,
    summary,
    story_text,
    default_duration_seconds,
  };

  // Only overwrite map_image_url if a new file uploaded
  if (map_image_url) payload.map_image_url = map_image_url;

  const { error } = await supabase.from("episodes").update(payload).eq("id", episodeId);
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/episodes/${episodeId}`);
  revalidatePath("/admin/episodes");
}

export async function deleteEpisodeAction(episodeId: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase.from("episodes").delete().eq("id", episodeId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/episodes");
}
