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
  requestPassiveSavePrompt,
  approvePlayerRollRequest,
  declinePlayerRollRequest,
  storytellerSetHexFocus,
  storytellerClearHexFocus,
  storytellerResolveHexReward,
  storytellerStartEncounter,
  storytellerLockEncounterInitiative,
  storytellerAdvanceEncounterTurn,
  storytellerEndEncounter,
  storytellerMoveEncounterCombatant,
  storytellerUpdateEncounterCombatant,
  storytellerAddEncounterLogNote,
  storytellerRollEncounterAction,
} from "./actions";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { EpisodePicker } from "@/components/EpisodePicker";
import { presentBlockToPlayersAction, clearPresentedAction } from "@/app/actions/present";
import { randomUUID } from "crypto";
import SequenceRail from "@/components/episode-runtime/SequenceRail";
import RevealCard from "@/components/episode-runtime/RevealCard";
import CheckPromptCard from "@/components/episode-runtime/CheckPromptCard";
import NpcTabsCard from "@/components/episode-runtime/NpcTabsCard";
import { buildRuntimeSequence, extractHexMarkers, extractMapMarkers } from "@/lib/episodeRuntime";
import SubmitGlowButton from "@/components/ui/SubmitGlowButton";
import PlayersPassivePanel from "./PlayersPassivePanel";
import { parsePassiveEffectNotes } from "@/lib/passiveEffectNotes";
import QuestProgressAutoRefresh from "./QuestProgressAutoRefresh";
import { normalizeEncounterState } from "@/lib/encounter";
import StorytellerMonsterQuickRoller from "./StorytellerMonsterQuickRoller";




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

function StorytellerEncounterBoard(props: { encounter: any }) {
  const gridCols = Math.max(1, Number(props.encounter?.grid?.cols ?? 12));
  const gridRows = Math.max(1, Number(props.encounter?.grid?.rows ?? 12));
  const lineOpacity = Math.max(0.05, Math.min(1, Number(props.encounter?.grid?.line_opacity ?? 0.2) || 0.2));
  const currentTurn = props.encounter?.combatants?.[props.encounter?.turn_index ?? 0] ?? null;

  return (
    <div className="rounded border overflow-hidden bg-gray-100 relative">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={props.encounter.map_image_url} alt={props.encounter.title ?? "Encounter"} className="w-full h-auto block" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            `linear-gradient(to right, rgba(255,255,255,${lineOpacity}) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,${lineOpacity}) 1px, transparent 1px)`,
          backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
          backgroundPosition: `${Number(props.encounter?.grid?.offset_x ?? 0) || 0}px ${Number(props.encounter?.grid?.offset_y ?? 0) || 0}px`,
        }}
      />
      {(Array.isArray(props.encounter?.combatants) ? props.encounter.combatants : []).map((row: any) => {
        const x = Number.isFinite(Number(row?.x ?? NaN)) ? Number(row.x) : null;
        const y = Number.isFinite(Number(row?.y ?? NaN)) ? Number(row.y) : null;
        if (x == null || y == null) return null;
        const label = String(row?.name ?? row?.kind ?? "Unit").trim();
        const hpMax = Number(row?.hp_max ?? NaN);
        const hpCurrent = Number(row?.hp_current ?? NaN);
        const ratio = Number.isFinite(hpCurrent) && Number.isFinite(hpMax) && hpMax > 0 ? hpCurrent / hpMax : 1;
        const tone = ratio <= 0.25 ? "bg-red-500" : ratio <= 0.5 ? "bg-orange-500" : "bg-emerald-500";
        const imageUrl = String(row?.image_url ?? "").trim();
        const initials = label
          .split(/\s+/)
          .map((part: string) => part.slice(0, 1))
          .join("")
          .slice(0, 2)
          .toUpperCase();
        const isCurrent = currentTurn?.id === row.id && props.encounter?.status === "active";
        return (
          <div key={row.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${x}%`, top: `${y}%` }}>
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  "h-12 w-12 overflow-hidden rounded-full border-2 shadow",
                  row.kind === "player" ? "border-cyan-400 bg-cyan-950" : "border-white bg-neutral-900",
                  isCurrent ? "ring-2 ring-emerald-400" : "",
                ].join(" ")}
              >
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">{initials || "?"}</div>
                )}
              </div>
              <div className="rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">{label}</div>
              {Number.isFinite(hpCurrent) && Number.isFinite(hpMax) ? (
                <div className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
                  <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                </div>
              ) : null}
              {Array.isArray(row?.conditions) && row.conditions.length ? (
                <div className="max-w-[8rem] rounded bg-black/60 px-2 py-1 text-center text-[10px] text-white">
                  {row.conditions.join(", ")}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
      <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-white">
        {Math.max(1, Number(props.encounter?.grid?.feet_per_square ?? 5) || 5)} ft / square
      </div>
    </div>
  );
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
  if (t === "image") return "bg-cyan-100 text-cyan-800 border-cyan-200";
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

function toBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return fallback;
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off", "null", "undefined"].includes(v)) return false;
  }
  return fallback;
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
  const runtimeByNpcId = new Map<string, any>();
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
  const stageHexBlock =
    String(presentedBlock?.block_type ?? "").toLowerCase() === "hex_crawl" ? presentedBlock : null;
  const stageHexMarkers = stageHexBlock ? extractHexMarkers(stageHexBlock.meta) : [];
  const hexFocus = ((state as any)?.hex_focus ?? null) as Record<string, any> | null;
  const stageHexFocus =
    hexFocus && String(hexFocus?.block_id ?? "").trim() === String(stageHexBlock?.id ?? "").trim() ? hexFocus : null;
  const sceneAudioTracks = (() => {
    const meta = ((activeScene?.scene as any)?.meta ?? {}) as Record<string, any>;
    const fromSceneAudio = Array.isArray(meta.scene_audio)
      ? (meta.scene_audio as any[])
          .map((t: any, i: number) => ({
            id: String(t?.id ?? `track-${i + 1}`),
            title: String(t?.title ?? "").trim() || `Track ${i + 1}`,
            url: String(t?.url ?? "").trim(),
          }))
          .filter((t) => t.url)
      : [];
    if (fromSceneAudio.length) return fromSceneAudio;
    const fromUrls = Array.isArray(meta.scene_audio_urls)
      ? (meta.scene_audio_urls as any[])
          .map((u: any, i: number) => ({
            id: `track-${i + 1}`,
            title: `Track ${i + 1}`,
            url: String(u ?? "").trim(),
          }))
          .filter((t) => t.url)
      : [];
    return fromUrls;
  })();
  const previewType = String(presentedBlock?.block_type ?? "").toLowerCase();
  const previewIsMap = previewType === "map";
  const previewIsHex = previewType === "hex_crawl";
  const previewMapMarkers = previewIsMap ? extractMapMarkers(presentedBlock?.meta) : previewIsHex ? extractHexMarkers(presentedBlock?.meta) : [];
  const encounterState = normalizeEncounterState((state as any)?.encounter_state);
  const admin = createAdminClient() ?? supabase;
  const npcActionIdsForEncounter = Array.from(
    new Set(
      (encounterState?.combatants ?? [])
        .filter((row: any) => row.kind === "enemy")
        .flatMap((row: any) => {
          const npcId = String(row?.npc_id ?? "").trim();
          if (!npcId) return [];
          const runtimeMeta = runtimeByNpcId.get(npcId) ?? {};
          const runtimeTabs =
            episodeId &&
            runtimeMeta?.npc_tabs_by_episode &&
            typeof runtimeMeta.npc_tabs_by_episode === "object" &&
            runtimeMeta.npc_tabs_by_episode[episodeId]
              ? (runtimeMeta.npc_tabs_by_episode[episodeId] as Record<string, any>)
              : (runtimeMeta?.npc_tabs ?? {}) as Record<string, any>;
          const actionIds = Array.isArray(runtimeTabs?.training?.action_ids) ? runtimeTabs.training.action_ids : [];
          return actionIds.map((id: any) => String(id ?? "").trim()).filter(Boolean);
        })
    )
  );
  const npcActionsById = new Map<string, any>();
  if (npcActionIdsForEncounter.length) {
    const { data: npcActionRows } = await admin
      .from("actions")
      .select("id,name,summary,range_normal,range_max,uses_attack_roll,attack_bonus_override,damage_dice,damage_bonus,damage_type,save_ability,save_dc_override")
      .in("id", npcActionIdsForEncounter);
    for (const row of npcActionRows ?? []) {
      const id = String((row as any)?.id ?? "").trim();
      if (id) npcActionsById.set(id, row);
    }
  }
  const npcActionsByNpcId = new Map<string, any[]>();
  for (const row of encounterState?.combatants ?? []) {
    const npcId = String((row as any)?.npc_id ?? "").trim();
    if (!npcId || npcActionsByNpcId.has(npcId)) continue;
    const runtimeMeta = runtimeByNpcId.get(npcId) ?? {};
    const runtimeTabs =
      episodeId &&
      runtimeMeta?.npc_tabs_by_episode &&
      typeof runtimeMeta.npc_tabs_by_episode === "object" &&
      runtimeMeta.npc_tabs_by_episode[episodeId]
        ? (runtimeMeta.npc_tabs_by_episode[episodeId] as Record<string, any>)
        : (runtimeMeta?.npc_tabs ?? {}) as Record<string, any>;
    const actionIds = Array.isArray(runtimeTabs?.training?.action_ids) ? runtimeTabs.training.action_ids : [];
    npcActionsByNpcId.set(
      npcId,
      actionIds
        .map((id: any) => npcActionsById.get(String(id ?? "").trim()))
        .filter(Boolean)
    );
  }
  const carouselSceneIdx = presentedSceneIdx >= 0 ? presentedSceneIdx : scenes.length ? 0 : -1;
  const carouselScene = carouselSceneIdx >= 0 ? scenes[carouselSceneIdx] : null;
  const carouselSceneSteps = (carouselScene?.children ?? []).filter((c) => isPresentable(c));
  const carouselActiveStepIdx = presentedId ? carouselSceneSteps.findIndex((c) => c.id === presentedId) : -1;
  const carouselNextScene = carouselSceneIdx >= 0 ? scenes[carouselSceneIdx + 1] ?? null : null;
  const carouselNextSceneFirst =
    carouselNextScene?.children?.find((c) => isPresentable(c)) ?? null;
  const activeEncounterForPresentedBlock = Boolean(
    encounterState && presentedBlock && encounterState.encounter_block_id === String(presentedBlock.id) && encounterState.status !== "ended"
  );
  const encounterCurrentTurnId = String(encounterState?.combatants?.[encounterState?.turn_index ?? 0]?.id ?? "");
  const encounterEnemies = (encounterState?.combatants ?? []).filter((row: any) => row.kind === "enemy");
  const encounterPlayersOrdered = (encounterState?.combatants ?? []).filter((row: any) => row.kind === "player");
  const storytellerGuidance = (() => {
    if (!presentedBlock) return { script: "", notes: "" };
    const meta = (presentedBlock.meta ?? {}) as Record<string, any>;
    const kind = String(presentedBlock.block_type ?? "").toLowerCase();

    const explicitScript =
      String(meta.storyteller_script ?? "").trim() || String(meta.storyteller_text ?? "").trim() || String(meta.narrative ?? "").trim();
    const explicitNotes =
      String(meta.storyteller_notes ?? "").trim() ||
      String(meta.note ?? "").trim() ||
      String(meta.notes ?? "").trim() ||
      String(meta.dm_notes ?? "").trim() ||
      String(meta.gm_notes ?? "").trim();

    let script = explicitScript;
    let notes = explicitNotes;

    if (!script) {
      if (kind === "npc") script = "Read the NPC prompt and drive dialogue before assigning or progressing quests.";
      else if (kind === "map") script = "Describe what players see and ask how they approach it.";
      else if (kind === "hex_crawl") script = "Pick the hex marker players investigate, then run the check and decide reward timing.";
      else if (kind === "image") script = "Present the image, pause for player observations, then call for checks as needed.";
      else if (kind === "encounter") script = "Set initiative and run encounter pacing from this scene.";
    }

    if (!notes) {
      if (kind === "map") notes = "Use markers/reveals if players investigate specific details.";
      else if (kind === "hex_crawl") notes = "Use Focus Marker below to push a zoomed area and optional reward decision to players.";
      else if (kind === "image") notes = "Use this as a visual aid; keep challenge mechanics in Check Prompt and quest controls.";
    }

    return { script, notes };
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
  let sessionCharacterIds: string[] = [];
  const firstCharacterByUser = new Map<string, { id: string; name: string }>();
  if (sessionPlayerIds.length) {
    const { data: charRows } = await admin
      .from("characters")
      .select("id,user_id,name,created_at")
      .in("user_id", sessionPlayerIds)
      .order("created_at", { ascending: true });
    for (const row of charRows ?? []) {
      const userId = String((row as any)?.user_id ?? "").trim();
      const charId = String((row as any)?.id ?? "").trim();
      const charName = String((row as any)?.name ?? "").trim();
      if (!userId || !charId || firstCharacterByUser.has(userId)) continue;
      firstCharacterByUser.set(userId, { id: charId, name: charName || "Adventurer" });
    }
    sessionCharacterIds = sessionPlayerIds
      .map((id) => firstCharacterByUser.get(id)?.id ?? "")
      .filter((id) => Boolean(id));
  }
  const inventoryByCharacter = new Map<string, Array<{ item_id: string; equipped: boolean; name?: string }>>();
  const itemIdsForPassives = new Set<string>();
  if (sessionCharacterIds.length) {
    const { data: invRows } = await admin
      .from("inventory_items")
      .select("character_id,item_id,equipped,name")
      .in("character_id", sessionCharacterIds);
    for (const row of invRows ?? []) {
      const characterId = String((row as any)?.character_id ?? "").trim();
      const itemId = String((row as any)?.item_id ?? "").trim();
      if (!characterId || !itemId) continue;
      const list = inventoryByCharacter.get(characterId) ?? [];
      list.push({
        item_id: itemId,
        equipped: Boolean((row as any)?.equipped),
        name: String((row as any)?.name ?? "").trim() || undefined,
      });
      inventoryByCharacter.set(characterId, list);
      itemIdsForPassives.add(itemId);
    }
  }
  const passiveEffectsByItem = new Map<string, Array<{ mode: string; notes: string }>>();
  if (itemIdsForPassives.size) {
    const ids = Array.from(itemIdsForPassives);
    const { data: effectRows } = await admin
      .from("item_effects")
      .select("item_id,mode,notes,effect_type")
      .in("item_id", ids)
      .eq("effect_type", "passive");
    for (const row of effectRows ?? []) {
      const itemId = String((row as any)?.item_id ?? "").trim();
      if (!itemId) continue;
      const list = passiveEffectsByItem.get(itemId) ?? [];
      list.push({
        mode: String((row as any)?.mode ?? "").trim().toLowerCase() || "equipped",
        notes: String((row as any)?.notes ?? "").trim(),
      });
      passiveEffectsByItem.set(itemId, list);
    }
  }
  const itemNameById = new Map<string, string>();
  if (itemIdsForPassives.size) {
    const { data: itemRows } = await admin
      .from("items")
      .select("id,name")
      .in("id", Array.from(itemIdsForPassives));
    for (const row of itemRows ?? []) {
      const id = String((row as any)?.id ?? "").trim();
      const name = String((row as any)?.name ?? "").trim();
      if (id && name) itemNameById.set(id, name);
    }
  }
  const storytellerPlayers = sessionPlayerIds.map((playerId) => {
    const char = firstCharacterByUser.get(playerId);
    const charId = char?.id ?? "";
    const inv = inventoryByCharacter.get(charId) ?? [];
    const ownedIds = new Set(inv.map((r) => r.item_id));
    const equippedIds = new Set(inv.filter((r) => r.equipped).map((r) => r.item_id));
    const passives: Array<{
      source: string;
      playerText: string;
      storytellerText?: string;
      mode?: string;
      saveTriggerEnabled?: boolean;
    }> = [];
    for (const itemId of ownedIds) {
      const effects = passiveEffectsByItem.get(itemId) ?? [];
      for (const ef of effects) {
        const mode = ef.mode === "owned" ? "owned" : "equipped";
        const isActive = mode === "owned" ? ownedIds.has(itemId) : equippedIds.has(itemId);
        if (!isActive) continue;
        const parsed = parsePassiveEffectNotes(ef.notes);
        passives.push({
          source: itemNameById.get(itemId) ?? inv.find((r) => r.item_id === itemId)?.name ?? "Item",
          playerText: parsed.playerText || "-",
          storytellerText: parsed.storytellerText || undefined,
          mode,
          saveTriggerEnabled: Boolean(parsed.saveTriggerEnabled),
        });
      }
    }
    return {
      playerId,
      characterId: charId || undefined,
      characterName: char?.name || undefined,
      passives,
    };
  });
  const playerLabelById = new Map<string, string>();
  for (const p of storytellerPlayers) {
    const pid = String((p as any)?.playerId ?? "").trim();
    if (!pid) continue;
    const label = String((p as any)?.characterName ?? "").trim() || `Player ${pid.slice(0, 8)}`;
    playerLabelById.set(pid, label);
  }
  const pendingRollRequests = (Array.isArray((state as any)?.roll_requests) ? ((state as any).roll_requests as any[]) : [])
    .map((r: any) => ({
      id: String(r?.id ?? "").trim(),
      playerId: String(r?.player_id ?? "").trim(),
      checkKey: String(r?.check_key ?? "").trim() || "Check",
      message: String(r?.message ?? "").trim() || null,
      status: String(r?.status ?? "pending").trim().toLowerCase(),
      createdAt: String(r?.created_at ?? "").trim() || null,
    }))
    .filter((r) => r.id && r.playerId && r.status === "pending")
    .map((r) => ({
      ...r,
      playerLabel: playerLabelById.get(r.playerId) ?? `Player ${r.playerId.slice(0, 8)}`,
    }))
    .sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  const currentRollRows = Object.entries((((state as any)?.roll_results ?? {}) as Record<string, any>) || {})
    .map(([playerId, row]) => ({
      playerId: String(playerId ?? "").trim(),
      total: Number(
        (row as any)?.total ??
        (row as any)?.value ??
        NaN
      ),
    }))
    .filter((r) => r.playerId && Number.isFinite(r.total));
  const highestRollRow = currentRollRows.length
    ? currentRollRows.reduce((best, cur) => (cur.total > best.total ? cur : best))
    : null;
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
  const characterNameById = new Map<string, string>();
  for (const [, ch] of firstCharacterByUser.entries()) {
    if (ch?.id) characterNameById.set(ch.id, ch.name || "Adventurer");
  }
  let sessionQuestRows: any[] = [];
  if (sessionCharacterIds.length) {
    const { data: allQuestRows } = await admin
      .from("player_quest_progress")
      .select("character_id,quest_id,quest_title,status,reward_meta,updated_at")
      .in("character_id", sessionCharacterIds)
      .eq("status", "active");
    sessionQuestRows = (allQuestRows ?? []) as any[];
  }
  const groupQuestById = new Map<
    string,
    { questId: string; title: string; players: Array<{ name: string; status: string; updatedAt?: string | null }> }
  >();
  const individualQuestByPlayer = new Map<string, Array<{ questId: string; title: string; status: string }>>();
  for (const row of sessionQuestRows) {
    const questId = String((row as any)?.quest_id ?? "").trim();
    const characterId = String((row as any)?.character_id ?? "").trim();
    if (!questId || !characterId) continue;
    const title = String((row as any)?.quest_title ?? "").trim() || questId;
    const status = String((row as any)?.status ?? "active").trim().toLowerCase();
    const playerName = characterNameById.get(characterId) ?? "Adventurer";
    const isGroup = toBool((row as any)?.reward_meta?.storyteller_controlled, false);
    if (isGroup) {
      const existing = groupQuestById.get(questId) ?? { questId, title, players: [] };
      existing.players.push({
        name: playerName,
        status,
        updatedAt: String((row as any)?.updated_at ?? "").trim() || null,
      });
      groupQuestById.set(questId, existing);
    } else {
      const existing = individualQuestByPlayer.get(characterId) ?? [];
      existing.push({ questId, title, status });
      individualQuestByPlayer.set(characterId, existing);
    }
  }
  const groupQuestCards = Array.from(groupQuestById.values()).sort((a, b) => a.title.localeCompare(b.title));
  for (const card of groupQuestCards) {
    card.players.sort((a, b) => a.name.localeCompare(b.name));
  }
  const individualQuestCards = Array.from(individualQuestByPlayer.entries())
    .map(([characterId, quests]) => ({
      characterId,
      playerName: characterNameById.get(characterId) ?? "Adventurer",
      quests: [...quests].sort((a, b) => a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));
  const activeQuestIdsByCharacter = new Map<string, Set<string>>();
  for (const row of sessionQuestRows) {
    const cid = String((row as any)?.character_id ?? "").trim();
    const qid = String((row as any)?.quest_id ?? "").trim();
    const st = String((row as any)?.status ?? "").trim().toLowerCase();
    if (!cid || !qid || st !== "active") continue;
    const set = activeQuestIdsByCharacter.get(cid) ?? new Set<string>();
    set.add(qid);
    activeQuestIdsByCharacter.set(cid, set);
  }
  const focusedRequiredQuestIds = Array.from(
    new Set(
      (Array.isArray(stageHexFocus?.required_quest_ids) ? (stageHexFocus?.required_quest_ids as any[]) : [])
        .map((v: any) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
  const questGlowPlayerIds = focusedRequiredQuestIds.length
    ? storytellerPlayers
        .filter((p: any) => {
          const cid = String(p?.characterId ?? "").trim();
          if (!cid) return false;
          const activeSet = activeQuestIdsByCharacter.get(cid);
          if (!activeSet) return false;
          return focusedRequiredQuestIds.some((q) => activeSet.has(q));
        })
        .map((p: any) => String(p.playerId ?? "").trim())
        .filter(Boolean)
    : [];
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
      <QuestProgressAutoRefresh sessionId={sessionId} characterIds={sessionCharacterIds} />
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
          <PlayersPassivePanel
            sessionId={sessionId}
            joins={joins as any[]}
            initialState={state as any}
            players={storytellerPlayers as any[]}
            questGlowPlayerIds={questGlowPlayerIds}
            onRequestSave={async (fd) => {
              "use server";
              const playerId = String(fd.get("player_id") ?? "").trim();
              const checkKey = String(fd.get("check_key") ?? "WIS").trim().toUpperCase();
              const source = String(fd.get("source") ?? "").trim();
              const defaultInstruction = String(fd.get("default_instruction") ?? "").trim();
              const dcRaw = String(fd.get("dc") ?? "").trim();
              const dc = Number(dcRaw);
              await requestPassiveSavePrompt({
                sessionId: session.id,
                playerId,
                checkKey,
                dc: Number.isFinite(dc) ? dc : null,
                passiveSource: source,
                instruction: defaultInstruction || undefined,
              });
              redirect(`/storyteller/sessions/${session.id}`);
            }}
          />
          <div className="mt-3 rounded border bg-gray-50 p-2 space-y-2 max-h-64 overflow-y-auto">
            <div className="text-xs uppercase text-gray-500">Active Quests</div>
            <div className="rounded border bg-white p-2 space-y-1">
              <div className="text-[11px] uppercase text-gray-500">Group Quests</div>
              {groupQuestCards.length ? (
                groupQuestCards.map((q) => (
                  <div key={`g-${q.questId}`} className="rounded border bg-gray-50 px-2 py-1">
                    <div className="text-xs font-semibold">{q.title}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {q.players.map((p) => (
                        <span key={`${q.questId}-${p.name}`} className="rounded border bg-white px-1.5 py-0.5 text-[11px]">
                          {p.name} - {p.status}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-500">No active group quests.</div>
              )}
            </div>
            <div className="rounded border bg-white p-2 space-y-1">
              <div className="text-[11px] uppercase text-gray-500">Individual Quests</div>
              {individualQuestCards.length ? (
                individualQuestCards.map((player) => (
                  <div key={`i-${player.characterId}`} className="rounded border bg-gray-50 px-2 py-1">
                    <div className="text-xs font-semibold">{player.playerName}</div>
                    <div className="mt-1 space-y-1">
                      {player.quests.map((q) => (
                        <div key={`${player.characterId}-${q.questId}`} className="text-[11px] text-gray-700">
                          {q.title} - {q.status}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-500">No active individual quests.</div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-6 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Stage</div>
          <div className="mt-2 rounded border bg-gray-50 p-3 space-y-3 max-h-[70vh] overflow-y-auto">
            {activeScene?.scene?.id && sceneAudioTracks.length ? (
              <div className="rounded border bg-white p-2 space-y-2">
                <div className="text-[11px] uppercase text-gray-500">Scene Music</div>
                <audio
                  controls
                  preload="none"
                  src={String(sceneAudioTracks[0]?.url ?? "")}
                  className="w-full"
                />
                {sceneAudioTracks.length > 1 ? (
                  <details className="rounded border bg-gray-50 p-2">
                    <summary className="cursor-pointer text-xs">Playlist ({sceneAudioTracks.length})</summary>
                    <div className="mt-2 space-y-1">
                      {sceneAudioTracks.map((t, i) => (
                        <div key={`scene-audio-${i}`} className="text-xs truncate">
                          {i + 1}. {String(t.title ?? `Track ${i + 1}`)}
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ) : null}
            {activeEncounterForPresentedBlock ? (
              <div className="rounded border bg-white p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] uppercase text-gray-500">Encounter Director</div>
                    <div className="text-sm font-semibold">{encounterState?.title ?? presentedBlock?.title ?? "Encounter"}</div>
                    <div className="text-xs text-gray-600">
                      {encounterState?.status === "initiative_pending"
                        ? "Initiative pending"
                        : `Round ${encounterState?.round ?? 1} | Current turn: ${String(encounterState?.combatants?.[encounterState?.turn_index ?? 0]?.name ?? "n/a")}`}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {encounterState?.status === "initiative_pending" ? (
                      <form
                        action={async () => {
                          "use server";
                          await storytellerLockEncounterInitiative({ sessionId: session.id });
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Lock Initiative</button>
                      </form>
                    ) : null}
                    {encounterState?.status === "active" ? (
                      <form
                        action={async () => {
                          "use server";
                          await storytellerAdvanceEncounterTurn({ sessionId: session.id });
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Next Turn</button>
                      </form>
                    ) : null}
                    <form
                      action={async () => {
                        "use server";
                        await storytellerEndEncounter({ sessionId: session.id });
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <button className="rounded border px-2 py-1 text-xs text-red-700">End Encounter</button>
                    </form>
                  </div>
                </div>

                <div className="rounded border bg-slate-50 p-3">
                  <div className="text-[11px] uppercase text-gray-500">NPCs In Initiative Order</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {encounterEnemies.map((row: any) => (
                      <div
                        key={`enemy-card-${row.id}`}
                        className={[
                          "rounded border bg-white p-3 space-y-2",
                          encounterCurrentTurnId === String(row.id) ? "border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.25),0_0_20px_rgba(59,130,246,0.2)]" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{row.name}</div>
                            <div className="text-xs text-gray-600">
                              HP {row.hp_current ?? "?"}/{row.hp_max ?? "?"} | AC {row.defense ?? "?"}
                            </div>
                            {Array.isArray(row.conditions) && row.conditions.length ? (
                              <div className="mt-1 text-[11px] text-gray-600">{row.conditions.join(", ")}</div>
                            ) : null}
                          </div>
                          {encounterCurrentTurnId === String(row.id) ? (
                            <div className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-800">Current Turn</div>
                          ) : null}
                        </div>

                        <StorytellerMonsterQuickRoller
                          sessionId={session.id}
                          combatantId={String(row.id)}
                          combatantName={String(row.name ?? "Monster")}
                          combatants={(encounterState?.combatants ?? []).map((c: any) => ({
                            id: String(c?.id ?? ""),
                            name: String(c?.name ?? ""),
                            defense: Number.isFinite(Number(c?.defense ?? NaN)) ? Number(c.defense) : null,
                          }))}
                          actionOptions={npcActionsByNpcId.get(String(row.npc_id ?? "").trim()) ?? []}
                        />

                        <div className="grid gap-2 md:grid-cols-2">
                          <form
                            className="grid grid-cols-2 gap-2 rounded border bg-gray-50 p-2"
                            action={async (fd) => {
                              "use server";
                              await storytellerMoveEncounterCombatant({
                                sessionId: session.id,
                                combatantId: String(fd.get("combatant_id") ?? ""),
                                x: Number(fd.get("x") ?? 0),
                                y: Number(fd.get("y") ?? 0),
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <input type="hidden" name="combatant_id" value={row.id} />
                            <div className="col-span-2 text-[11px] uppercase text-gray-500">Move</div>
                            <input name="x" defaultValue={row.x ?? 0} className="rounded border px-2 py-1 text-xs" placeholder="X %" />
                            <input name="y" defaultValue={row.y ?? 0} className="rounded border px-2 py-1 text-xs" placeholder="Y %" />
                            <button className="col-span-2 rounded border px-2 py-1 text-xs">Move Token</button>
                          </form>

                          <form
                            className="grid grid-cols-2 gap-2 rounded border bg-gray-50 p-2"
                            action={async (fd) => {
                              "use server";
                              const conditions = String(fd.get("conditions") ?? "")
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean);
                              await storytellerUpdateEncounterCombatant({
                                sessionId: session.id,
                                combatantId: String(fd.get("combatant_id") ?? ""),
                                hpCurrent: Number(fd.get("hp_current") ?? 0),
                                defense: String(fd.get("defense") ?? "").trim() ? Number(fd.get("defense")) : null,
                                conditions,
                                note: String(fd.get("note") ?? ""),
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <input type="hidden" name="combatant_id" value={row.id} />
                            <div className="col-span-2 text-[11px] uppercase text-gray-500">Stats</div>
                            <input name="hp_current" defaultValue={row.hp_current ?? ""} className="rounded border px-2 py-1 text-xs" placeholder="HP current" />
                            <input name="defense" defaultValue={row.defense ?? ""} className="rounded border px-2 py-1 text-xs" placeholder="Defense" />
                            <input
                              name="conditions"
                              defaultValue={Array.isArray(row.conditions) ? row.conditions.join(", ") : ""}
                              className="col-span-2 rounded border px-2 py-1 text-xs"
                              placeholder="Conditions, comma separated"
                            />
                            <input name="note" className="col-span-2 rounded border px-2 py-1 text-xs" placeholder="Optional combat note" />
                            <button className="col-span-2 rounded border px-2 py-1 text-xs">Update NPC</button>
                          </form>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded border bg-white p-2">
                  <StorytellerEncounterBoard encounter={encounterState} />
                </div>

                <div className="rounded border bg-cyan-50 p-3">
                  <div className="text-[11px] uppercase text-gray-500">Players In Initiative Order</div>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {encounterPlayersOrdered.map((row: any) => (
                      <div
                        key={`player-card-${row.id}`}
                        className={[
                          "rounded border bg-white p-3",
                          encounterCurrentTurnId === String(row.id) ? "border-blue-400 shadow-[0_0_0_2px_rgba(59,130,246,0.25),0_0_20px_rgba(59,130,246,0.2)]" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">{row.name}</div>
                            <div className="text-xs text-gray-600">
                              HP {row.hp_current ?? "?"}/{row.hp_max ?? "?"} | AC {row.defense ?? "?"} | Init {row.initiative_total ?? "—"}
                            </div>
                            {Array.isArray(row.conditions) && row.conditions.length ? (
                              <div className="mt-1 text-[11px] text-gray-600">{row.conditions.join(", ")}</div>
                            ) : null}
                          </div>
                          {encounterCurrentTurnId === String(row.id) ? (
                            <div className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold text-blue-800">Current Turn</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {encounterState?.combat_log?.length ? (
                  <div className="rounded border bg-gray-50 p-2 text-xs text-gray-700 space-y-1">
                    <div className="text-[11px] uppercase text-gray-500">Combat Log</div>
                    {encounterState.combat_log.slice().reverse().map((entry: any) => (
                      <div key={entry.id} className="rounded border bg-white px-2 py-1">
                        <div className="text-[10px] uppercase text-gray-400">{entry.type}</div>
                        <div>{entry.text}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {!activeEncounterForPresentedBlock ? (
            <details className="rounded border bg-white p-2 space-y-2" open>
              <summary className="cursor-pointer text-[11px] uppercase text-gray-500">Player View Preview</summary>
              <div className="mt-2">
                {presentedBlock ? (
                  <>
                    {presentedBlock.image_url && !(encounterState && encounterState.encounter_block_id === String(presentedBlock.id) && encounterState.status !== "ended") ? (
                      <div className="rounded border overflow-hidden bg-gray-100 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={presentedBlock.image_url}
                          alt={presentedBlock.title ?? "Presented"}
                          className="w-full h-auto block"
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
                    {encounterState && encounterState.encounter_block_id === String(presentedBlock.id) && encounterState.status !== "ended" ? (
                      <StorytellerEncounterBoard encounter={encounterState} />
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
            ) : null}
            <div className="rounded border bg-white p-2 space-y-1">
              <div className="text-[11px] uppercase text-gray-500">Storyteller Direction</div>
              {presentedBlock ? (
                <>
                  <div className="text-sm font-semibold">
                    {presentedBlock.title ?? presentedBlock.block_type ?? "Presented"}
                  </div>
                  <div className="mt-1 rounded border border-green-200 bg-green-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase text-green-800">Script</div>
                    <div className="text-sm whitespace-pre-wrap text-green-900">
                      {storytellerGuidance.script || "No read-aloud script on this block yet."}
                    </div>
                  </div>
                  <div className="mt-1 rounded border border-orange-200 bg-orange-50 px-2 py-1.5">
                    <div className="text-[10px] uppercase text-orange-800">ST Notes</div>
                    <div className="text-sm whitespace-pre-wrap text-orange-900">
                      {storytellerGuidance.notes || "No private guidance notes on this block yet."}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-500">Nothing presented to players yet.</div>
              )}
            </div>
            {stageHexBlock ? (
              <div className="rounded border bg-white p-2 space-y-2">
                <div className="text-[11px] uppercase text-gray-500">Hex Director (Live)</div>
                {stageHexMarkers.length ? (
                  <div className="space-y-1.5">
                    {stageHexMarkers.map((m) => {
                      const prompts = Array.isArray((m as any).checkPrompts) && (m as any).checkPrompts.length
                        ? ((m as any).checkPrompts as any[])
                        : String(m.checkKey ?? "").trim()
                          ? [{
                              id: "legacy",
                              checkKey: String(m.checkKey ?? "").trim(),
                              dc: Number(m.checkDc ?? NaN),
                              storytellerScript: "",
                            }]
                          : [];
                      const currentPromptText = String((state as any)?.roll_prompt ?? "");
                      const rollOpenNow = Boolean((state as any)?.roll_open);
                      const markerLabel = String(m.label ?? "Hex");
                      const markerHasActivePrompt =
                        rollOpenNow && currentPromptText.toLowerCase().includes(`context: ${markerLabel}`.toLowerCase());
                      const isFocusedMarker = String(stageHexFocus?.marker_id ?? "") === String(m.id);
                      return (
                        <details
                          key={m.id}
                          className={`rounded border ${isFocusedMarker || markerHasActivePrompt ? "border-green-400 bg-green-50" : "bg-gray-50"}`}
                          open={markerHasActivePrompt || isFocusedMarker}
                        >
                          <summary className="cursor-pointer px-2 py-1.5 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">{m.label}</div>
                              <div className="text-[11px] text-gray-600">
                                {prompts.length
                                  ? `${prompts.length} prompt${prompts.length === 1 ? "" : "s"}`
                                  : "No check prompts"}
                              </div>
                            </div>
                            {isFocusedMarker ? <span className="rounded border bg-white px-1.5 py-0.5 text-[10px]">Focused</span> : null}
                          </summary>
                          <div className="border-t bg-white p-2 space-y-2">
                            <form
                              action={async () => {
                                "use server";
                                await storytellerSetHexFocus({
                                  sessionId: session.id,
                                  blockId: String(stageHexBlock.id),
                                  markerId: String(m.id),
                                  label: String(m.label ?? ""),
                                  focusImageUrl: String(m.focusImageUrl ?? ""),
                                  checkKey: String(m.checkKey ?? ""),
                                  checkDc: Number(m.checkDc ?? NaN),
                                  rewardItemIds: Array.isArray(m.rewardItemIds) ? m.rewardItemIds : [],
                                  requiredQuestIds: Array.isArray((m as any).requiredQuestIds) ? (m as any).requiredQuestIds : [],
                                  playerText: String(m.playerText ?? ""),
                                  storytellerNotes: String(m.storytellerNotes ?? ""),
                                  checkPrompts: Array.isArray((m as any).checkPrompts)
                                    ? (m as any).checkPrompts.map((p: any) => ({
                                        id: String(p?.id ?? ""),
                                        label: String(p?.label ?? ""),
                                        checkKey: String(p?.checkKey ?? ""),
                                        dc: Number(p?.dc ?? NaN),
                                        storytellerScript: String(p?.storytellerScript ?? ""),
                                        notes: String(p?.notes ?? ""),
                                    }))
                                    : [],
                                  rollOutcomes: Array.isArray((m as any).rollOutcomes)
                                    ? (m as any).rollOutcomes.map((o: any) => ({
                                        id: String(o?.id ?? ""),
                                        minRoll: Number(o?.minRoll ?? NaN),
                                        maxRoll: Number(o?.maxRoll ?? NaN),
                                        label: String(o?.label ?? ""),
                                        storytellerScript: String(o?.storytellerScript ?? ""),
                                        notes: String(o?.notes ?? ""),
                                      }))
                                    : [],
                                });
                                redirect(`/storyteller/sessions/${session.id}`);
                              }}
                            >
                              <button className="rounded border px-2 py-1 text-xs">Focus This Hex</button>
                            </form>
                            {prompts.length ? (
                              <div className="space-y-2">
                                {prompts.map((p: any) => {
                                  const checkKey = String(p?.checkKey ?? "").trim();
                                  const promptLabel = String(p?.label ?? "").trim();
                                  const dcNum = Number(p?.dc ?? NaN);
                                  const hasDc = Number.isFinite(dcNum) && dcNum > 0;
                                  const stScript = String(p?.storytellerScript ?? "").trim();
                                  const promptActive =
                                    rollOpenNow &&
                                    currentPromptText.toLowerCase().includes(`${checkKey} check`.toLowerCase()) &&
                                    currentPromptText.toLowerCase().includes(`context: ${markerLabel}`.toLowerCase());
                                  return (
                                    <div key={`${m.id}-${String(p?.id ?? checkKey)}`} className="rounded border bg-gray-50 p-2 space-y-1">
                                      <div className="text-xs font-semibold">
                                        {promptLabel ? `${promptLabel} - ` : ""}
                                        {checkKey || "Check"}{hasDc ? ` (DC ${Math.max(0, Math.floor(dcNum))})` : ""}
                                      </div>
                                      {stScript ? (
                                        <div className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-900 whitespace-pre-wrap">
                                          {stScript}
                                        </div>
                                      ) : null}
                                      <div className="flex flex-wrap items-center gap-2">
                                        <form
                                          action={async () => {
                                            "use server";
                                            if (!checkKey) {
                                              redirect(`/storyteller/sessions/${session.id}`);
                                            }
                                            const prompt = [
                                              "Roll Request",
                                              `${checkKey} check${hasDc ? ` (DC ${Math.max(0, Math.floor(dcNum))})` : ""}.`,
                                              `Click ${checkKey} in your sheet and report your total.`,
                                              `Context: ${String(m.label ?? "Hex")}.`,
                                            ]
                                              .filter(Boolean)
                                              .join(" ");
                                            await updateState(session.id, {
                                              roll_open: true,
                                              roll_die: "d20",
                                              roll_prompt: prompt,
                                              roll_target: "all",
                                              roll_round_id: randomUUID(),
                                              roll_results: {},
                                            });
                                            redirect(`/storyteller/sessions/${session.id}`);
                                          }}
                                        >
                                          <button className="rounded border px-2 py-1 text-[11px]">Prompt {checkKey}</button>
                                        </form>
                                        {promptActive ? (
                                          <>
                                            <span className="rounded border bg-white px-2 py-1 text-[11px]">
                                              Winner: {highestRollRow?.playerId
                                                ? (playerLabelById.get(highestRollRow.playerId) ?? highestRollRow.playerId.slice(0, 8))
                                                : "waiting"}
                                              {" | "}Roll: {Number.isFinite(Number(highestRollRow?.total ?? NaN)) ? String(highestRollRow?.total) : "-"}
                                              {hasDc ? ` vs DC ${Math.max(0, Math.floor(dcNum))}` : ""}
                                            </span>
                                            <form
                                              action={async () => {
                                                "use server";
                                                await updateState(session.id, {
                                                  roll_open: false,
                                                  roll_prompt: "",
                                                  roll_target: "all",
                                                  roll_round_id: null,
                                                  roll_results: {},
                                                });
                                                redirect(`/storyteller/sessions/${session.id}`);
                                              }}
                                            >
                                              <button className="rounded border px-2 py-1 text-[11px]">Clear Prompt</button>
                                            </form>
                                          </>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500">No check prompts configured for this marker.</div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                    <form
                      action={async () => {
                        "use server";
                        await storytellerClearHexFocus({ sessionId: session.id });
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <button className="rounded border px-2 py-1 text-xs">Clear Focus</button>
                    </form>
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">No hex markers configured on this block yet.</div>
                )}

                {stageHexFocus ? (
                  <div className="rounded border bg-gray-50 p-2 space-y-2">
                    <div className="text-xs font-semibold">
                      Active Hex: {String(stageHexFocus.label ?? "Hex")}
                    </div>
                    {String(stageHexFocus.storyteller_notes ?? "").trim() ? (
                      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900 whitespace-pre-wrap">
                        {String(stageHexFocus.storyteller_notes)}
                      </div>
                    ) : null}
                    <div className="text-[11px] text-gray-700">
                      Check: {String(stageHexFocus.check_key ?? "").trim() || "n/a"}
                      {Number.isFinite(Number(stageHexFocus.check_dc ?? NaN))
                        ? ` | DC ${Math.max(0, Math.floor(Number(stageHexFocus.check_dc)))}`
                        : ""}
                    </div>
                    {(() => {
                      const outcomes = Array.isArray(stageHexFocus.roll_outcomes) ? (stageHexFocus.roll_outcomes as any[]) : [];
                      if (!outcomes.length) return null;
                      const topTotal = Number(highestRollRow?.total ?? NaN);
                      const matchedId = Number.isFinite(topTotal)
                        ? String(
                            outcomes.find((o: any) => {
                              const min = Number(o?.min_roll ?? NaN);
                              const max = Number(o?.max_roll ?? NaN);
                              const minOk = Number.isFinite(min) ? topTotal >= min : true;
                              const maxOk = Number.isFinite(max) ? topTotal <= max : true;
                              return minOk && maxOk;
                            })?.id ?? ""
                          )
                        : "";
                      return (
                        <div className="rounded border bg-white p-2 space-y-1">
                          <div className="text-[11px] uppercase text-gray-500">Roll Outcomes</div>
                          <div className="text-[11px] text-gray-600">
                            Highest roll now: {Number.isFinite(topTotal) ? String(topTotal) : "none yet"}
                            {highestRollRow?.playerId ? ` (${playerLabelById.get(highestRollRow.playerId) ?? highestRollRow.playerId.slice(0, 8)})` : ""}
                          </div>
                          <div className="space-y-1">
                            {outcomes.map((o: any, i: number) => {
                              const rowId = String(o?.id ?? `outcome-${i + 1}`);
                              const isMatch = Boolean(matchedId) && matchedId === rowId;
                              const min = Number(o?.min_roll ?? NaN);
                              const max = Number(o?.max_roll ?? NaN);
                              return (
                                <div
                                  key={rowId}
                                  className={`rounded border px-2 py-1 ${isMatch ? "border-green-400 bg-green-50" : "bg-gray-50"}`}
                                >
                                  <div className="text-xs font-semibold">
                                    {String(o?.label ?? `Outcome ${i + 1}`)}
                                    <span className="ml-2 font-normal text-gray-600">
                                      [{Number.isFinite(min) ? min : "-"} to {Number.isFinite(max) ? max : "-"}]
                                    </span>
                                    {isMatch ? <span className="ml-2 text-green-700">MATCH</span> : null}
                                  </div>
                                  {String(o?.storyteller_script ?? "").trim() ? (
                                    <div className="text-xs text-gray-800 whitespace-pre-wrap">
                                      {String(o.storyteller_script)}
                                    </div>
                                  ) : null}
                                  {String(o?.notes ?? "").trim() ? (
                                    <div className="text-[11px] text-amber-800 whitespace-pre-wrap">
                                      Note: {String(o.notes)}
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="text-[11px] text-gray-700">
                      Reward status: {String(stageHexFocus.reward_status ?? "pending")}
                    </div>
                    {focusedRequiredQuestIds.length ? (
                      <div className="text-[11px] text-gray-700">
                        Required active quest IDs: {focusedRequiredQuestIds.join(", ")}
                      </div>
                    ) : null}
                    {focusedRequiredQuestIds.length ? (
                      <div className="text-[11px] text-amber-800">
                        Eligible players now: {questGlowPlayerIds.length}
                      </div>
                    ) : null}
                    {Array.isArray(stageHexFocus.reward_item_ids) && stageHexFocus.reward_item_ids.length ? (
                      <div className="space-y-1">
                        <div className="text-[11px] text-gray-700">
                          Reward item IDs: {stageHexFocus.reward_item_ids.join(", ")}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <form
                            action={async () => {
                              "use server";
                              await storytellerResolveHexReward({
                                sessionId: session.id,
                                decision: "grant",
                                targetMode: "highest_roll",
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <button className="rounded border px-2 py-1 text-xs">Grant (Highest Roll)</button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              await storytellerResolveHexReward({
                                sessionId: session.id,
                                decision: "grant",
                                targetMode: "all_eligible",
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <button className="rounded border px-2 py-1 text-xs">
                              Grant to Eligible
                            </button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              await storytellerResolveHexReward({
                                sessionId: session.id,
                                decision: "grant",
                                targetMode: "all_joined",
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <button className="rounded border px-2 py-1 text-xs">
                              Grant to All Joined
                            </button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              await storytellerResolveHexReward({
                                sessionId: session.id,
                                decision: "hold",
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <button className="rounded border px-2 py-1 text-xs">Hold</button>
                          </form>
                          <form
                            action={async () => {
                              "use server";
                              await storytellerResolveHexReward({
                                sessionId: session.id,
                                decision: "skip",
                              });
                              redirect(`/storyteller/sessions/${session.id}`);
                            }}
                          >
                            <button className="rounded border px-2 py-1 text-xs">Skip</button>
                          </form>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {storytellerPlayers.map((p) => (
                            <form
                              key={`hex-grant-${p.playerId}`}
                              action={async () => {
                                "use server";
                                await storytellerResolveHexReward({
                                  sessionId: session.id,
                                  decision: "grant",
                                  targetMode: "manual",
                                  playerId: p.playerId,
                                });
                                redirect(`/storyteller/sessions/${session.id}`);
                              }}
                            >
                              <button className="rounded border px-2 py-1 text-[11px]">
                                Grant to {playerLabelById.get(p.playerId) ?? p.playerId.slice(0, 8)}
                              </button>
                            </form>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600">No reward item configured on this marker.</div>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">No focused hex selected yet.</div>
                )}
              </div>
            ) : null}
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
            {activeEncounterForPresentedBlock ? (
              <details className="rounded border bg-white p-2 space-y-2">
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
                            className="w-full h-auto block"
                          />
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
            ) : null}
          </div>
        </div>

        <div className="col-span-12 lg:col-span-3 border rounded-xl p-4 space-y-3">
          <div className="rounded border bg-white p-3 space-y-2">
            <div className="text-xs uppercase text-gray-500">Encounter Runtime</div>
            {presentedBlock && isEncounter(presentedBlock as Block) ? (
              <>
                <div className="text-sm font-semibold">{presentedBlock.title ?? "Encounter"}</div>
                <div className="text-xs text-gray-600">
                  {encounterState && encounterState.encounter_block_id === String(presentedBlock.id)
                    ? `Status: ${encounterState.status} | Round ${encounterState.round}`
                    : "Encounter not started"}
                </div>
                {activeEncounterForPresentedBlock ? (
                  <div className="rounded border bg-blue-50 px-2 py-2 text-xs text-blue-900">
                    Encounter battle controls are in the main stage column. Use this panel only for quick status.
                  </div>
                ) : null}
                {!encounterState || encounterState.encounter_block_id !== String(presentedBlock.id) || encounterState.status === "ended" ? (
                  <form
                    action={async () => {
                      "use server";
                      await storytellerStartEncounter({
                        sessionId: session.id,
                        encounterBlockId: String(presentedBlock.id),
                      });
                      redirect(`/storyteller/sessions/${session.id}`);
                    }}
                  >
                    <button className="rounded border px-2 py-1 text-xs">Start Encounter</button>
                  </form>
                ) : null}
                {encounterState && encounterState.encounter_block_id === String(presentedBlock.id) && !activeEncounterForPresentedBlock ? (
                  <>
                    <div className="rounded border bg-gray-50 p-2 text-xs text-gray-700 space-y-1">
                      <div>
                        Pending initiative:{" "}
                        {encounterState.combatants.filter((row) => row.kind === "player" && row.initiative_total == null).length}
                      </div>
                      <div>
                        Combatants: {encounterState.combatants.length}
                      </div>
                      {encounterState.combatants.map((row, index) => (
                        <div key={row.id} className="flex items-center justify-between">
                          <span>
                            {index + 1}. {row.name}
                          </span>
                          <span>{row.initiative_total ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                    {encounterState.status !== "ended" ? (
                      <div className="rounded border bg-white p-2 space-y-3">
                        <div className="text-[11px] uppercase text-gray-500">Combat Controls</div>
                        {encounterState.combatants.map((row) => (
                          <details key={`ctrl-${row.id}`} className="rounded border bg-gray-50 p-2" open={row.kind === "enemy"}>
                            <summary className="cursor-pointer text-xs font-semibold">
                              {row.name} {row.kind === "enemy" ? "(NPC)" : "(Player)"} {row.hp_current != null && row.hp_max != null ? `| ${row.hp_current}/${row.hp_max} HP` : ""}
                            </summary>
                            <div className="mt-2 grid gap-2">
                              <form
                                className="grid grid-cols-2 gap-2"
                                action={async (fd) => {
                                  "use server";
                                  await storytellerMoveEncounterCombatant({
                                    sessionId: session.id,
                                    combatantId: String(fd.get("combatant_id") ?? ""),
                                    x: Number(fd.get("x") ?? 0),
                                    y: Number(fd.get("y") ?? 0),
                                  });
                                  redirect(`/storyteller/sessions/${session.id}`);
                                }}
                              >
                                <input type="hidden" name="combatant_id" value={row.id} />
                                <input name="x" defaultValue={row.x ?? 0} className="rounded border px-2 py-1 text-xs" placeholder="X %" />
                                <input name="y" defaultValue={row.y ?? 0} className="rounded border px-2 py-1 text-xs" placeholder="Y %" />
                                <button className="col-span-2 rounded border px-2 py-1 text-xs">Move Token</button>
                              </form>
                              <form
                                className="grid grid-cols-2 gap-2"
                                action={async (fd) => {
                                  "use server";
                                  const conditions = String(fd.get("conditions") ?? "")
                                    .split(",")
                                    .map((v) => v.trim())
                                    .filter(Boolean);
                                  await storytellerUpdateEncounterCombatant({
                                    sessionId: session.id,
                                    combatantId: String(fd.get("combatant_id") ?? ""),
                                    hpCurrent: Number(fd.get("hp_current") ?? 0),
                                    defense: String(fd.get("defense") ?? "").trim() ? Number(fd.get("defense")) : null,
                                    conditions,
                                    note: String(fd.get("note") ?? ""),
                                  });
                                  redirect(`/storyteller/sessions/${session.id}`);
                                }}
                              >
                                <input type="hidden" name="combatant_id" value={row.id} />
                                <input name="hp_current" defaultValue={row.hp_current ?? ""} className="rounded border px-2 py-1 text-xs" placeholder="HP current" />
                                <input name="defense" defaultValue={row.defense ?? ""} className="rounded border px-2 py-1 text-xs" placeholder="Defense" />
                                <input
                                  name="conditions"
                                  defaultValue={Array.isArray(row.conditions) ? row.conditions.join(", ") : ""}
                                  className="col-span-2 rounded border px-2 py-1 text-xs"
                                  placeholder="Conditions, comma separated"
                                />
                                <input name="note" className="col-span-2 rounded border px-2 py-1 text-xs" placeholder="Optional combat note" />
                                <button className="col-span-2 rounded border px-2 py-1 text-xs">Update Combatant</button>
                              </form>
                              {row.kind === "enemy" ? (
                                <StorytellerMonsterQuickRoller
                                  sessionId={session.id}
                                  combatantId={String(row.id)}
                                  combatantName={String(row.name ?? "Monster")}
                                  combatants={(encounterState?.combatants ?? []).map((c: any) => ({
                                    id: String(c?.id ?? ""),
                                    name: String(c?.name ?? ""),
                                    defense: Number.isFinite(Number(c?.defense ?? NaN)) ? Number(c.defense) : null,
                                  }))}
                                  actionOptions={npcActionsByNpcId.get(String(row.npc_id ?? "").trim()) ?? []}
                                />
                              ) : null}
                            </div>
                          </details>
                        ))}
                        <form
                          className="space-y-2"
                          action={async (fd) => {
                            "use server";
                            await storytellerAddEncounterLogNote({
                              sessionId: session.id,
                              text: String(fd.get("text") ?? ""),
                            });
                            redirect(`/storyteller/sessions/${session.id}`);
                          }}
                        >
                          <textarea name="text" className="h-16 w-full rounded border p-2 text-xs" placeholder="Combat log note, narration, monster attack result..." />
                          <button className="rounded border px-2 py-1 text-xs">Add Log Note</button>
                        </form>
                      </div>
                    ) : null}
                    {encounterState.status === "initiative_pending" ? (
                      <form
                        action={async () => {
                          "use server";
                          await storytellerLockEncounterInitiative({ sessionId: session.id });
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Lock Initiative</button>
                      </form>
                    ) : null}
                    {encounterState.status === "active" ? (
                      <form
                        action={async () => {
                          "use server";
                          await storytellerAdvanceEncounterTurn({ sessionId: session.id });
                          redirect(`/storyteller/sessions/${session.id}`);
                        }}
                      >
                        <button className="rounded border px-2 py-1 text-xs">Next Turn</button>
                      </form>
                    ) : null}
                    <form
                      action={async () => {
                        "use server";
                        await storytellerEndEncounter({ sessionId: session.id });
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <button className="rounded border px-2 py-1 text-xs text-red-700">End Encounter</button>
                    </form>
                    {encounterState.combat_log?.length ? (
                      <div className="rounded border bg-gray-50 p-2 text-xs text-gray-700 space-y-1">
                        <div className="text-[11px] uppercase text-gray-500">Combat Log</div>
                        {encounterState.combat_log.slice().reverse().map((entry: any) => (
                          <div key={entry.id} className="rounded border bg-white px-2 py-1">
                            <div className="text-[10px] uppercase text-gray-400">{entry.type}</div>
                            <div>{entry.text}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : (
              <div className="text-xs text-gray-600">Present an encounter block to start initiative and turn order.</div>
            )}
          </div>
          <div className="text-xs uppercase text-gray-500 mb-2">Check Prompt</div>
          <CheckPromptCard
            sessionId={session.id}
            joins={joins as any[]}
            rollOpen={Boolean((state as any).roll_open)}
            currentPrompt={String((state as any).roll_prompt ?? "")}
            pendingRequests={pendingRollRequests as any[]}
            showRequestQueueWhenEmpty={false}
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
            onApproveRequest={async (fd) => {
              "use server";
              const requestId = String(fd.get("request_id") ?? "").trim();
              const instruction = String(fd.get("instruction") ?? "").trim();
              const dcRaw = String(fd.get("dc") ?? "").trim();
              const dc = Number(dcRaw);
              await approvePlayerRollRequest({
                sessionId: session.id,
                requestId,
                instruction: instruction || undefined,
                dc: Number.isFinite(dc) ? dc : null,
              });
              redirect(`/storyteller/sessions/${session.id}`);
            }}
            onDeclineRequest={async (fd) => {
              "use server";
              const requestId = String(fd.get("request_id") ?? "").trim();
              await declinePlayerRollRequest({
                sessionId: session.id,
                requestId,
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

    </div>
  );
}

