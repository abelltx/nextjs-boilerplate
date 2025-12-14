"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

type EpisodeUpsert = {
  title: string;
  episode_code?: string | null;
  story_text: string;
  default_duration_seconds: number;
  default_encounter_total: number;
  summary?: string | null;
  map_image_url?: string | null;
  npc_image_url?: string | null;
  tags?: string[] | null;
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

function parseTags(tagsRaw: FormDataEntryValue | null): string[] | null {
  if (!tagsRaw) return null;
  const s = String(tagsRaw).trim();
  if (!s) return null;
  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
function normalizeEpisodeCode(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  return s.toUpperCase();
}

export async function createEpisodeAction(fd: FormData) {
  const supabase = await requireAdmin();

  const payload: EpisodeUpsert = {
    title: String(fd.get("title") ?? "").trim(),
    episode_code: normalizeEpisodeCode(fd.get("episode_code")),
    story_text: String(fd.get("story_text") ?? ""),
    default_duration_seconds: Number(fd.get("default_duration_seconds") ?? 2700),
    default_encounter_total: Number(fd.get("default_encounter_total") ?? 5),
    summary: String(fd.get("summary") ?? "").trim() || null,
    map_image_url: String(fd.get("map_image_url") ?? "").trim() || null,
    npc_image_url: String(fd.get("npc_image_url") ?? "").trim() || null,
    tags: parseTags(fd.get("tags")),
  };

  if (!payload.title) throw new Error("Title is required");

  const { data, error } = await supabase
    .from("episodes")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/admin/episodes");
  redirect(`/admin/episodes/${data.id}`);
}

export async function updateEpisodeAction(episodeId: string, fd: FormData) {
  const supabase = await requireAdmin();

  const payload: EpisodeUpsert = {
    title: String(fd.get("title") ?? "").trim(),
    episode_code: String(fd.get("episode_code") ?? "").trim() || null,
    story_text: String(fd.get("story_text") ?? ""),
    default_duration_seconds: Number(fd.get("default_duration_seconds") ?? 2700),
    default_encounter_total: Number(fd.get("default_encounter_total") ?? 5),
    summary: String(fd.get("summary") ?? "").trim() || null,
    map_image_url: String(fd.get("map_image_url") ?? "").trim() || null,
    npc_image_url: String(fd.get("npc_image_url") ?? "").trim() || null,
    tags: parseTags(fd.get("tags")),
  };

  if (!payload.title) throw new Error("Title is required");

  const { error } = await supabase
    .from("episodes")
    .update(payload)
    .eq("id", episodeId);

  if (error) throw new Error(error.message);

  revalidatePath("/admin/episodes");
  revalidatePath(`/admin/episodes/${episodeId}`);
}

export async function deleteEpisodeAction(episodeId: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase.from("episodes").delete().eq("id", episodeId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/episodes");
}
