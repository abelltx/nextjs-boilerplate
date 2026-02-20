export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import {
  getDmSession,
  updateState,
  storytellerAssignQuestToAll,
  storytellerAssignQuestRewardsForAll,
  storytellerCompleteQuestForAll,
  storytellerCompleteQuestTaskForAll,
} from "./actions";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { EpisodePicker } from "@/components/EpisodePicker";
import { presentBlockToPlayersAction, clearPresentedAction } from "@/app/actions/present";
import DmPlayerRollLineRealtime from "@/components/DmPlayerRollLineRealtime";
import { randomUUID } from "crypto";
import SequenceRail from "@/components/episode-runtime/SequenceRail";
import RevealCard from "@/components/episode-runtime/RevealCard";
import CheckPromptCard from "@/components/episode-runtime/CheckPromptCard";
import NpcTabsCard from "@/components/episode-runtime/NpcTabsCard";
import { buildRuntimeSequence, extractMapMarkers } from "@/lib/episodeRuntime";
import SubmitGlowButton from "@/components/ui/SubmitGlowButton";




function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

type Block = {
  id: string;
  sort_order: number;
  block_type: string;
  audience: string;
  mode: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  meta?: any;
};

function isScene(b: Block) {
  return String(b.block_type).toLowerCase() === "scene";
}
function isEncounter(b: Block) {
  return String(b.block_type).toLowerCase() === "encounter";
}
function isPresentable(b: Block) {
  return b.audience !== "storyteller";
}

function getLiveRemainingSeconds(st: any) {
  const remaining = Number(st?.remaining_seconds ?? 0);
  const status = String(st?.timer_status ?? "").toLowerCase();
  if (!Number.isFinite(remaining)) return 0;
  if (status !== "running") return Math.max(0, Math.floor(remaining));

  const updatedMs = Date.parse(String(st?.updated_at ?? ""));
  if (!Number.isFinite(updatedMs)) return Math.max(0, Math.floor(remaining));

  const elapsed = Math.max(0, Math.floor((Date.now() - updatedMs) / 1000));
  return Math.max(0, Math.floor(remaining) - elapsed);
}

function formatTimerClock(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function getBaseDurationSeconds(st: any, sessionRow: any) {
  const stateBase = Number(st?.duration_seconds ?? NaN);
  if (Number.isFinite(stateBase) && stateBase > 0) return Math.floor(stateBase);

  const sessionBase = Number(sessionRow?.duration_seconds ?? NaN);
  if (Number.isFinite(sessionBase) && sessionBase > 0) return Math.floor(sessionBase);

  return 5400; // 90 min fallback
}

function blockTypeTone(type: string) {
  const t = String(type ?? "").toLowerCase();
  if (t === "map") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (t === "npc") return "bg-blue-100 text-blue-800 border-blue-200";
  if (t === "objective") return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-gray-100 text-gray-700 border-gray-200";
}

function resolveBlockImageUrl(block: any): string | null {
  if (!block) return null;
  const direct = String(block?.image_url ?? "").trim();
  if (direct) return direct;
  const meta = (block?.meta ?? {}) as Record<string, any>;
  const npcFull = String(meta?.npc_library?.full_image_url ?? "").trim();
  if (npcFull) return npcFull;
  const npcPortrait = String(meta?.npc_library?.image_url ?? "").trim();
  if (npcPortrait) return npcPortrait;
  return null;
}

export default async function DmScreenPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const p = await Promise.resolve(params);
  const rawSessionId = p?.id;

  if (!rawSessionId || rawSessionId === "undefined" || !isUuid(rawSessionId)) {
    redirect("/storyteller/sessions");
  }

  const sessionId = rawSessionId.trim();

  const { session, state, joins } = await getDmSession(sessionId);
  const supabase = await createClient();

  // --- Determine episode_id safely ---
  let episodeId: string | null =
    (session as any)?.episode_id && typeof (session as any).episode_id === "string"
      ? ((session as any).episode_id as string)
      : null;

  if (!episodeId) {
    const { data: sessionRow, error: sesErr } = await supabase
      .from("sessions")
      .select("episode_id")
      .eq("id", sessionId)
      .maybeSingle();

    if (sesErr) {
      console.error("Failed to load session episode_id:", sesErr.message);
    } else {
      episodeId = sessionRow?.episode_id ?? null;
    }
  }

  // --- Load blocks for episode on this session ---
  let blocks: Block[] = [];
  if (episodeId) {
    const { data, error: blkErr } = await supabase
      .from("episode_blocks")
      .select("id,sort_order,block_type,audience,mode,title,body,image_url,meta")
      .eq("episode_id", episodeId)
      .order("sort_order", { ascending: true });

    if (blkErr) console.error("Failed to load episode_blocks:", blkErr.message);
    blocks = (data ?? []) as any;
  }

  // Hydrate NPC block meta with runtime quest data for storyteller controls.
  if (blocks.length) {
    const npcBlocks = blocks.filter((b) => String(b.block_type).toLowerCase() === "npc");
    const unresolvedNpcBlockIds: string[] = [];
    const npcIdByBlockId = new Map<string, string>();
    for (const b of npcBlocks) {
      const meta = (b.meta ?? {}) as Record<string, any>;
      const npcId = String(meta?.npc_binding?.npc_id ?? meta?.npc_library?.npc_id ?? "").trim();
      if (npcId) npcIdByBlockId.set(String(b.id), npcId);
      else unresolvedNpcBlockIds.push(String(b.id));
    }
    if (unresolvedNpcBlockIds.length) {
      const { data: binds } = await supabase
        .from("episode_npc_bindings")
        .select("episode_block_id,npc_id")
        .in("episode_block_id", unresolvedNpcBlockIds);
      for (const row of binds ?? []) {
        const blockId = String((row as any)?.episode_block_id ?? "").trim();
        const npcId = String((row as any)?.npc_id ?? "").trim();
        if (blockId && npcId) npcIdByBlockId.set(blockId, npcId);
      }
    }
    const npcIds = Array.from(new Set(Array.from(npcIdByBlockId.values()).filter(Boolean)));
    const runtimeByNpcId = new Map<string, any>();
    if (npcIds.length) {
      const { data: runtimeRows } = await supabase
        .from("npc_runtime_configs")
        .select("npc_id,meta_json")
        .in("npc_id", npcIds);
      for (const row of runtimeRows ?? []) {
        const npcId = String((row as any)?.npc_id ?? "").trim();
        const meta = ((row as any)?.meta_json ?? {}) as Record<string, any>;
        if (npcId) runtimeByNpcId.set(npcId, meta);
      }
    }
    blocks = blocks.map((b) => {
      if (String(b.block_type).toLowerCase() !== "npc") return b;
      const npcId = npcIdByBlockId.get(String(b.id)) ?? "";
      if (!npcId) return b;
      const runtimeMeta = runtimeByNpcId.get(npcId) ?? {};
      const runtimeTabs =
        episodeId &&
        runtimeMeta?.npc_tabs_by_episode &&
        typeof runtimeMeta.npc_tabs_by_episode === "object" &&
        runtimeMeta.npc_tabs_by_episode[episodeId]
          ? (runtimeMeta.npc_tabs_by_episode[episodeId] as Record<string, any>)
          : (runtimeMeta?.npc_tabs ?? {}) as Record<string, any>;
      const nextMeta = { ...((b.meta ?? {}) as Record<string, any>), npc_tabs: runtimeTabs };
      return { ...b, meta: nextMeta };
    });
  }

  const { data: episodes, error: epErr } = await supabase
    .from("episodes")
    .select("id,title,episode_code,tags")
    .order("created_at", { ascending: false });

  if (epErr) console.error("Failed to load episodes list:", epErr.message);

  // --- Scene grouping ---
  const ordered = [...(blocks ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const scenes: Array<{ scene: Block; children: Block[] }> = [];
  let currentScene: Block | null = null;
  let currentChildren: Block[] = [];

  for (const b of ordered) {
    if (isScene(b)) {
      if (currentScene) scenes.push({ scene: currentScene, children: currentChildren });
      currentScene = b;
      currentChildren = [];
      continue;
    }
    if (currentScene) currentChildren.push(b);
  }
  if (currentScene) scenes.push({ scene: currentScene, children: currentChildren });

  const completedSceneIds: string[] = Array.isArray((state as any).completed_scene_ids)
    ? ((state as any).completed_scene_ids as string[])
    : [];

  const presentedId = (state as any).presented_block_id as string | null;

  const presentedSceneIdx = presentedId
    ? scenes.findIndex((s) => s.scene.id === presentedId || s.children.some((c) => c.id === presentedId))
    : -1;

  const totalScenes = scenes.length;
  const currentSceneHuman = presentedSceneIdx >= 0 ? presentedSceneIdx + 1 : 0;
  const completedCount = scenes.filter((s) => completedSceneIds.includes(s.scene.id)).length;
  const episodePct = totalScenes > 0 ? Math.round((completedCount / totalScenes) * 100) : 0;

  const blockById = new Map<string, Block>();
  for (const b of ordered) blockById.set(b.id, b);
  const runtimeSequence = buildRuntimeSequence(scenes as any);
  const activeSceneId = scenes[presentedSceneIdx]?.scene?.id ?? null;
  const liveTimerSeconds = getLiveRemainingSeconds(state);
  const timerStatusLabel = String((state as any).timer_status ?? "stopped");
  const presentedBlock = presentedId ? blockById.get(presentedId) ?? null : null;
  const activeScene = presentedSceneIdx >= 0 ? scenes[presentedSceneIdx] : null;
  const activeSceneMapBlock =
    activeScene?.children?.find((c) => String(c.block_type).toLowerCase() === "map" && !!c.image_url) ?? null;
  const activeSceneMapMarkers = activeSceneMapBlock ? extractMapMarkers(activeSceneMapBlock.meta) : [];
  const activeSceneNpcBlock =
    activeScene?.children?.find((c) => String(c.block_type).toLowerCase() === "npc") ?? null;
  const stageMapBlock =
    String(presentedBlock?.block_type ?? "").toLowerCase() === "map" ? presentedBlock : activeSceneMapBlock;
  const stageMapMarkers = stageMapBlock ? extractMapMarkers(stageMapBlock.meta) : [];
  const stageNpcBlock =
    String(presentedBlock?.block_type ?? "").toLowerCase() === "npc" ? presentedBlock : activeSceneNpcBlock;
  const previewIsMap = String(presentedBlock?.block_type ?? "").toLowerCase() === "map";
  const previewMapMarkers = previewIsMap ? extractMapMarkers(presentedBlock?.meta) : [];
  const carouselSceneIdx = presentedSceneIdx >= 0 ? presentedSceneIdx : scenes.length ? 0 : -1;
  const carouselScene = carouselSceneIdx >= 0 ? scenes[carouselSceneIdx] : null;
  const carouselSceneSteps = (carouselScene?.children ?? []).filter((c) => isPresentable(c));
  const carouselActiveStepIdx = presentedId ? carouselSceneSteps.findIndex((c) => c.id === presentedId) : -1;
  const carouselNextScene = carouselSceneIdx >= 0 ? scenes[carouselSceneIdx + 1] ?? null : null;
  const carouselNextSceneFirst =
    carouselNextScene?.children?.find((c) => isPresentable(c)) ?? null;
  const storytellerDirective = (() => {
    if (!presentedBlock) return "";
    const meta = (presentedBlock.meta ?? {}) as Record<string, any>;
    const explicitScript = String(meta.storyteller_script ?? "").trim();
    if (explicitScript) return explicitScript;
    const explicitNotes = String(meta.storyteller_notes ?? "").trim();
    if (explicitNotes) return explicitNotes;

    const kind = String(presentedBlock.block_type ?? "").toLowerCase();
    if (kind === "npc") {
      const questDefs = Array.isArray(meta?.npc_tabs?.quests?.quest_defs) ? meta.npc_tabs.quests.quest_defs : [];
      const questNotes = questDefs
        .map((q: any) => String(q?.storyteller_notes ?? "").trim())
        .filter(Boolean);
      if (questNotes.length) {
        return questNotes
          .map((txt: string, idx: number) => `Quest ${idx + 1}: ${txt}`)
          .join("\n\n");
      }
    }

    const legacyCandidates = [
      meta.storyteller_text,
      meta.narrative,
      meta.note,
      meta.notes,
      meta.dm_notes,
      meta.gm_notes,
    ];
    for (const c of legacyCandidates) {
      const value = String(c ?? "").trim();
      if (value) return value;
    }

    if (kind === "map") return "Guide players through the map and use marker reveals as they investigate.";
    if (kind === "npc") return "Read the NPC prompt and drive dialogue before assigning or progressing quests.";
    if (kind === "encounter") return "Set initiative and run encounter pacing from this scene.";
    return "";
  })();
  const questDirectorNpcBlock =
    presentedBlock && String(presentedBlock.block_type).toLowerCase() === "npc"
      ? presentedBlock
      : null;
  const questDirectorDefs = Array.isArray(questDirectorNpcBlock?.meta?.npc_tabs?.quests?.quest_defs)
    ? (questDirectorNpcBlock?.meta?.npc_tabs?.quests?.quest_defs as any[])
    : [];
  const sessionPlayerIds = Array.from(
    new Set((joins ?? []).map((j: any) => String(j?.player_id ?? "").trim()).filter(Boolean))
  );
  const admin = createAdminClient() ?? supabase;
  let sessionCharacterIds: string[] = [];
  if (sessionPlayerIds.length) {
    const { data: charRows } = await admin
      .from("characters")
      .select("id,user_id,created_at")
      .in("user_id", sessionPlayerIds)
      .order("created_at", { ascending: true });
    const firstByUser = new Map<string, string>();
    for (const row of charRows ?? []) {
      const userId = String((row as any)?.user_id ?? "").trim();
      const charId = String((row as any)?.id ?? "").trim();
      if (!userId || !charId || firstByUser.has(userId)) continue;
      firstByUser.set(userId, charId);
    }
    sessionCharacterIds = sessionPlayerIds
      .map((id) => firstByUser.get(id) ?? "")
      .filter((id) => Boolean(id));
  }
  const questDirectorIds = questDirectorDefs
    .map((q: any, i: number) => String(q?.id ?? "").trim() || `quest_${i + 1}`)
    .filter(Boolean);
  let questProgressRows: any[] = [];
  if (sessionCharacterIds.length && questDirectorIds.length) {
    const { data: qpRows } = await admin
      .from("player_quest_progress")
      .select("character_id,quest_id,status,completed_task_ids")
      .in("character_id", sessionCharacterIds)
      .in("quest_id", questDirectorIds);
    questProgressRows = qpRows ?? [];
  }
  const questProgressByQuest = new Map<string, any[]>();
  for (const row of questProgressRows) {
    const questId = String((row as any)?.quest_id ?? "").trim();
    if (!questId) continue;
    const list = questProgressByQuest.get(questId) ?? [];
    list.push(row);
    questProgressByQuest.set(questId, list);
  }
  const talkTargetIds = Array.from(
    new Set(
      (blocks ?? [])
        .flatMap((b) => {
          const defs = Array.isArray((b as any)?.meta?.npc_tabs?.quests?.quest_defs)
            ? ((b as any).meta.npc_tabs.quests.quest_defs as any[])
            : [];
          return defs.flatMap((q: any) => (Array.isArray(q?.tasks) ? q.tasks : []));
        })
        .map((t: any) => String(t?.target_npc_block_id ?? "").trim())
        .filter((v) => isUuid(v))
    )
  );
  let npcNameByTargetId = new Map<string, string>();
  if (talkTargetIds.length) {
    const { data: npcRows, error: npcErr } = await supabase
      .from("npcs")
      .select("id,name")
      .in("id", talkTargetIds);
    if (!npcErr) {
      npcNameByTargetId = new Map<string, string>(
        (npcRows ?? [])
          .map((n: any) => [String(n?.id ?? "").trim().toLowerCase(), String(n?.name ?? "").trim()] as const)
          .filter(([id, name]) => Boolean(id && name))
      );
    }
    const { data: bindingRows, error: bindErr } = await supabase
      .from("episode_npc_bindings")
      .select("episode_block_id,npc_id")
      .in("episode_block_id", talkTargetIds);
    if (!bindErr && (bindingRows ?? []).length) {
      const blockToNpc = new Map<string, string>(
        (bindingRows ?? [])
          .map((b: any) => [String(b?.episode_block_id ?? "").trim().toLowerCase(), String(b?.npc_id ?? "").trim()] as const)
          .filter(([blockId, npcId]) => Boolean(blockId && npcId))
      );
      const unresolvedNpcIds = Array.from(
        new Set(
          talkTargetIds
            .map((id) => {
              const lower = id.toLowerCase();
              if (npcNameByTargetId.has(lower)) return null;
              return blockToNpc.get(lower) ?? null;
            })
            .filter((v): v is string => Boolean(v))
        )
      );
      if (unresolvedNpcIds.length) {
        const { data: linkedNpcRows, error: linkedNpcErr } = await supabase
          .from("npcs")
          .select("id,name")
          .in("id", unresolvedNpcIds);
        if (!linkedNpcErr) {
          const linkedNameByNpcId = new Map<string, string>(
            (linkedNpcRows ?? [])
              .map((n: any) => [String(n?.id ?? "").trim().toLowerCase(), String(n?.name ?? "").trim()] as const)
              .filter(([id, name]) => Boolean(id && name))
          );
          for (const rawTargetId of talkTargetIds) {
            const targetId = rawTargetId.toLowerCase();
            if (npcNameByTargetId.has(targetId)) continue;
            const npcId = blockToNpc.get(targetId);
            if (!npcId) continue;
            const linkedName = linkedNameByNpcId.get(npcId.toLowerCase());
            if (linkedName) npcNameByTargetId.set(targetId, linkedName);
          }
        }
      }
    }
  }
  function renderQuestTaskTitle(task: any) {
    const id = String(task?.id ?? "").trim();
    const kind = String(task?.kind ?? "").trim().toLowerCase() || "task";
    const targetNpcId = String(task?.target_npc_block_id ?? "").trim();
    const explicitName = String(task?.target_npc_name ?? "").trim();
    const lookupName = targetNpcId ? npcNameByTargetId.get(targetNpcId.toLowerCase()) ?? "" : "";
    const npcName = explicitName || lookupName;
    if (kind === "talk_to_npc" && npcName) return `Talk to ${npcName}`;
    const rawTitle = String(task?.title ?? "").trim();
    if (rawTitle && !/^talk to npc \(/i.test(rawTitle)) return rawTitle;
    if (kind === "talk_to_npc" && targetNpcId) {
      return npcName ? `Talk to ${npcName}` : `Talk to NPC (${targetNpcId.slice(0, 8)}...)`;
    }
    return rawTitle || id;
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* TOP ROW */}
      <div className="grid grid-cols-12 gap-3">
        {/* Session box */}
        <div className="col-span-12 border rounded-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase text-gray-500">Session</div>
              <div className="text-xl font-bold">{session.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                Session ID: <span className="font-mono">{session.id}</span>
              </div>
            </div>

            <div className="w-full max-w-md space-y-2">
              <div className="text-right">
              <div className="text-xs uppercase text-gray-500">Join Code</div>
              <div className="font-mono text-2xl font-bold">{session.join_code}</div>
              </div>
              <details className="rounded border p-2">
                <summary className="cursor-pointer text-xs uppercase text-gray-500">Select Episode</summary>
                <div className="mt-2 text-xs text-gray-600 mb-2">
                  Current: <span className="font-mono">{episodeId ?? "-"}</span>
                </div>
                <EpisodePicker sessionId={sessionId} episodes={episodes ?? []} />
              </details>
            </div>
          </div>
          <details className="rounded border p-2">
            <summary className="cursor-pointer text-xs uppercase text-gray-500">Timer</summary>
            <div className="mt-2">
              <div className="rounded border p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase text-gray-500">Session Timer</div>
                  <div className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] uppercase text-gray-600">{timerStatusLabel}</div>
                </div>
                <div className="font-mono text-lg font-bold">{formatTimerClock(liveTimerSeconds)}</div>
                <div className="flex flex-wrap gap-2">
                  <form
                    action={async () => {
                      "use server";
                      const frozen = getLiveRemainingSeconds(state);
                      await updateState(session.id, { timer_status: "running", remaining_seconds: frozen });
                      redirect(`/storyteller/sessions/${session.id}`);
                    }}
                  >
                    <button className="px-2 py-1 rounded bg-black text-white text-xs">Start</button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      const frozen = getLiveRemainingSeconds(state);
                      await updateState(session.id, { timer_status: "paused", remaining_seconds: frozen });
                      redirect(`/storyteller/sessions/${session.id}`);
                    }}
                  >
                    <button className="px-2 py-1 rounded border text-xs">Pause</button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      const frozen = getLiveRemainingSeconds(state);
                      await updateState(session.id, { remaining_seconds: frozen + 300 });
                      redirect(`/storyteller/sessions/${session.id}`);
                    }}
                  >
                    <button className="px-2 py-1 rounded border text-xs">+5</button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      const base = getBaseDurationSeconds(state, session);
                      await updateState(session.id, {
                        timer_status: "stopped",
                        duration_seconds: base,
                        remaining_seconds: base,
                      });
                      redirect(`/storyteller/sessions/${session.id}`);
                    }}
                  >
                    <button className="px-2 py-1 rounded border text-xs">Reset</button>
                  </form>
                </div>
              </div>
            </div>
          </details>

        </div>     {/* end session box */}
      </div>

      {/* EPISODE TABLE OF CONTENTS */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-gray-500">Episode Table of Contents</div>
            <div className="text-sm text-gray-700">
              {totalScenes ? (
                <>
                  Current: <b>{currentSceneHuman || 0}</b> of <b>{totalScenes}</b> | Completed: <b>{completedCount}</b> of{" "}
                  <b>{totalScenes}</b> | Progress: <b>{episodePct}%</b>
                </>
              ) : (
                "No scenes found (add block_type = scene)."
              )}
            </div>
          </div>

          <form
            action={async () => {
              "use server";
              await clearPresentedAction(session.id);
              redirect(`/storyteller/sessions/${session.id}`);
            }}
          >
            <button className="px-3 py-2 rounded border">Clear Player View</button>
          </form>
        </div>

        <div className="space-y-2">
          <SequenceRail items={runtimeSequence} activeId={activeSceneId} />
          <div className="rounded-lg border p-2 bg-white">
            <div className="mb-2 text-[11px] uppercase text-gray-500">
              Scene Step Carousel
              {carouselScene ? (
                <span className="ml-2 normal-case text-gray-600">
                  ({carouselScene.scene.title ?? `Scene ${carouselSceneIdx + 1}`})
                </span>
              ) : null}
            </div>
            {carouselSceneSteps.length ? (
              <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1">
                {carouselSceneSteps.map((b, i) => {
                  const bt = String(b.block_type ?? "").toLowerCase();
                  const isActiveStep = carouselActiveStepIdx === i;
                  return (
                    <div
                      key={b.id}
                      className={`snap-start min-w-[170px] rounded border p-2 space-y-1.5 ${
                        isActiveStep ? "bg-blue-50 border-blue-300" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${blockTypeTone(bt)}`}>{bt}</span>
                        <span className="text-[10px] text-gray-500">Step {i + 1}</span>
                      </div>
                      <div className="text-xs font-semibold line-clamp-2">{b.title ?? bt}</div>
                      <form
                        action={async () => {
                          "use server";
                          await presentBlockToPlayersAction(session.id, b.id);
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="w-full rounded border px-2 py-1 text-[11px]">Go to Step</button>
                      </form>
                    </div>
                  );
                })}
                {carouselNextSceneFirst ? (
                  <div className="snap-start min-w-[170px] rounded border p-2 space-y-1.5 bg-violet-50 border-violet-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded border px-2 py-0.5 text-[10px] uppercase bg-violet-100 text-violet-800 border-violet-200">
                        scene
                      </span>
                      <span className="text-[10px] text-gray-500">Final Step</span>
                    </div>
                    <div className="text-xs font-semibold line-clamp-2">
                      Progress to {carouselNextScene?.scene?.title ?? "Next Scene"}
                    </div>
                    <form
                      action={async () => {
                        "use server";
                        await presentBlockToPlayersAction(session.id, carouselNextSceneFirst.id);
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <button className="w-full rounded border px-2 py-1 text-[11px]">Next Scene</button>
                    </form>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-sm text-gray-600">No presentable steps in this scene yet.</div>
            )}
          </div>
          <details className="rounded border p-2">
            <summary className="cursor-pointer text-sm font-semibold">Detailed Scene Controls</summary>
            <div className="mt-2 space-y-2">
          {scenes.map((s, si) => {
            const sceneLive = s.scene.id === presentedId || s.children.some((c) => c.id === presentedId);
            const sceneDone = completedSceneIds.includes(s.scene.id);

            const presentableChildren = (s.children ?? []).filter((c) => isPresentable(c));
            const firstChild = presentableChildren[0];

            const liveChildIdx = presentedId ? presentableChildren.findIndex((c) => c.id === presentedId) : -1;
            const nextInScene = liveChildIdx === -1 ? firstChild : presentableChildren[liveChildIdx + 1];

            const nextScene = scenes[si + 1];
            const nextSceneFirst = nextScene?.children?.find((c) => isPresentable(c)) ?? null;

            return (
              <details key={s.scene.id} className={`border rounded-lg p-2 ${sceneLive ? "bg-gray-50" : ""}`}>
                <summary className="cursor-pointer flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="text-gray-500 mr-2">
                      Scene {si + 1} of {totalScenes}
                    </span>
                    <span className="font-semibold">{s.scene.title ?? "Scene"}</span>
                    {sceneLive ? <span className="ml-2 text-xs text-green-700">(LIVE)</span> : null}
                    {sceneDone ? <span className="ml-2 text-xs text-blue-700">(DONE)</span> : null}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">#{s.scene.sort_order}</div>
                </summary>

                <div className="mt-2 space-y-3">
                  {s.scene.body ? <div className="text-sm whitespace-pre-wrap">{s.scene.body}</div> : null}

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <form
                      action={async () => {
                        "use server";
                        const next = sceneDone
                          ? completedSceneIds.filter((id) => id !== s.scene.id)
                          : [...completedSceneIds, s.scene.id];
                        await updateState(session.id, { completed_scene_ids: next });
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <button className={`px-3 py-2 rounded text-sm ${sceneDone ? "border" : "bg-black text-white"}`}>
                        {sceneDone ? "Mark Scene Incomplete" : "Mark Scene Complete"}
                      </button>
                    </form>

                    <div className="flex flex-wrap gap-2">
                      <form
                        action={async () => {
                          "use server";
                          if (firstChild) await presentBlockToPlayersAction(session.id, firstChild.id);
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="px-3 py-2 rounded border text-sm" disabled={!firstChild}>
                          Present Scene
                        </button>
                      </form>

                      <form
                        action={async () => {
                          "use server";
                          if (nextInScene) await presentBlockToPlayersAction(session.id, nextInScene.id);
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="px-3 py-2 rounded bg-black text-white text-sm" disabled={!nextInScene}>
                          Next in Scene {" >"}
                        </button>
                      </form>

                      <form
                        action={async () => {
                          "use server";
                          if (nextSceneFirst) await presentBlockToPlayersAction(session.id, nextSceneFirst.id);
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="px-3 py-2 rounded border text-sm" disabled={!nextSceneFirst}>
                          Next Scene {" >>"}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {s.children.length ? (
                      s.children.map((b) => {
                        const live = b.id === presentedId;
                        const presentable = isPresentable(b);
                        const encounter = isEncounter(b);
                        const isNpc = String(b.block_type).toLowerCase() === "npc";
                        const rawQuestDefs = isNpc ? (b.meta?.npc_tabs?.quests?.quest_defs ?? []) : [];
                        const questDefs = Array.isArray(rawQuestDefs) ? rawQuestDefs : [];

                        return (
                          <details key={b.id} className={`border rounded-lg p-2 ${live ? "bg-gray-50" : ""}`}>
                            <summary className="cursor-pointer flex items-center justify-between gap-3">
                              <div className="text-sm">
                                <span className="font-semibold">{b.block_type}</span>
                                {b.title ? ` - ${b.title}` : ""}
                                {!presentable ? <span className="ml-2 text-xs text-gray-500">(ST)</span> : null}
                                {live ? <span className="ml-2 text-xs text-green-700">(LIVE)</span> : null}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">#{b.sort_order}</div>
                            </summary>

                            <div className="mt-2 space-y-2">
                              {(() => {
                                const mapMarkers = extractMapMarkers(b.meta);
                                return (
                              <RevealCard
                                kind={String(b.block_type).toLowerCase() === "npc" ? undefined : b.block_type}
                                audience={String(b.block_type).toLowerCase() === "npc" ? undefined : b.audience}
                                mode={String(b.block_type).toLowerCase() === "npc" ? undefined : b.mode}
                                title={b.title}
                                body={b.body}
                                className="border-gray-200"
                                hideBody={String(b.block_type).toLowerCase() === "npc"}
                                childrenTop={
                                  String(b.block_type).toLowerCase() === "npc" ? (
                                    <NpcTabsCard meta={b.meta} fallbackInfo={b.body ?? ""} imageUrl={b.image_url ?? null} embedded />
                                  ) : undefined
                                }
                              >
                                {b.image_url ? (
                                  String(b.block_type).toLowerCase() === "map" ? (
                                    <div className="relative overflow-hidden rounded border">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={b.image_url} alt={b.title ?? "Map"} className="w-full h-auto" />
                                      {mapMarkers.map((m, i) => (
                                        <form
                                          key={m.id}
                                          action={async () => {
                                            "use server";
                                            if (!m.targetBlockId) return;
                                            await presentBlockToPlayersAction(session.id, m.targetBlockId);
                                            redirect(`/storyteller/sessions/${session.id}`);
                                          }}
                                          className="absolute -translate-x-1/2 -translate-y-1/2"
                                          style={{
                                            left: `${Math.max(0, Math.min(100, m.x))}%`,
                                            top: `${Math.max(0, Math.min(100, m.y))}%`,
                                          }}
                                        >
                                          <button
                                            className="rounded-full border border-white bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white"
                                            title={
                                              m.targetBlockId
                                                ? `Reveal ${blockById.get(m.targetBlockId)?.title ?? "linked block"}`
                                                : `${m.label} (no link)`
                                            }
                                            disabled={!m.targetBlockId}
                                          >
                                            {i + 1}
                                          </button>
                                        </form>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="relative overflow-hidden rounded border">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={b.image_url} alt={b.title ?? "Block"} className="w-full h-auto" />
                                    </div>
                                  )
                                ) : null}
                              </RevealCard>
                                );
                              })()}

                              {String(b.block_type).toLowerCase() === "map" ? (
                                <div className="rounded border p-2 bg-gray-50 space-y-2">
                                  <div className="text-xs uppercase text-gray-500">Map Markers</div>
                                  {extractMapMarkers(b.meta).length === 0 ? (
                                    <div className="text-sm text-gray-600">No markers linked yet.</div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {extractMapMarkers(b.meta).map((m, i) => {
                                        const target = m.targetBlockId ? blockById.get(m.targetBlockId) : null;
                                        return (
                                          <form
                                            key={m.id}
                                            action={async () => {
                                              "use server";
                                              if (!m.targetBlockId) return;
                                              await presentBlockToPlayersAction(session.id, m.targetBlockId);
                                              redirect(`/storyteller/sessions/${session.id}`);
                                            }}
                                          >
                                            <button
                                              className="rounded border px-2 py-1 text-xs"
                                              disabled={!m.targetBlockId}
                                              title={m.targetBlockId ? `Reveal ${target?.title ?? "linked block"}` : "No linked block"}
                                            >
                                              Reveal {i + 1}: {m.label}
                                            </button>
                                          </form>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              ) : null}

                              {isNpc && questDefs.length ? (
                                <div className="rounded border p-2 bg-gray-50 space-y-2">
                                  <div className="text-xs uppercase text-gray-500">NPC Quest Controls</div>
                                  {questDefs.map((q: any, qi: number) => {
                                    const qId = String(q?.id ?? "").trim() || `quest_${qi + 1}`;
                                    const qTitle = String(q?.title ?? "").trim() || qId;
                                    const qTasks = Array.isArray(q?.tasks) ? q.tasks : [];
                                    const qTaskIds = qTasks
                                      .map((t: any) => String(t?.id ?? "").trim())
                                      .filter(Boolean);
                                    const qRewardFaith = Math.max(0, Number(q?.rewards?.faith ?? 0) || 0);
                                    const qRewardItemIds = Array.isArray(q?.rewards?.item_ids)
                                      ? q.rewards.item_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)
                                      : [];
                                    return (
                                      <div key={qId} className="rounded border bg-white p-2 space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-sm font-semibold">{qTitle}</div>
                                          <div className="flex items-center gap-2">
                                            <form
                                              action={async () => {
                                                "use server";
                                                await storytellerAssignQuestToAll({
                                                  sessionId: session.id,
                                                  questId: qId,
                                                  questTitle: qTitle,
                                                  taskDefs: qTasks.map((t: any) => ({
                                                    id: String(t?.id ?? "").trim(),
                                                    title: String(t?.title ?? "").trim(),
                                                    kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
                                                    target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
                                                    target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
                                                  })),
                                                  rewardFaith: qRewardFaith,
                                                  rewardItemIds: qRewardItemIds,
                                                });
                                                redirect(`/storyteller/sessions/${session.id}`);
                                              }}
                                            >
                                              <button className="rounded border px-2 py-1 text-xs">Assign to All</button>
                                            </form>
                                            <form
                                              action={async () => {
                                                "use server";
                                                await storytellerCompleteQuestForAll({
                                                  sessionId: session.id,
                                                  questId: qId,
                                                  questTitle: qTitle,
                                                  allTaskIds: qTaskIds,
                                                  taskDefs: qTasks.map((t: any) => ({
                                                    id: String(t?.id ?? "").trim(),
                                                    title: String(t?.title ?? "").trim(),
                                                    kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
                                                    target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
                                                    target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
                                                  })),
                                                  rewardFaith: qRewardFaith,
                                                  rewardItemIds: qRewardItemIds,
                                                });
                                                redirect(`/storyteller/sessions/${session.id}`);
                                              }}
                                            >
                                              <button className="rounded border px-2 py-1 text-xs">Complete Quest for All</button>
                                            </form>
                                            <form
                                              action={async () => {
                                                "use server";
                                                await storytellerAssignQuestRewardsForAll({
                                                  sessionId: session.id,
                                                  questId: qId,
                                                  questTitle: qTitle,
                                                  allTaskIds: qTaskIds,
                                                  taskDefs: qTasks.map((t: any) => ({
                                                    id: String(t?.id ?? "").trim(),
                                                    title: String(t?.title ?? "").trim(),
                                                    kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
                                                    target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
                                                    target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
                                                  })),
                                                  rewardFaith: qRewardFaith,
                                                  rewardItemIds: qRewardItemIds,
                                                });
                                                redirect(`/storyteller/sessions/${session.id}`);
                                              }}
                                            >
                                              <button className="rounded border px-2 py-1 text-xs">Assign Rewards to All</button>
                                            </form>
                                          </div>
                                        </div>
                                        {qTasks.length ? (
                                          <div className="space-y-1">
                                            {qTasks.map((t: any) => {
                                              const tId = String(t?.id ?? "").trim();
                                              const tTitle = renderQuestTaskTitle(t);
                                              if (!tId) return null;
                                              return (
                                                <div key={tId} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                                                  <div className="text-xs">{tTitle}</div>
                                                  <form
                                                    action={async () => {
                                                      "use server";
                                                      await storytellerCompleteQuestTaskForAll({
                                                        sessionId: session.id,
                                                        questId: qId,
                                                        questTitle: qTitle,
                                                        taskId: tId,
                                                        allTaskIds: qTaskIds,
                                                        taskDefs: qTasks.map((x: any) => ({
                                                          id: String(x?.id ?? "").trim(),
                                                          title: String(x?.title ?? "").trim(),
                                                          kind: String(x?.kind ?? "").trim().toLowerCase() || "task",
                                                          target_npc_block_id: String(x?.target_npc_block_id ?? "").trim() || null,
                                                          target_npc_name: String(x?.target_npc_name ?? "").trim() || null,
                                                        })),
                                                        rewardFaith: qRewardFaith,
                                                        rewardItemIds: qRewardItemIds,
                                                      });
                                                      redirect(`/storyteller/sessions/${session.id}`);
                                                    }}
                                                  >
                                                    <SubmitGlowButton
                                                      idleLabel="Mark Task Complete"
                                                      pendingLabel="Marking..."
                                                      className="rounded border px-2 py-0.5 text-[11px]"
                                                    />
                                                  </form>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        ) : (
                                          <div className="text-xs text-gray-600">No tasks configured.</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}

                              {encounter ? (
                                <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
                                  <div className="text-xs uppercase text-gray-500">Encounter</div>
                                  {b.meta?.notes ? (
                                    <div className="text-sm whitespace-pre-wrap">
                                      <b>Notes:</b> {b.meta.notes}
                                    </div>
                                  ) : null}
                                  {Array.isArray(b.meta?.monsters) && b.meta.monsters.length ? (
                                    <div className="space-y-2">
                                      {b.meta.monsters.map((m: any, mi: number) => (
                                        <div key={m.id || mi} className="border rounded p-2 bg-white">
                                          <div className="font-semibold">{m.name || `Monster ${mi + 1}`}</div>
                                          <div className="text-xs text-gray-600">
                                            AC {m.ac ?? "-"} | HP {m.hp ?? "-"} | ATK {m.attack ?? "-"} | DMG{" "}
                                            {m.damage ?? "-"}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="text-sm text-gray-600">No monsters defined in meta.</div>
                                  )}
                                </div>
                              ) : null}

                              {presentable ? (
                                <form
                                  action={async () => {
                                    "use server";
                                    await presentBlockToPlayersAction(session.id, b.id);
                                    redirect(`/storyteller/sessions/${session.id}`);
                                  }}
                                >
                                  <button className="px-3 py-2 rounded bg-black text-white">Present to Players</button>
                                </form>
                              ) : null}
                            </div>
                          </details>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-600">No blocks inside this scene yet.</div>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
            </div>
          </details>
        </div>
      </div>

      {/* MAIN BOARD */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-12 lg:col-span-3 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Players</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => {
              const pRow = (joins ?? [])[i];
              const playerId = pRow?.player_id ?? null;
              return (
                <div key={i} className="border rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Player {i + 1}</div>
                  <div className="text-[11px] font-mono break-all">{playerId ? playerId.slice(0, 8) : "-"}</div>
                  <DmPlayerRollLineRealtime sessionId={sessionId} playerId={playerId} initialState={state as any} />
                </div>
              );
            })}
          </div>
          <div className="mt-3 border rounded-lg p-3">
            <div className="text-xs uppercase text-gray-500 mb-2">Check Prompt</div>
            <CheckPromptCard
              sessionId={session.id}
              joins={joins as any[]}
              rollOpen={Boolean((state as any).roll_open)}
              currentPrompt={String((state as any).roll_prompt ?? "")}
              onSendPrompt={async (fd) => {
                "use server";
                const checkKey = String(fd.get("check_key") ?? "Perception").trim();
                const instruction = String(fd.get("instruction") ?? "").trim();
                const dcRaw = String(fd.get("dc") ?? "").trim();
                const target = String(fd.get("target") ?? "all").trim() || "all";
                const dc = Number(dcRaw);
                const hasDc = Number.isFinite(dc) && dc > 0;

                const prompt = [
                  "Roll Request",
                  `${checkKey} check${hasDc ? ` (DC ${dc})` : ""}.`,
                  instruction || `Click ${checkKey} in your sheet and report your total.`,
                ].join(" ");

                await updateState(session.id, {
                  roll_open: true,
                  roll_die: "d20",
                  roll_prompt: prompt,
                  roll_target: target,
                  roll_round_id: randomUUID(),
                  roll_results: {},
                });
                redirect(`/storyteller/sessions/${session.id}`);
              }}
              onClosePrompt={async () => {
                "use server";
                await updateState(session.id, { roll_open: false, roll_die: null, roll_prompt: null, roll_target: "all" });
                redirect(`/storyteller/sessions/${session.id}`);
              }}
            />
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Stage</div>
          <div className="mt-2 rounded border bg-gray-50 p-3 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="rounded border bg-white p-2 space-y-1">
              <div className="text-[11px] uppercase text-gray-500">Storyteller Direction</div>
              {presentedBlock ? (
                <>
                  <div className="text-sm font-semibold">
                    {presentedBlock.title ?? presentedBlock.block_type ?? "Presented"}
                  </div>
                  <div className="text-sm whitespace-pre-wrap text-gray-700">
                    {storytellerDirective || "No storyteller notes on this block. Use block title/body and quest controls to run this moment."}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">Nothing presented to players yet.</div>
              )}
            </div>
            {questDirectorNpcBlock ? (
              <div className="rounded border bg-white p-2 space-y-2">
                <div className="text-[11px] uppercase text-gray-500">Quest Director (Live NPC)</div>
                <div className="text-xs text-gray-600">
                  {questDirectorNpcBlock.title ? `${questDirectorNpcBlock.title}` : "Presented NPC"}
                </div>
                {questDirectorDefs.length ? (
                  questDirectorDefs.map((q: any, qi: number) => {
                    const qId = String(q?.id ?? "").trim() || `quest_${qi + 1}`;
                    const qTitle = String(q?.title ?? "").trim() || qId;
                    const qStorytellerNotes = String(q?.storyteller_notes ?? "").trim();
                    const qTasks = Array.isArray(q?.tasks) ? q.tasks : [];
                    const qTaskIds = qTasks.map((t: any) => String(t?.id ?? "").trim()).filter(Boolean);
                    const qProgressRows = questProgressByQuest.get(qId) ?? [];
                    const qTaskDoneCounts = new Map<string, number>();
                    for (const row of qProgressRows) {
                      const done = Array.isArray((row as any)?.completed_task_ids)
                        ? (row as any).completed_task_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)
                        : [];
                      for (const tId of done) {
                        qTaskDoneCounts.set(tId, (qTaskDoneCounts.get(tId) ?? 0) + 1);
                      }
                    }
                    const qCompletedPlayers = qProgressRows.filter((r: any) => {
                      const st = String(r?.status ?? "").toLowerCase();
                      return st === "completed" || st === "claimed";
                    }).length;
                    const qRewardFaith = Math.max(0, Number(q?.rewards?.faith ?? 0) || 0);
                    const qRewardItemIds = Array.isArray(q?.rewards?.item_ids)
                      ? q.rewards.item_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)
                      : [];
                    return (
                      <div key={qId} className="rounded border bg-gray-50 p-2 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-semibold">{qTitle}</div>
                          <div className="flex items-center gap-2">
                            <form
                              action={async () => {
                                "use server";
                                await storytellerAssignQuestToAll({
                                  sessionId: session.id,
                                  questId: qId,
                                  questTitle: qTitle,
                                  taskDefs: qTasks.map((t: any) => ({
                                    id: String(t?.id ?? "").trim(),
                                    title: String(t?.title ?? "").trim(),
                                    kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
                                    target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
                                    target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
                                  })),
                                  rewardFaith: qRewardFaith,
                                  rewardItemIds: qRewardItemIds,
                                });
                                redirect(`/storyteller/sessions/${session.id}`);
                              }}
                            >
                              <button className="rounded border px-2 py-1 text-xs">Assign to All</button>
                            </form>
                            <form
                              action={async () => {
                                "use server";
                                await storytellerCompleteQuestForAll({
                                  sessionId: session.id,
                                  questId: qId,
                                  questTitle: qTitle,
                                  allTaskIds: qTaskIds,
                                  taskDefs: qTasks.map((t: any) => ({
                                    id: String(t?.id ?? "").trim(),
                                    title: String(t?.title ?? "").trim(),
                                    kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
                                    target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
                                    target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
                                  })),
                                  rewardFaith: qRewardFaith,
                                  rewardItemIds: qRewardItemIds,
                                });
                                redirect(`/storyteller/sessions/${session.id}`);
                              }}
                            >
                              <button className="rounded border px-2 py-1 text-xs">Complete Quest for All</button>
                            </form>
                            <form
                              action={async () => {
                                "use server";
                                await storytellerAssignQuestRewardsForAll({
                                  sessionId: session.id,
                                  questId: qId,
                                  questTitle: qTitle,
                                  allTaskIds: qTaskIds,
                                  taskDefs: qTasks.map((t: any) => ({
                                    id: String(t?.id ?? "").trim(),
                                    title: String(t?.title ?? "").trim(),
                                    kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
                                    target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
                                    target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
                                  })),
                                  rewardFaith: qRewardFaith,
                                  rewardItemIds: qRewardItemIds,
                                });
                                redirect(`/storyteller/sessions/${session.id}`);
                              }}
                            >
                              <button className="rounded border px-2 py-1 text-xs">Assign Rewards to All</button>
                            </form>
                          </div>
                        </div>
                        {qStorytellerNotes ? (
                          <div className="rounded border bg-amber-50 px-2 py-1 text-xs text-amber-900 whitespace-pre-wrap">
                            {qStorytellerNotes}
                          </div>
                        ) : null}
                        <div className="text-[11px] text-gray-600">
                          Players completed quest: {qCompletedPlayers}/{sessionCharacterIds.length || 0}
                        </div>
                        {qTasks.length ? (
                          <div className="space-y-1">
                            {qTasks.map((t: any) => {
                              const tId = String(t?.id ?? "").trim();
                              const tTitle = renderQuestTaskTitle(t);
                              const doneCount = qTaskDoneCounts.get(tId) ?? 0;
                              if (!tId) return null;
                              return (
                                <div key={tId} className="flex items-center justify-between gap-2 rounded border px-2 py-1 bg-white">
                                  <div className="text-xs">
                                    {tTitle}
                                    <span className="ml-2 text-[11px] text-gray-500">
                                      ({doneCount}/{sessionCharacterIds.length || 0})
                                    </span>
                                  </div>
                                  <form
                                    action={async () => {
                                      "use server";
                                      await storytellerCompleteQuestTaskForAll({
                                        sessionId: session.id,
                                        questId: qId,
                                        questTitle: qTitle,
                                        taskId: tId,
                                        allTaskIds: qTaskIds,
                                        taskDefs: qTasks.map((x: any) => ({
                                          id: String(x?.id ?? "").trim(),
                                          title: String(x?.title ?? "").trim(),
                                          kind: String(x?.kind ?? "").trim().toLowerCase() || "task",
                                          target_npc_block_id: String(x?.target_npc_block_id ?? "").trim() || null,
                                          target_npc_name: String(x?.target_npc_name ?? "").trim() || null,
                                        })),
                                        rewardFaith: qRewardFaith,
                                        rewardItemIds: qRewardItemIds,
                                      });
                                      redirect(`/storyteller/sessions/${session.id}`);
                                    }}
                                  >
                                    <SubmitGlowButton
                                      idleLabel="Mark Task Complete"
                                      pendingLabel="Marking..."
                                      className="rounded border px-2 py-0.5 text-[11px]"
                                    />
                                  </form>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs text-gray-600">No tasks configured.</div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-gray-600">No quests on this NPC.</div>
                )}
              </div>
            ) : null}
            <details className="rounded border bg-white p-2 space-y-2" open>
              <summary className="cursor-pointer text-[11px] uppercase text-gray-500">Player View Preview</summary>
              <div className="mt-2">
                {presentedBlock ? (
                  <>
                    {presentedBlock.image_url ? (
                      <div className="rounded border overflow-hidden bg-gray-100 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={presentedBlock.image_url}
                          alt={presentedBlock.title ?? "Presented"}
                          className="w-full max-h-56 object-cover"
                        />
                        {previewMapMarkers.map((m, i) => (
                          <div
                            key={m.id}
                            className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white bg-red-500/90 text-white text-[10px] font-bold flex items-center justify-center shadow"
                            style={{ left: `${m.x}%`, top: `${m.y}%` }}
                            title={m.label}
                          >
                            {i + 1}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {presentedBlock.body ? (
                      <div className="text-sm whitespace-pre-wrap text-gray-700">{presentedBlock.body}</div>
                    ) : (
                      <div className="text-sm text-gray-500">No body text on this presented block.</div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-500">Nothing presented to players yet.</div>
                )}
              </div>
            </details>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3 border rounded-xl p-4 space-y-3">
          <div>
            <div className="text-xs uppercase text-gray-500">Map / City</div>
            {stageMapBlock?.image_url ? (
              <form
                action={async () => {
                  "use server";
                  await presentBlockToPlayersAction(session.id, stageMapBlock.id);
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
                className="mt-2"
              >
                <button
                  type="submit"
                  className="group relative h-56 w-full rounded border overflow-hidden bg-gray-100 text-left"
                  title="Click to present this scene map to players"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stageMapBlock.image_url}
                    alt={stageMapBlock.title ?? "Scene map"}
                    className="w-full h-full object-cover"
                  />
                  {stageMapMarkers.map((m, i) => (
                    <div
                      key={m.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full border border-white bg-red-500/90 text-white text-[10px] font-bold flex items-center justify-center shadow"
                      style={{ left: `${m.x}%`, top: `${m.y}%` }}
                      title={m.label}
                    >
                      {i + 1}
                    </div>
                  ))}
                  <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-[11px] text-white">
                    Click map to present to players
                  </div>
                </button>
              </form>
            ) : (
              <div className="mt-2 h-56 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                No map in this scene
              </div>
            )}
          </div>
          <div>
            <div className="text-xs uppercase text-gray-500">NPC Portrait</div>
            {resolveBlockImageUrl(stageNpcBlock) ? (
              <div className="mt-2 h-56 rounded border overflow-hidden bg-gray-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resolveBlockImageUrl(stageNpcBlock) as string}
                  alt={stageNpcBlock?.title ?? "Presented"}
                  className="w-full h-full object-cover"
                />
              </div>
            ) : (
              <div className="mt-2 h-56 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                NPC image placeholder
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}

