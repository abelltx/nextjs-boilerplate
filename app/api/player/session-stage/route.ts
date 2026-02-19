import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import { extractMapMarkers } from "@/lib/episodeRuntime";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function buildNpcMediumUrl(
  supabaseUrl: string,
  npcId: string,
  imageUpdatedAt?: string | null
) {
  if (!supabaseUrl || !npcId) return null;
  const version = imageUpdatedAt ? `?v=${encodeURIComponent(imageUpdatedAt)}` : "";
  return `${supabaseUrl}/storage/v1/object/public/npc-images/${npcId}/medium.webp${version}`;
}
function isMissingRelationError(err: any, relation: string) {
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    msg.includes(`relation "${relation}" does not exist`) ||
    msg.includes(`relation "public.${relation}" does not exist`) ||
    msg.includes("does not exist")
  );
}

async function resolveNpcBlock(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  block: any
) {
  if (!block || String(block.block_type ?? "").toLowerCase() !== "npc") return block;

  const meta = { ...((block.meta ?? {}) as Record<string, any>) };
  const bindingMeta = (meta.npc_binding ?? {}) as Record<string, any>;
  const bindingId = String(bindingMeta.binding_id ?? "").trim();
  let npcId = String(bindingMeta.npc_id ?? meta?.npc_library?.npc_id ?? "").trim();
  let bindingRow: any = null;

  const byIdQuery = bindingId && isUuid(bindingId)
    ? await supabase
        .from("episode_npc_bindings")
        .select("id,npc_id,title_override,body_override,image_override,tab_overrides_json,quests_override_json")
        .eq("id", bindingId)
        .maybeSingle()
    : null;
  if (byIdQuery?.data) bindingRow = byIdQuery.data;
  if (byIdQuery?.error && !isMissingRelationError(byIdQuery.error, "episode_npc_bindings")) {
    console.error("resolveNpcBlock binding by id failed:", byIdQuery.error.message);
  }

  if (!bindingRow && block.id) {
    const byBlock = await supabase
      .from("episode_npc_bindings")
      .select("id,npc_id,title_override,body_override,image_override,tab_overrides_json,quests_override_json")
      .eq("episode_block_id", block.id)
      .maybeSingle();
    if (byBlock.data) bindingRow = byBlock.data;
    if (byBlock.error && !isMissingRelationError(byBlock.error, "episode_npc_bindings")) {
      console.error("resolveNpcBlock binding by block failed:", byBlock.error.message);
    }
  }

  if (bindingRow?.npc_id) npcId = String(bindingRow.npc_id);
  if (!npcId || !isUuid(npcId)) return block;

  const { data: npc } = await supabase
    .from("npcs")
    .select("id,name,description,image_base_path,image_updated_at")
    .eq("id", npcId)
    .maybeSingle();
  let runtimeTabsGlobal: Record<string, any> = {};
  let runtimeTabsScoped: Record<string, any> = {};
  const runtimeQuery = await supabase
    .from("npc_runtime_configs")
    .select("meta_json")
    .eq("npc_id", npcId)
    .maybeSingle();
  if (runtimeQuery?.error && !isMissingRelationError(runtimeQuery.error, "npc_runtime_configs")) {
    console.error("resolveNpcBlock runtime config load failed:", runtimeQuery.error.message);
  }
  if (runtimeQuery?.data && typeof (runtimeQuery.data as any)?.meta_json === "object") {
    const runtimeMeta = (runtimeQuery.data as any).meta_json ?? {};
    const maybeGlobal = runtimeMeta?.npc_tabs;
    if (maybeGlobal && typeof maybeGlobal === "object") {
      runtimeTabsGlobal = maybeGlobal as Record<string, any>;
    }
    const episodeId = String(block?.episode_id ?? "").trim();
    const maybeScoped =
      episodeId && runtimeMeta?.npc_tabs_by_episode && typeof runtimeMeta.npc_tabs_by_episode === "object"
        ? runtimeMeta.npc_tabs_by_episode[episodeId]
        : null;
    if (maybeScoped && typeof maybeScoped === "object") {
      runtimeTabsScoped = maybeScoped as Record<string, any>;
    }
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const npcMediumUrl =
    npc?.image_base_path && supabaseUrl
      ? buildNpcMediumUrl(supabaseUrl, String(npc.id), npc.image_updated_at ?? null)
      : null;

  const bindingTabs =
    bindingRow?.tab_overrides_json && typeof bindingRow.tab_overrides_json === "object"
      ? bindingRow.tab_overrides_json
      : null;
  const mergedNpcTabs = bindingTabs
    ? { ...(meta?.npc_tabs ?? {}), ...runtimeTabsGlobal, ...runtimeTabsScoped, ...(bindingTabs ?? {}) }
    : { ...(meta?.npc_tabs ?? {}), ...runtimeTabsGlobal, ...runtimeTabsScoped };
  const questsOverride = Array.isArray(bindingRow?.quests_override_json) ? bindingRow.quests_override_json : null;
  if (questsOverride) {
    const questsPrev = (mergedNpcTabs?.quests ?? {}) as Record<string, any>;
    mergedNpcTabs.quests = { ...questsPrev, quest_defs: questsOverride };
  }

  const mergedMeta = {
    ...meta,
    npc_tabs: mergedNpcTabs,
    npc_binding: {
      binding_id: String(bindingRow?.id ?? bindingId ?? ""),
      npc_id: npcId,
    },
    npc_library: {
      npc_id: npcId,
      name: String(npc?.name ?? meta?.npc_library?.name ?? "NPC"),
      description: String(npc?.description ?? meta?.npc_library?.description ?? "").trim() || null,
      image_url: npcMediumUrl ?? (String(meta?.npc_library?.image_url ?? "").trim() || null),
      designer_url: `/admin/designer/npcs/edit?id=${encodeURIComponent(npcId)}`,
    },
  };

  return {
    ...block,
    title: String(bindingRow?.title_override ?? block.title ?? npc?.name ?? "NPC"),
    body: String(bindingRow?.body_override ?? block.body ?? npc?.description ?? ""),
    image_url: String(bindingRow?.image_override ?? block.image_url ?? npcMediumUrl ?? "").trim() || null,
    meta: mergedMeta,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = (url.searchParams.get("session_id") ?? "").trim();
  if (!isUuid(sessionId)) return NextResponse.json({ ok: false, error: "Bad session_id" }, { status: 400 });

  const { user } = await getProfile();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const supabase = await supabaseServer();

  // Confirm joined
  const { data: joinRow } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (!joinRow?.player_id) return NextResponse.json({ ok: false, error: "Not joined" }, { status: 403 });

  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id,name,story_text,episode_id")
    .eq("id", sessionId)
    .single();

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  const { data: state, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (stErr) return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });

  // Players list (for DM roll-entry UI)
  const { data: players } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId);

  // Presented block
  let block = null as any;
  let linkedBlocks: Record<string, any> = {};
  const presentedId = (state as any)?.presented_block_id;
  if (typeof presentedId === "string" && presentedId.length) {
    const { data: b } = await supabase
      .from("episode_blocks")
      .select("id,episode_id,block_type,title,body,image_url,meta")
      .eq("id", presentedId)
      .maybeSingle();
    block = b ?? null;
    if (block) {
      block = await resolveNpcBlock(supabase, block);
    }

    if (block && String(block.block_type ?? "").toLowerCase() === "map") {
      const targetIds = Array.from(
        new Set(
          extractMapMarkers(block.meta)
            .map((m) => m.targetBlockId)
            .filter((id): id is string => Boolean(id))
        )
      );
      if (targetIds.length) {
        const { data: linked } = await supabase
          .from("episode_blocks")
          .select("id,episode_id,block_type,audience,mode,title,body,image_url,meta")
          .in("id", targetIds);

        for (const row of linked ?? []) {
          const aud = String((row as any).audience ?? "both").toLowerCase();
          if (aud === "storyteller") continue;
          linkedBlocks[(row as any).id] = await resolveNpcBlock(supabase, row);
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    session,
    state,
    block,
    linkedBlocks,
    players: (players ?? []).map((p) => p.player_id),
  });
}
