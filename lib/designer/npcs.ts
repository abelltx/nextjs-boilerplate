function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

import { createClient } from "@/utils/supabase/server";

export type NpcRow = {
  id: string;
  name: string;
  npc_type: "human" | "beast" | "angel";
  default_role: "enemy" | "ally" | "neutral" | "guide";
  description: string | null;
  stat_block: any;
  image_base_path: string | null;
  image_alt: string | null;
  image_updated_at: string | null;
  notes_storyteller: string | null;
  is_archived: boolean;
  updated_at: string;
};

function buildNpcImageUrl(
  supabaseUrl: string,
  npcId: string,
  file: "thumb.webp" | "small.webp" | "medium.webp" | "portrait.webp",
  version?: string | null
) {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${supabaseUrl}/storage/v1/object/public/npc-images/${npcId}/${file}${v}`;
}

export async function listNpcs() {
  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const { data, error } = await supabase
    .from("npcs")
    .select("id,name,npc_type,default_role,image_base_path,image_alt,image_updated_at,is_archived,updated_at")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((n: any) => {
    const hasImg = !!n.image_base_path;
    const npcId = n.id as string;
    return {
      ...n,
      thumbUrl: hasImg ? buildNpcImageUrl(supabaseUrl, npcId, "thumb.webp", n.image_updated_at) : null,
    };
  });
}

export async function getNpcById(id: string): Promise<(NpcRow & { thumbUrl: string | null; mediumUrl: string | null; portraitUrl: string | null }) | null> {
  if (!id || id === "undefined" || !isUuid(id)) return null;

  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const { data, error } = await supabase
    .from("npcs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const hasImg = !!data.image_base_path;
  return {
    ...(data as any),
    thumbUrl: hasImg ? buildNpcImageUrl(supabaseUrl, id, "thumb.webp", data.image_updated_at) : null,
    mediumUrl: hasImg ? buildNpcImageUrl(supabaseUrl, id, "medium.webp", data.image_updated_at) : null,
    portraitUrl: hasImg ? buildNpcImageUrl(supabaseUrl, id, "portrait.webp", data.image_updated_at) : null,
  };
}

