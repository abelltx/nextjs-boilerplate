"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import PlayerStatusHeader from "./PlayerStatusHeader";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";
import { CombinedChecksCard, PassivesCard, type AbilityKey } from "./PlayerSheetPanels";
import PlayerInventoryPanel from "./PlayerInventoryPanel";
import {
  abandonNpcQuestAction,
  claimNpcActionAction,
  claimNpcGearItemAction,
  claimNpcQuestRewardsAction,
  claimNpcTrainingTraitAction,
  choosePointSupportAction,
  completeNpcQuestTaskAction,
  consumePointSupportEffectsAction,
  leaveSessionAction,
  requestRollApprovalAction,
  startNpcQuestAction,
  appendEncounterLogAction,
  moveOwnEncounterTokenAction,
  consumeEncounterTurnActionAction,
  applyEncounterDamageAction,
  applyEncounterHealingAction,
  submitEncounterInitiativeAction,
  submitRollResultAction,
  usePointSupportAction,
} from "../actions";
import RevealCard from "@/components/episode-runtime/RevealCard";
import SceneMap from "@/components/episode-runtime/SceneMap";
import NpcTabsCard from "@/components/episode-runtime/NpcTabsCard";
import { extractHexMarkers, extractMapMarkers } from "@/lib/episodeRuntime";
import { normalizeEncounterState } from "@/lib/encounter";

type TabKey = "inventory" | "quests" | "actions" | "talents" | "journey";

type PromptTarget =
  | { kind: "skill"; skillKey: string }
  | { kind: "ability"; abilityKey: AbilityKey }
  | { kind: "die"; die: number }
  | null;

type GuidedRoll = {
  label: string;
  total: number;
  breakdown: string;
};
type EncounterActionPreview = {
  actionId: string;
  label: string;
  rangeFeet: number | null;
  meleeFeet: number;
} | null;
type SupportChoice = "next_attack_roll" | "next_damage_roll" | "next_skill_check" | "reroll_next_roll";
type SessionRosterEntry = {
  playerId: string;
  characterId: string;
  name: string;
  className?: string | null;
};
type ActionConfig = {
  kind?: string | null;
  target_scope?: string | null;
  choice_owner?: string | null;
  options?: Array<{
    id?: string | null;
    label?: string | null;
    trigger?: string | null;
    grant_advantage?: boolean | null;
    damage_bonus?: number | null;
    consume_on_use?: boolean | null;
  }>;
} | null;
type PointSupportEffect = {
  id: string;
  kind: "point";
  action_id: string;
  action_name?: string | null;
  source_player_id: string;
  source_character_id: string;
  source_name?: string | null;
  target_player_id: string;
  target_character_id: string;
  target_name?: string | null;
  choice_owner?: string | null;
  options?: Array<{
    id?: string | null;
    label?: string | null;
    trigger?: string | null;
    grant_advantage?: boolean | null;
    damage_bonus?: number | null;
    consume_on_use?: boolean | null;
  }>;
  status: "pending_choice" | "next_attack_roll" | "next_damage_roll" | "next_skill_check" | "reroll_next_roll" | "consumed";
  damage_bonus?: number | null;
  created_at?: string | null;
  chosen_at?: string | null;
  consumed_at?: string | null;
};
type QuestProgress = {
  status: "available" | "active" | "completed" | "claimed";
  completedTaskIds: string[];
  claimedAt?: string | null;
};

const SKILL_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: "acrobatics", aliases: ["acrobatics"] },
  { key: "animal_handling", aliases: ["animal handling", "animal_handling"] },
  { key: "athletics", aliases: ["athletics"] },
  { key: "deception", aliases: ["deception"] },
  { key: "history", aliases: ["history"] },
  { key: "insight", aliases: ["insight"] },
  { key: "intimidation", aliases: ["intimidation"] },
  { key: "investigation", aliases: ["investigation"] },
  { key: "medicine", aliases: ["medicine"] },
  { key: "nature", aliases: ["nature"] },
  { key: "perception", aliases: ["perception"] },
  { key: "performance", aliases: ["performance"] },
  { key: "persuasion", aliases: ["persuasion"] },
  { key: "religion", aliases: ["religion"] },
  { key: "sleight_of_hand", aliases: ["sleight of hand", "sleight_of_hand"] },
  { key: "stealth", aliases: ["stealth"] },
  { key: "survival", aliases: ["survival"] },
];
const REQUESTABLE_CHECKS = [
  "Perception",
  "Investigation",
  "Insight",
  "Medicine",
  "Animal Handling",
  "Nature",
  "Performance",
  "Sleight of Hand",
  "Athletics",
  "Acrobatics",
  "Stealth",
  "Survival",
  "Religion",
  "History",
  "Persuasion",
  "Deception",
  "Intimidation",
  "STR",
  "DEX",
  "CON",
  "INT",
  "WIS",
  "CHA",
];

function detectPromptTarget(prompt: string): PromptTarget {
  const lower = String(prompt ?? "").toLowerCase();
  if (!lower.trim()) return null;

  const dieMatch = lower.match(/\bd\s*(4|6|8|10|12|20|100)\b/);
  if (dieMatch) return { kind: "die", die: Number(dieMatch[1]) };

  if (/\bstrength\b|\bstr\b/.test(lower)) return { kind: "ability", abilityKey: "str" };
  if (/\bdexterity\b|\bdex\b/.test(lower)) return { kind: "ability", abilityKey: "dex" };
  if (/\bconstitution\b|\bcon\b/.test(lower)) return { kind: "ability", abilityKey: "con" };
  if (/\bintelligence\b|\bint\b/.test(lower)) return { kind: "ability", abilityKey: "int" };
  if (/\bwisdom\b|\bwis\b/.test(lower)) return { kind: "ability", abilityKey: "wis" };
  if (/\bcharisma\b|\bcha\b/.test(lower)) return { kind: "ability", abilityKey: "cha" };

  for (const skill of SKILL_ALIASES) {
    for (const alias of skill.aliases) {
      if (lower.includes(alias)) return { kind: "skill", skillKey: skill.key };
    }
  }

  return null;
}

function isLiveState(state: any) {
  if (!state) return false;
  if (state.player_view === true) return true;
  if (state.is_live === true) return true;
  if (state.live === true) return true;
  if (state.roll_open === true) return true;
  if (typeof state.presented_block_id === "string" && state.presented_block_id.trim().length > 0) return true;
  return false;
}

function normalizeAdvantageKey(raw: string) {
  return String(raw ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeActionConfig(input: unknown): ActionConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const cfg = input as Record<string, any>;
  return {
    kind: String(cfg.kind ?? "").trim().toLowerCase() || null,
    target_scope: String(cfg.target_scope ?? "").trim().toLowerCase() || null,
    choice_owner: String(cfg.choice_owner ?? "").trim().toLowerCase() || null,
    options: Array.isArray(cfg.options)
      ? cfg.options.map((opt: any) => ({
          id: String(opt?.id ?? "").trim() || null,
          label: String(opt?.label ?? "").trim() || null,
          trigger: String(opt?.trigger ?? "").trim().toLowerCase() || null,
          grant_advantage: typeof opt?.grant_advantage === "boolean" ? opt.grant_advantage : null,
          damage_bonus: Number.isFinite(Number(opt?.damage_bonus ?? NaN)) ? Number(opt.damage_bonus) : null,
          consume_on_use: typeof opt?.consume_on_use === "boolean" ? opt.consume_on_use : null,
        }))
      : [],
  };
}

function abilityModifier(score: unknown) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}

export default function PlayerHubClient(props: {
  userId: string;
  userEmail: string;
  accessLabel: string;
  character: any;
  inventory: any[];
  sessions: any[];
  sessionRosterById?: Record<string, SessionRosterEntry[]>;
  sessionStates: Record<string, any>;
  presentedBlocks: Record<string, any>;
  gameLog: any[];
  playerTraitIds?: string[];
  playerTraits?: Array<{ id: string; name: string; summary?: string | null; type?: string | null }>;
  playerActionIds?: string[];
  playerActions?: Array<{
    id: string;
    name: string;
    type?: string | null;
    tags?: string[];
    action_config?: ActionConfig;
    summary?: string | null;
    rules_text?: string | null;
    range_normal?: number | null;
    range_max?: number | null;
    uses_attack_roll?: boolean | null;
    save_ability?: string | null;
    save_dc_override?: number | null;
    damage_dice?: string | null;
    damage_bonus?: number | null;
    attack_bonus_override?: number | null;
    damage_type?: string | null;
    on_fail?: string | null;
    on_success?: string | null;
  }>;
  questProgress?: Record<string, QuestProgress>;
  questEntries?: Array<{
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<{
      id: string;
      title: string;
      kind?: string;
      target_npc_name?: string | null;
      target_npc_block_id?: string | null;
      target_item_id?: string | null;
    }>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }>;
}) {
  const [tab, setTab] = useState<TabKey>("inventory");
  const [joinOpen, setJoinOpen] = useState(false);
  const [optimisticLiveSession, setOptimisticLiveSession] = useState<{ id: string; name?: string | null } | null>(null);
  const [claimingGearId, setClaimingGearId] = useState<string | null>(null);
  const [claimingTrainingId, setClaimingTrainingId] = useState<string | null>(null);
  const [claimingQuestId, setClaimingQuestId] = useState<string | null>(null);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const stat = (props.character?.stat_block ?? {}) as any;
  const derived = stat?.derived ?? {};
  const resources = stat?.resources ?? {};
  const effects = stat?.effects ?? [];
  const faithPoints = Number(resources.faith_available ?? 0);
  const ownedInventoryItemIds = useMemo(
    () =>
      (props.inventory ?? [])
        .map((it) => String(it?.item_id ?? "").trim().toLowerCase())
        .filter((id) => id.length > 0),
    [props.inventory]
  );
  const ownedTraitIds = useMemo(
    () => (props.playerTraitIds ?? []).map((id) => String(id).trim().toLowerCase()).filter(Boolean),
    [props.playerTraitIds]
  );
  const ownedActionIds = useMemo(
    () => (props.playerActionIds ?? []).map((id) => String(id).trim().toLowerCase()).filter(Boolean),
    [props.playerActionIds]
  );

  const liveSession = useMemo(() => {
    const candidates = (props.sessions ?? [])
      .map((s) => ({ session: s, state: props.sessionStates?.[s.id] }))
      .filter(({ state }) => Boolean(state));
    return candidates.find(({ state }) => isLiveState(state))?.session ?? null;
  }, [props.sessions, props.sessionStates]);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (liveSession?.id && liveSession.id !== selectedSessionId) {
      setSelectedSessionId(liveSession.id);
      return;
    }
    if (!selectedSessionId && props.sessions?.[0]?.id) {
      setSelectedSessionId(props.sessions[0].id);
    }
  }, [selectedSessionId, liveSession, props.sessions]);

  const [stage, setStage] = useState<{
    ok: boolean;
    session?: any;
    state?: any;
    block?: any;
    linkedBlocks?: Record<string, any>;
    players?: string[];
  } | null>(null);
  const stageHashRef = useRef<string>("");

  const selectedSession = props.sessions.find((s) => s.id === selectedSessionId) ?? null;
  const optimisticLiveSessionName =
    (optimisticLiveSession?.id
      ? props.sessions.find((s) => s.id === optimisticLiveSession.id)?.name
      : null) ??
    optimisticLiveSession?.name ??
    null;

  useEffect(() => {
    if (!selectedSessionId) return;

    let alive = true;
    let t: any = null;

    const tick = async () => {
      try {
        const res = await fetch(`/api/player/session-stage?session_id=${selectedSessionId}`, { cache: "no-store" });
        const json = await res.json();
        if (!alive) return;
        const nextHash = JSON.stringify(json ?? {});
        if (nextHash !== stageHashRef.current) {
          stageHashRef.current = nextHash;
          setStage(json);
        }
      } catch {
        if (!alive) return;
        setStage((s) => s ?? { ok: false });
      }
    };

    tick();
    t = setInterval(tick, 1500);

    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [selectedSessionId]);

  const stageState = stage?.state ?? (selectedSessionId ? props.sessionStates?.[selectedSessionId] : null);
  const encounterState = useMemo(() => normalizeEncounterState(stageState?.encounter_state), [stageState?.encounter_state]);
  const encounterOwnsStage = Boolean(encounterState && encounterState.status !== "ended");
  const stageBlock = stage?.block ?? null;
  const sessionRoster = useMemo(
    () =>
      (selectedSessionId ? props.sessionRosterById?.[selectedSessionId] ?? [] : [])
        .filter((row) => String(row?.characterId ?? "").trim().length > 0),
    [selectedSessionId, props.sessionRosterById]
  );
  const pointEffects = useMemo(
    () =>
      (Array.isArray(stageState?.support_effects) ? (stageState.support_effects as any[]) : [])
        .filter((row: any) => String(row?.kind ?? "").trim().toLowerCase() === "point") as PointSupportEffect[],
    [stageState]
  );
  const stageIsLive = isLiveState(stageState);
  const liveSessionNameForHeader =
    stage?.session?.name ??
    selectedSession?.name ??
    optimisticLiveSessionName ??
    liveSession?.name ??
    (selectedSessionId ? "Current session" : null);
  const isSessionLive = Boolean(optimisticLiveSession?.id || liveSession?.id || (selectedSessionId && stageIsLive));
  const isLiveMode = isSessionLive;

  useEffect(() => {
    const characterId = String(props.character?.id ?? "").trim();
    if (!characterId) return;
    const channel = supabase
      .channel(`player-quest-progress-${characterId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "player_quest_progress",
          filter: `character_id=eq.${characterId}`,
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, router, props.character?.id]);

  // Fallback for environments where realtime isn't enabled/reliable.
  useEffect(() => {
    if (!isLiveMode || !selectedSessionId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 3000);
    return () => window.clearInterval(interval);
  }, [isLiveMode, selectedSessionId, router]);

  const rollOpen = Boolean(stageState?.roll_open);
  const rollPrompt = String(stageState?.roll_prompt ?? "");
  const promptTarget = useMemo(() => (rollOpen ? detectPromptTarget(rollPrompt) : null), [rollOpen, rollPrompt]);
  const advantageMap = (stat?.advantages ?? {}) as Record<string, string[]>;
  const abilityAdvantageMap: Partial<Record<AbilityKey, boolean>> = useMemo(() => {
    const out: Partial<Record<AbilityKey, boolean>> = {};
    (["str", "dex", "con", "int", "wis", "cha"] as AbilityKey[]).forEach((k) => {
      const sources = advantageMap[normalizeAdvantageKey(k)];
      out[k] = Array.isArray(sources) && sources.length > 0;
    });
    return out;
  }, [advantageMap]);
  const pendingPointChoices = useMemo(
    () =>
      pointEffects.filter(
        (row) =>
          String(row?.target_character_id ?? "").trim() === String(props.character?.id ?? "").trim() &&
          String(row?.status ?? "").trim().toLowerCase() === "pending_choice"
      ),
    [pointEffects, props.character?.id]
  );
  const temporaryAttackPointEffects = useMemo(
    () =>
      pointEffects.filter(
        (row) =>
          String(row?.target_character_id ?? "").trim() === String(props.character?.id ?? "").trim() &&
          String(row?.status ?? "").trim().toLowerCase() === "next_attack_roll"
      ),
    [pointEffects, props.character?.id]
  );
  const temporaryDamagePointEffects = useMemo(
    () =>
      pointEffects.filter(
        (row) =>
          String(row?.target_character_id ?? "").trim() === String(props.character?.id ?? "").trim() &&
          String(row?.status ?? "").trim().toLowerCase() === "next_damage_roll"
      ),
    [pointEffects, props.character?.id]
  );
  const temporarySkillPointEffects = useMemo(
    () =>
      pointEffects.filter(
        (row) =>
          String(row?.target_character_id ?? "").trim() === String(props.character?.id ?? "").trim() &&
          String(row?.status ?? "").trim().toLowerCase() === "next_skill_check"
      ),
    [pointEffects, props.character?.id]
  );
  const temporaryRerollPointEffects = useMemo(
    () =>
      pointEffects.filter(
        (row) =>
          String(row?.target_character_id ?? "").trim() === String(props.character?.id ?? "").trim() &&
          String(row?.status ?? "").trim().toLowerCase() === "reroll_next_roll"
      ),
    [pointEffects, props.character?.id]
  );
  const temporaryAttackAdvantageSources = useMemo(
    () =>
      temporaryAttackPointEffects.map((row) => {
        const sourceName = String(row?.source_name ?? "").trim();
        const actionName = String(row?.action_name ?? "").trim() || "Support";
        return sourceName ? `${actionName} (${sourceName})` : actionName;
      }),
    [temporaryAttackPointEffects]
  );
  const temporaryDamageBonus = useMemo(
    () => temporaryDamagePointEffects.reduce((sum, row) => sum + Math.max(0, Number(row?.damage_bonus ?? 0) || 0), 0),
    [temporaryDamagePointEffects]
  );
  const temporaryDamageBonusSources = useMemo(
    () =>
      temporaryDamagePointEffects.map((row) => {
        const sourceName = String(row?.source_name ?? "").trim();
        const actionName = String(row?.action_name ?? "").trim() || "Support";
        return sourceName ? `${actionName} (${sourceName})` : actionName;
      }),
    [temporaryDamagePointEffects]
  );
  const temporarySkillAdvantageSources = useMemo(
    () =>
      temporarySkillPointEffects.map((row) => {
        const sourceName = String(row?.source_name ?? "").trim();
        const actionName = String(row?.action_name ?? "").trim() || "Support";
        return sourceName ? `${actionName} (${sourceName})` : actionName;
      }),
    [temporarySkillPointEffects]
  );
  const temporaryRerollSources = useMemo(
    () =>
      temporaryRerollPointEffects.map((row) => {
        const sourceName = String(row?.source_name ?? "").trim();
        const actionName = String(row?.action_name ?? "").trim() || "Support";
        return sourceName ? `${actionName} (${sourceName})` : actionName;
      }),
    [temporaryRerollPointEffects]
  );
  const skillAdvantageMap: Record<string, boolean> = useMemo(() => {
    const out: Record<string, boolean> = {};
    SKILL_ALIASES.forEach((s) => {
      const keys = [s.key, ...s.aliases].map((v) => normalizeAdvantageKey(v));
      out[s.key] =
        keys.some((k) => Array.isArray(advantageMap[k]) && advantageMap[k].length > 0) ||
        temporarySkillPointEffects.length > 0;
    });
    return out;
  }, [advantageMap, temporarySkillPointEffects.length]);
  const activePromptAdvantageSources = useMemo(() => {
    if (!rollOpen || !promptTarget) return [] as string[];
    if (promptTarget.kind === "ability") {
      return advantageMap[normalizeAdvantageKey(promptTarget.abilityKey)] ?? [];
    }
    if (promptTarget.kind === "skill") {
      return [
        ...(advantageMap[normalizeAdvantageKey(promptTarget.skillKey)] ?? []),
        ...temporarySkillAdvantageSources,
      ];
    }
    return [] as string[];
  }, [rollOpen, promptTarget, advantageMap, temporarySkillAdvantageSources]);
  const stageStoryText = String(stage?.session?.story_text ?? selectedSession?.story_text ?? "");
  const [diceMode, setDiceMode] = useState<"digital" | "manual">("digital");
  const [manualValue, setManualValue] = useState("");
  const [manualValueB, setManualValueB] = useState("");
  const [submittingRoll, setSubmittingRoll] = useState(false);
  const [pendingPromptRerollEffectId, setPendingPromptRerollEffectId] = useState<string | null>(null);
  const [requestingRoll, setRequestingRoll] = useState(false);
  const [submittingInitiative, setSubmittingInitiative] = useState(false);
  const [initiativeManualValue, setInitiativeManualValue] = useState("");
  const [movingEncounterToken, setMovingEncounterToken] = useState(false);
  const [encounterActionPreview, setEncounterActionPreview] = useState<EncounterActionPreview>(null);
  const [targetingActionId, setTargetingActionId] = useState<string | null>(null);
  const [combatTargetByAction, setCombatTargetByAction] = useState<Record<string, string>>({});
  const [usingPointActionId, setUsingPointActionId] = useState<string | null>(null);
  const [resolvingPointId, setResolvingPointId] = useState<string | null>(null);
  const [requestCheckKey, setRequestCheckKey] = useState("Perception");
  const [requestMessage, setRequestMessage] = useState("");
  const [requestRollOpen, setRequestRollOpen] = useState(false);
  const [requestPickMode, setRequestPickMode] = useState(false);
  const promptBoxRef = useRef<HTMLDivElement | null>(null);
  const [guidedResult, setGuidedResult] = useState<GuidedRoll | null>(null);
  const [flight, setFlight] = useState<{
    id: number;
    text: string;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    active: boolean;
  } | null>(null);
  const currentRoundId = String(stageState?.roll_round_id ?? "");
  const myExistingResult = (stageState?.roll_results?.[props.userId] ?? null) as any;
  const alreadySubmittedRound = Boolean(
    rollOpen && currentRoundId && myExistingResult?.round_id && String(myExistingResult.round_id) === currentRoundId
  );
  const rollLocked = rollOpen && !pendingPromptRerollEffectId && (Boolean(guidedResult) || Boolean(flight) || alreadySubmittedRound);
  const rollRequests = Array.isArray(stageState?.roll_requests) ? (stageState.roll_requests as any[]) : [];
  const myPendingRequest = rollRequests.find(
    (r: any) =>
      String(r?.player_id ?? "").trim() === props.userId &&
      String(r?.status ?? "pending").trim().toLowerCase() === "pending"
  );
  const myActiveRoll = rollOpen && (String(stageState?.roll_target ?? "all").trim() === "all" || String(stageState?.roll_target ?? "").trim() === props.userId);
  const myEncounterCombatant = useMemo(
    () =>
      encounterState?.combatants.find(
        (row) =>
          row.kind === "player" &&
          String(row.player_id ?? "").trim() === props.userId &&
          String(row.character_id ?? "").trim() === String(props.character?.id ?? "")
      ) ?? null,
    [encounterState, props.userId, props.character?.id]
  );
  const isMyEncounterTurn = Boolean(
    encounterState &&
      encounterState.status === "active" &&
      myEncounterCombatant &&
      String(encounterState.combatants?.[encounterState.turn_index]?.id ?? "") === String(myEncounterCombatant.id ?? "")
  );
  const myEncounterActionUsed = Boolean(
    encounterState?.turn_action &&
      encounterState.turn_action.round === encounterState.round &&
      String(encounterState.turn_action.combatant_id ?? "") === String(myEncounterCombatant?.id ?? "")
  );

  useEffect(() => {
    if (!rollOpen) {
      setGuidedResult(null);
      setFlight(null);
      setManualValue("");
      setManualValueB("");
      setSubmittingRoll(false);
      setPendingPromptRerollEffectId(null);
    }
  }, [rollOpen, rollPrompt]);

  useEffect(() => {
    if (tab !== "actions" && encounterActionPreview) {
      setEncounterActionPreview(null);
    }
  }, [tab, encounterActionPreview]);

  async function submitRoll(value: number, source: "manual" | "digital", rerollEffectId?: string | null) {
    if (!selectedSessionId) return;
    setSubmittingRoll(true);
    const res = await submitRollResultAction({
      sessionId: selectedSessionId,
      characterId: String(props.character?.id ?? ""),
      rollValue: value,
      source,
      rerollEffectId: rerollEffectId || undefined,
    });
    setSubmittingRoll(false);
    if (!res.ok) {
      alert(res.error ?? "Could not submit roll.");
      return;
    }
    if (encounterState) {
      const promptLabel = rollPrompt.trim() || "Roll request";
      const logRes = await appendEncounterLogAction({
        sessionId: selectedSessionId,
        characterId: String(props.character?.id ?? ""),
        type: "note",
        text: `${String(props.character?.name ?? "Player")} rolled ${value} for ${promptLabel}.`,
      });
      if (!logRes.ok) {
        alert(logRes.error ?? "Could not write roll to encounter log.");
        return;
      }
    }
    if (promptTarget?.kind === "skill" && temporarySkillPointEffects.length) {
      const consumeRes = await consumePointSupportEffectsAction({
        sessionId: selectedSessionId,
        characterId: String(props.character?.id ?? ""),
        effectIds: temporarySkillPointEffects.map((row) => row.id),
      });
      if (!consumeRes.ok) {
        alert(consumeRes.error ?? "Could not consume skill support effect.");
        return;
      }
    }
    setPendingPromptRerollEffectId(null);
    router.refresh();
  }

  function calculateRequestedRollTotal(rawA: number, rawB?: number | null) {
    const hasAdvantage = (activePromptAdvantageSources?.length ?? 0) > 0;
    const pickedDie = hasAdvantage && Number.isFinite(Number(rawB))
      ? Math.max(rawA, Number(rawB))
      : rawA;
    let bonus = 0;
    let bonusLabel = "";

    if (promptTarget?.kind === "ability") {
      const key = promptTarget.abilityKey;
      const score = Number(stat?.abilities?.[key] ?? 10);
      bonus = abilityModifier(score);
      bonusLabel = key.toUpperCase();
    } else if (promptTarget?.kind === "skill") {
      const key = String(promptTarget.skillKey ?? "").trim().toLowerCase();
      bonus = Number(stat?.skills?.[key] ?? 0);
      bonusLabel = key;
    } else {
      bonus = 0;
      bonusLabel = "roll";
    }

    const total = pickedDie + bonus;
    const dieLabel = promptTarget?.kind === "die" ? `d${Math.max(2, Number(promptTarget.die || 20))}` : "d20";
    const advText =
      hasAdvantage && Number.isFinite(Number(rawB))
        ? `adv[${dieLabel}(${rawA}), ${dieLabel}(${Number(rawB)})=>${pickedDie}]`
        : `${dieLabel}(${pickedDie})`;
    const sign = bonus >= 0 ? "+" : "-";
    const absBonus = Math.abs(bonus);
    const breakdown =
      promptTarget?.kind === "die"
        ? `${advText}`
        : `${advText} ${sign} ${absBonus} (${bonusLabel})`;
    return { total, breakdown };
  }

  async function handlePromptReroll() {
    const rerollEffectId = String(
      pendingPromptRerollEffectId ?? temporaryRerollPointEffects[0]?.id ?? ""
    ).trim();
    if (!rerollEffectId || !selectedSessionId || submittingRoll) return;

    if (diceMode === "manual") {
      setPendingPromptRerollEffectId(rerollEffectId);
      setGuidedResult(null);
      setManualValue("");
      setManualValueB("");
      return;
    }

    const dieSides = promptTarget?.kind === "die" ? Math.max(2, Number(promptTarget.die || 20)) : 20;
    const rawA = Math.floor(Math.random() * dieSides) + 1;
    const rawB = (activePromptAdvantageSources?.length ?? 0) > 0 ? Math.floor(Math.random() * dieSides) + 1 : null;
    const computed = calculateRequestedRollTotal(rawA, rawB);
    setGuidedResult({ label: "Reroll", total: computed.total, breakdown: computed.breakdown });
    await submitRoll(computed.total, "digital", rerollEffectId);
  }

  async function handleRequestRoll() {
    if (!selectedSessionId || requestingRoll || myPendingRequest) return false;
    setRequestingRoll(true);
    try {
      const res = await requestRollApprovalAction({
        sessionId: selectedSessionId,
        checkKey: requestCheckKey,
        message: requestMessage.trim() || undefined,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not send roll request.");
        return false;
      }
      setRequestMessage("");
      router.refresh();
      return true;
    } finally {
      setRequestingRoll(false);
    }
  }

  async function handleSubmitEncounterInitiative(source: "manual" | "digital") {
    if (!selectedSessionId || !myEncounterCombatant || submittingInitiative) return;
    let rollValue = 0;
    if (source === "manual") {
      rollValue = Number(initiativeManualValue);
      if (!Number.isFinite(rollValue) || rollValue < 1 || rollValue > 20) {
        alert("Enter a d20 result from 1 to 20.");
        return;
      }
    } else {
      rollValue = Math.floor(Math.random() * 20) + 1;
    }

    setSubmittingInitiative(true);
    try {
      const res = await submitEncounterInitiativeAction({
        sessionId: selectedSessionId,
        characterId: String(props.character?.id ?? ""),
        rollValue,
        source,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not submit initiative.");
        return;
      }
      setInitiativeManualValue("");
      router.refresh();
    } finally {
      setSubmittingInitiative(false);
    }
  }

  async function handleUsePoint(actionId: string, targetCharacterId: string) {
    if (!selectedSessionId || !actionId || !targetCharacterId || usingPointActionId) return;
    setUsingPointActionId(actionId);
    try {
      const res = await usePointSupportAction({
        sessionId: selectedSessionId,
        characterId: String(props.character?.id ?? ""),
        actionId,
        targetCharacterId,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not use support action.");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not use support action.");
    } finally {
      setUsingPointActionId(null);
    }
  }

  async function handleMoveMyEncounterToken(x: number, y: number) {
    if (!selectedSessionId || !props.character?.id || movingEncounterToken) return;
    setMovingEncounterToken(true);
    try {
      const res = await moveOwnEncounterTokenAction({
        sessionId: selectedSessionId,
        characterId: String(props.character?.id ?? ""),
        x,
        y,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not move your token.");
        return;
      }
      router.refresh();
    } finally {
      setMovingEncounterToken(false);
    }
  }

  function handlePickEncounterTarget(combatantId: string) {
    if (!targetingActionId) return;
    setCombatTargetByAction((prev) => ({ ...prev, [targetingActionId]: combatantId }));
    setTargetingActionId(null);
  }

  async function handleChoosePoint(effectId: string, choice: SupportChoice) {
    if (!selectedSessionId || !effectId || resolvingPointId) return;
    setResolvingPointId(effectId);
    try {
      const res = await choosePointSupportAction({
        sessionId: selectedSessionId,
        characterId: String(props.character?.id ?? ""),
        effectId,
        choice,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not choose support effect.");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not choose support effect.");
    } finally {
      setResolvingPointId(null);
    }
  }

  function launchRollFlight(fromRect: DOMRect, result: GuidedRoll) {
    const targetRect = promptBoxRef.current?.getBoundingClientRect();
    if (!targetRect) {
      setGuidedResult(result);
      return;
    }
    const startX = fromRect.left + fromRect.width / 2;
    const startY = fromRect.top + fromRect.height / 2;
    const endX = targetRect.left + targetRect.width * 0.82;
    const endY = targetRect.top + targetRect.height * 0.32;
    const id = Date.now();
    setFlight({ id, text: `${result.total}`, startX, startY, dx: endX - startX, dy: endY - startY, active: false });
    requestAnimationFrame(() => {
      setFlight((f) => (f && f.id === id ? { ...f, active: true } : f));
    });
    window.setTimeout(() => {
      setGuidedResult(result);
      setFlight((f) => (f && f.id === id ? null : f));
      void submitRoll(result.total, "digital");
    }, 1500);
  }

  async function handleLeaveFromHeader() {
    const sid = optimisticLiveSession?.id ?? liveSession?.id ?? selectedSessionId;
    if (!sid) return;

    const ok = window.confirm(
      "Leave this session?\n\nYou may need a join code to re-enter."
    );
    if (!ok) return;

    const res = await leaveSessionAction(sid);
    if (!res.ok) {
      alert(res.error ?? "Failed to leave session.");
      return;
    }

    setStage(null);
    setSelectedSessionId(null);
    setOptimisticLiveSession(null);
    router.refresh();
  }

  function handleAbilityGuidedRoll(ability: AbilityKey, meta: { label: string; total: number; breakdown?: string }, fromRect: DOMRect) {
    if (requestPickMode) {
      setRequestCheckKey(ability.toUpperCase());
      setRequestRollOpen(true);
      setRequestPickMode(false);
      return;
    }
    if (diceMode !== "digital") return;
    if (rollLocked) return;
    if (!rollOpen || promptTarget?.kind !== "ability" || promptTarget.abilityKey !== ability) return;
    launchRollFlight(fromRect, { label: meta.label, total: meta.total, breakdown: meta.breakdown ?? "" });
  }

  function handleSkillGuidedRoll(skillKey: string, meta: { label: string; total: number; breakdown?: string }, fromRect: DOMRect) {
    if (requestPickMode) {
      const requestLabel = meta.label.replace(/\s+Check$/i, "").trim();
      setRequestCheckKey(requestLabel);
      setRequestRollOpen(true);
      setRequestPickMode(false);
      return;
    }
    if (diceMode !== "digital") return;
    if (rollLocked) return;
    if (!rollOpen || promptTarget?.kind !== "skill" || promptTarget.skillKey !== skillKey) return;
    launchRollFlight(fromRect, { label: meta.label, total: meta.total, breakdown: meta.breakdown ?? "" });
  }

  function handleRollPanelGuided(meta: { label: string; total: number; breakdown: string }, fromRect: DOMRect) {
    if (diceMode !== "digital") return;
    if (rollLocked) return;
    if (!rollOpen) return;
    if (promptTarget?.kind === "die" || promptTarget?.kind === "ability" || promptTarget?.kind === "skill") {
      launchRollFlight(fromRect, meta);
    }
  }

  async function handleClaimNpcGear(item: { id: string; itemId: string; name: string; faithRequired: number }) {
    if (claimingGearId) return;
    setClaimingGearId(item.id);
    try {
      const res = await claimNpcGearItemAction({
        characterId: String(props.character?.id ?? ""),
        itemId: item.itemId,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not add item.");
        return;
      }
      window.dispatchEvent(new CustomEvent("inventory:refresh"));
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not add item.");
    } finally {
      setClaimingGearId(null);
    }
  }
  async function handleClaimNpcTraining(trait: { id: string; traitId: string; name: string; source: "trait" | "action" }) {
    if (claimingTrainingId) return;
    setClaimingTrainingId(trait.id);
    try {
      const res =
        trait.source === "action"
          ? await claimNpcActionAction({
              characterId: String(props.character?.id ?? ""),
              actionId: trait.traitId,
            })
          : await claimNpcTrainingTraitAction({
              characterId: String(props.character?.id ?? ""),
              traitId: trait.traitId,
            });
      if (!res.ok) {
        alert(res.error ?? "Could not learn.");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not learn.");
    } finally {
      setClaimingTrainingId(null);
    }
  }
  async function handleStartNpcQuest(quest: {
    id: string;
    title: string;
    tasks?: Array<{
      id: string;
      title?: string;
      kind?: string;
      targetNpcBlockId?: string | null;
      targetNpcName?: string | null;
      targetItemId?: string | null;
    }>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }) {
    if (claimingQuestId) return;
    setClaimingQuestId(quest.id);
    try {
      const res = await startNpcQuestAction({
        characterId: String(props.character?.id ?? ""),
        questId: String(quest.id ?? ""),
        questTitle: String(quest.title ?? ""),
        taskIds: Array.isArray(quest.tasks) ? quest.tasks.map((t) => String(t?.id ?? "").trim()).filter(Boolean) : [],
        taskDefs: Array.isArray(quest.tasks)
          ? quest.tasks.map((t: any) => ({
              id: String(t?.id ?? "").trim(),
              title: String(t?.title ?? "").trim(),
              kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
              target_npc_block_id: String(t?.targetNpcBlockId ?? "").trim() || null,
              target_npc_name: String(t?.targetNpcName ?? "").trim() || null,
              target_item_id: String(t?.targetItemId ?? "").trim() || null,
            }))
          : [],
        rewardFaith: Number(quest.rewards?.faith ?? 0),
        rewardItemIds: Array.isArray(quest.rewards?.itemIds) ? quest.rewards?.itemIds : [],
        storytellerControlled: Boolean(quest.storytellerControlled),
      });
      if (!res.ok) {
        alert(res.error ?? "Could not start quest.");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not start quest.");
    } finally {
      setClaimingQuestId(null);
    }
  }
  async function handleCompleteNpcQuestTask(
    quest: {
      id: string;
      title: string;
      tasks?: Array<{
        id: string;
        title?: string;
        kind?: string;
        targetNpcBlockId?: string | null;
        targetNpcName?: string | null;
        targetItemId?: string | null;
      }>;
    },
    task: {
      id: string;
      title?: string;
      kind?: string;
      targetNpcBlockId?: string | null;
      targetNpcName?: string | null;
      targetItemId?: string | null;
    }
  ) {
    if (claimingQuestId) return;
    setClaimingQuestId(quest.id);
    try {
      const res = await completeNpcQuestTaskAction({
        characterId: String(props.character?.id ?? ""),
        questId: String(quest.id ?? ""),
        questTitle: String(quest.title ?? ""),
        taskId: String(task.id ?? ""),
        allTaskIds: Array.isArray(quest.tasks) ? quest.tasks.map((t) => String(t?.id ?? "").trim()).filter(Boolean) : [],
        taskDefs: Array.isArray(quest.tasks)
          ? quest.tasks.map((t: any) => ({
              id: String(t?.id ?? "").trim(),
              title: String(t?.title ?? "").trim(),
              kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
              target_npc_block_id: String(t?.targetNpcBlockId ?? "").trim() || null,
              target_npc_name: String(t?.targetNpcName ?? "").trim() || null,
              target_item_id: String(t?.targetItemId ?? "").trim() || null,
            }))
          : [],
      });
      if (!res.ok) {
        alert(res.error ?? "Could not update quest task.");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not update quest task.");
    } finally {
      setClaimingQuestId(null);
    }
  }
  async function handleClaimNpcQuestRewards(quest: {
    id: string;
    title: string;
    tasks?: Array<{ id: string }>;
    rewards?: { faith?: number; itemIds?: string[] };
  }) {
    if (claimingQuestId) return;
    setClaimingQuestId(quest.id);
    try {
      const res = await claimNpcQuestRewardsAction({
        characterId: String(props.character?.id ?? ""),
        questId: String(quest.id ?? ""),
        questTitle: String(quest.title ?? ""),
        allTaskIds: Array.isArray(quest.tasks) ? quest.tasks.map((t) => String(t?.id ?? "").trim()).filter(Boolean) : [],
        rewardFaith: Number(quest.rewards?.faith ?? 0),
        rewardItemIds: Array.isArray(quest.rewards?.itemIds) ? quest.rewards?.itemIds : [],
      });
      if (!res.ok) {
        alert(res.error ?? "Could not claim rewards.");
        return;
      }
      if (res.faithAwarded || res.grantedItems) {
        window.dispatchEvent(new CustomEvent("inventory:refresh"));
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not claim rewards.");
    } finally {
      setClaimingQuestId(null);
    }
  }
  async function handleAbandonNpcQuest(entry: {
    questId: string;
    title: string;
    storytellerControlled?: boolean;
  }) {
    if (entry.storytellerControlled) {
      alert("This quest is controlled by the storyteller.");
      return;
    }
    const ok = window.confirm(`Abandon "${entry.title}"?\n\nProgress on this quest will be removed.`);
    if (!ok) return;
    setClaimingQuestId(entry.questId);
    try {
      const res = await abandonNpcQuestAction({
        characterId: String(props.character?.id ?? ""),
        questId: String(entry.questId ?? ""),
      });
      if (!res.ok) {
        alert(res.error ?? "Could not abandon quest.");
        return;
      }
      router.refresh();
    } catch (e: any) {
      alert(e?.message ?? "Could not abandon quest.");
    } finally {
      setClaimingQuestId(null);
    }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-3 flex justify-end">
          <form action="/logout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:bg-neutral-900"
            >
              Sign out
            </button>
          </form>
        </div>

        <PlayerStatusHeader
          characterName={props.character?.name ?? "Adventurer"}
          becomingLabel={"Pilgrim (MVP)"}
          healthCurrent={derived.hp_current ?? null}
          healthMax={derived.hp_max ?? null}
          defense={derived.defense ?? null}
          speed={derived.speed ?? null}
          faithAvailable={Number(resources.faith_available ?? 0)}
          faithCap={Number(resources.faith_cap ?? 100)}
          effects={effects}
          liveSessionName={liveSessionNameForHeader}
          isSessionLive={isSessionLive}
          timerStatus={String(stageState?.timer_status ?? "")}
          timerRemainingSeconds={Number(stageState?.remaining_seconds ?? NaN)}
          timerUpdatedAt={String(stageState?.updated_at ?? "")}
          onJoinClick={() => setJoinOpen(true)}
          onLeaveClick={handleLeaveFromHeader}
        />

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="lg:col-span-3 xl:col-span-3 space-y-4">
            <CombinedChecksCard
              stat={stat}
              highlightAbility={promptTarget?.kind === "ability" ? promptTarget.abilityKey : null}
              highlightSkill={promptTarget?.kind === "skill" ? promptTarget.skillKey : null}
              onAbilityRoll={handleAbilityGuidedRoll}
              onSkillRoll={handleSkillGuidedRoll}
              rollLocked={rollLocked || diceMode === "manual" || submittingRoll}
              advantageByAbility={abilityAdvantageMap}
              advantageBySkill={skillAdvantageMap}
            />
            <PassivesCard stat={stat} />

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">
              Signed in as {props.userEmail} - {props.accessLabel}
            </div>
          </aside>

          <section className="lg:col-span-6 xl:col-span-6">
            <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-sm font-semibold">{encounterOwnsStage ? "Encounter Stage" : "Stage"}</div>

              <div className="mt-4 space-y-4">
                {rollOpen ? (
                  <div ref={promptBoxRef} className="rounded-2xl border border-emerald-400/40 bg-neutral-950/70 p-3">
                    <RollRequestPanel
                      prompt={rollPrompt}
                      guidedResult={guidedResult}
                      diceMode={diceMode}
                      setDiceMode={setDiceMode}
                      manualValue={manualValue}
                      manualValueB={manualValueB}
                      setManualValue={setManualValue}
                      setManualValueB={setManualValueB}
                      onSubmitManual={async () => {
                        if (rollLocked || submittingRoll) return;
                        const rawA = Number(manualValue);
                        if (!Number.isFinite(rawA)) {
                          alert("Enter your first d20 roll.");
                          return;
                        }
                        const hasAdvantage = (activePromptAdvantageSources?.length ?? 0) > 0;
                        const rawB = manualValueB.trim() ? Number(manualValueB) : null;
                        if (hasAdvantage && !Number.isFinite(Number(rawB))) {
                          alert("Advantage is active. Enter your second d20 roll.");
                          return;
                        }
                        const computed = calculateRequestedRollTotal(rawA, rawB);
                        setGuidedResult({ label: "Table Dice", total: computed.total, breakdown: computed.breakdown });
                        await submitRoll(computed.total, "manual", pendingPromptRerollEffectId);
                      }}
                      rollLocked={rollLocked}
                      submitting={submittingRoll}
                      advantageSources={activePromptAdvantageSources}
                      rerollSources={temporaryRerollSources}
                      rerollReady={Boolean(guidedResult || alreadySubmittedRound || pendingPromptRerollEffectId)}
                      rerollPendingManual={Boolean(pendingPromptRerollEffectId && diceMode === "manual")}
                      onUseReroll={handlePromptReroll}
                    />
                  </div>
                ) : null}
                {encounterOwnsStage ? (
                  <div className="space-y-4">
                    <EncounterPanel
                      encounter={encounterState}
                      myCombatant={myEncounterCombatant}
                      actionPreview={encounterActionPreview}
                      targetingActionId={targetingActionId}
                      selectedTargetId={targetingActionId ? combatTargetByAction[targetingActionId] ?? null : null}
                      manualValue={initiativeManualValue}
                      setManualValue={setInitiativeManualValue}
                      submitting={submittingInitiative}
                      movingToken={movingEncounterToken}
                      onSubmitManual={() => handleSubmitEncounterInitiative("manual")}
                      onSubmitDigital={() => handleSubmitEncounterInitiative("digital")}
                      onMoveToken={handleMoveMyEncounterToken}
                      onCombatantClick={handlePickEncounterTarget}
                    />
                    {isMyEncounterTurn ? (
                      <ActionListPanel
                        characterId={String(props.character?.id ?? "")}
                        actions={props.playerActions ?? []}
                        sessionId={selectedSessionId}
                        sessionRoster={sessionRoster}
                        combatMode
                        actionUsed={myEncounterActionUsed}
                        usedActionId={encounterState?.turn_action?.action_id ?? null}
                        encounterCombatants={encounterState?.combatants ?? []}
                        targetingActionId={targetingActionId}
                        combatTargetByAction={combatTargetByAction}
                        onBeginTargeting={(actionId) => setTargetingActionId(actionId)}
                        onActionPreviewChange={setEncounterActionPreview}
                        onUsePoint={handleUsePoint}
                        pointActionBusyId={usingPointActionId}
                        attackAdvantageSources={advantageMap.attack_roll ?? []}
                        temporaryAttackAdvantageEffectIds={temporaryAttackPointEffects.map((row) => row.id)}
                        temporaryAttackAdvantageSources={temporaryAttackAdvantageSources}
                        temporaryDamageBonus={temporaryDamageBonus}
                        temporaryDamageBonusEffectIds={temporaryDamagePointEffects.map((row) => row.id)}
                        temporaryDamageBonusSources={temporaryDamageBonusSources}
                        temporaryRerollEffectIds={temporaryRerollPointEffects.map((row) => row.id)}
                        temporaryRerollSources={temporaryRerollSources}
                      />
                    ) : null}
                  </div>
                ) : (
                  <StagePanel
                    block={stageBlock}
                    stageState={stageState}
                    linkedBlocks={stage?.linkedBlocks ?? {}}
                    playerShop={{
                      characterId: String(props.character?.id ?? ""),
                      faithPoints,
                      ownedItems: ownedInventoryItemIds,
                      ownedTraits: ownedTraitIds,
                      ownedActions: ownedActionIds,
                      questProgress: props.questProgress ?? {},
                      claimingId: claimingGearId,
                      claimingTraitId: claimingTrainingId,
                      claimingQuestId,
                      onClaim: handleClaimNpcGear,
                      onClaimTraining: handleClaimNpcTraining,
                      onQuestStart: handleStartNpcQuest,
                      onQuestTask: handleCompleteNpcQuestTask,
                      onQuestClaim: handleClaimNpcQuestRewards,
                    }}
                  />
                )}

                {stageStoryText ? (
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                    <div className="text-sm font-semibold">Story (Board)</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                      {stageStoryText}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
              <Tab active={tab === "inventory"} onClick={() => setTab("inventory")}>Inventory</Tab>
              <Tab active={tab === "quests"} onClick={() => setTab("quests")}>Quests</Tab>
              <Tab
                active={tab === "talents"}
                onClick={() => setTab("talents")}
                disabled={isLiveMode}
                title={isLiveMode ? "Spend points between sessions in the Elder tents." : undefined}
              >
                Talents
              </Tab>
              <Tab active={tab === "journey"} onClick={() => setTab("journey")}>Journal</Tab>

            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              {tab === "inventory" ? (
                <PlayerInventoryPanel characterId={props.character.id} />
              ) : tab === "quests" ? (
                <QuestListPanel
                  entries={props.questEntries ?? []}
                  claimingQuestId={claimingQuestId}
                  onTaskDone={(entry, task) =>
                    handleCompleteNpcQuestTask(
                      {
                        id: entry.questId,
                        title: entry.title,
                        tasks: (entry.tasks ?? []).map((t) => ({
                          id: t.id,
                          title: t.title,
                          kind: t.kind,
                          targetNpcBlockId: t.target_npc_block_id ?? null,
                          targetNpcName: t.target_npc_name ?? null,
                          targetItemId: (t as any).target_item_id ?? null,
                        })),
                      },
                      {
                        id: task.id,
                        title: task.title,
                        kind: task.kind,
                        targetNpcBlockId: task.target_npc_block_id ?? null,
                        targetNpcName: task.target_npc_name ?? null,
                        targetItemId: (task as any).target_item_id ?? null,
                      }
                    )
                  }
                  onClaim={(entry) =>
                    handleClaimNpcQuestRewards({
                      id: entry.questId,
                      title: entry.title,
                      tasks: (entry.tasks ?? []).map((t) => ({ id: t.id })),
                      rewards: { faith: Number(entry.rewards?.faith ?? 0), itemIds: entry.rewards?.itemIds ?? [] },
                    })
                  }
                  onAbandon={(entry) =>
                    handleAbandonNpcQuest({
                      questId: entry.questId,
                      title: entry.title,
                      storytellerControlled: entry.storytellerControlled,
                    })
                  }
                />
              ) : tab === "journey" ? (
                <div>
                  <div className="text-sm font-semibold">Journal</div>
                  <div className="mt-3">
                    <JourneyLog
                      items={props.gameLog ?? []}
                      onOpenItem={(itemId) => {
                        setTab("inventory");
                        window.setTimeout(() => {
                          window.dispatchEvent(new CustomEvent("inventory:open-item", { detail: { itemId } }));
                        }, 20);
                      }}
                    />
                  </div>
                </div>
              ) : tab === "talents" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Talents</div>
                  <div className="text-sm text-neutral-300">Scaffold only for now.</div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Choose a panel</div>
                  <div className="text-sm text-neutral-300">Inventory, quests, talents, and journal stay here. Actions now live in the right column.</div>
                </div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-3 xl:col-span-3 space-y-4">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 space-y-3">
              <div className="text-sm font-semibold">Actions</div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (requestPickMode) {
                      setRequestPickMode(false);
                      setRequestRollOpen(false);
                      return;
                    }
                    setRequestPickMode(true);
                    setRequestRollOpen(false);
                  }}
                  disabled={!selectedSessionId || Boolean(myPendingRequest) || requestingRoll}
                  className={[
                    "rounded-xl border px-3 py-2 text-left text-sm font-semibold transition",
                    requestPickMode
                      ? "border-amber-300 bg-amber-500/20 text-amber-100 shadow-[0_0_0_2px_rgba(251,191,36,0.25),0_0_14px_rgba(245,158,11,0.35)]"
                      : myActiveRoll
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                        : myPendingRequest
                          ? "border-amber-400 bg-amber-500/20 text-amber-200"
                          : "border-neutral-800 bg-neutral-950/50 text-neutral-100 hover:bg-neutral-900/70",
                  ].join(" ")}
                >
                  <div>Request Roll</div>
                  <div className="mt-1 text-[11px] font-normal text-neutral-400">
                    {requestPickMode ? "Pick from left column" : "Choose from sheet"}
                  </div>
                </button>
              </div>
              {requestPickMode ? (
                <div className="rounded-xl border border-amber-400/60 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                  Click a skill or ability in the left column to build the request.
                </div>
              ) : null}
              {pendingPointChoices.length ? (
                <PendingPointChoicePanel
                  effects={pendingPointChoices}
                  resolvingId={resolvingPointId}
                  onChoose={handleChoosePoint}
                />
              ) : null}
              <ActionListPanel
                characterId={String(props.character?.id ?? "")}
                actions={props.playerActions ?? []}
                sessionId={selectedSessionId}
                sessionRoster={sessionRoster}
                onActionPreviewChange={setEncounterActionPreview}
                onUsePoint={handleUsePoint}
                pointActionBusyId={usingPointActionId}
                attackAdvantageSources={advantageMap[normalizeAdvantageKey("attack_roll")] ?? []}
                temporaryAttackAdvantageEffectIds={temporaryAttackPointEffects.map((row) => String(row.id ?? "").trim()).filter(Boolean)}
                temporaryAttackAdvantageSources={temporaryAttackAdvantageSources}
                temporaryDamageBonus={temporaryDamageBonus}
                temporaryDamageBonusEffectIds={temporaryDamagePointEffects.map((row) => String(row.id ?? "").trim()).filter(Boolean)}
                temporaryDamageBonusSources={temporaryDamageBonusSources}
                temporaryRerollEffectIds={temporaryRerollPointEffects.map((row) => String(row.id ?? "").trim()).filter(Boolean)}
                temporaryRerollSources={temporaryRerollSources}
              />
              <TraitListPanel traits={props.playerTraits ?? []} />
            </div>
          </aside>
        </div>
      </div>

      {flight ? (
        <div
          className="pointer-events-none fixed z-[100] rounded-lg border border-green-200 bg-green-400/20 px-3 py-1 text-sm font-bold text-green-100 shadow-[0_0_0_2px_rgba(134,239,172,0.8),0_0_26px_rgba(34,197,94,0.95),0_0_48px_rgba(34,197,94,0.5)] transition-all duration-[1400ms] ease-out"
          style={{
            left: flight.startX,
            top: flight.startY,
            transform: `translate(${flight.active ? flight.dx : 0}px, ${flight.active ? flight.dy : 0}px) scale(${flight.active ? 0.72 : 1})`,
            opacity: flight.active ? 0.08 : 1,
          }}
        >
          {flight.text}
        </div>
      ) : null}

      <JoinSessionModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={(sessionId, sessionName) => {
          setSelectedSessionId(sessionId);
          setOptimisticLiveSession({ id: sessionId, name: sessionName });
        }}
      />

      {requestRollOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-2xl">
            <div className="text-base font-semibold text-neutral-100">Request Roll</div>
            <div className="mt-1 text-sm text-neutral-400">
              Confirm the selected roll, or reset if you clicked the wrong one.
            </div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-neutral-500">Roll</label>
                <div className="flex items-center justify-between gap-2 rounded border border-neutral-700 bg-neutral-950 px-3 py-2">
                  <div className="text-sm font-semibold text-neutral-100">{requestCheckKey}</div>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestRollOpen(false);
                      setRequestPickMode(true);
                    }}
                    className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-300 hover:bg-neutral-900"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-wide text-neutral-500">Why</label>
                <textarea
                  className="min-h-[96px] w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
                  placeholder="Explain the request to the storyteller..."
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.currentTarget.value)}
                  disabled={Boolean(myPendingRequest) || requestingRoll}
                />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRequestRollOpen(false);
                  setRequestPickMode(false);
                }}
                className="rounded border border-neutral-700 px-3 py-2 text-sm text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await handleRequestRoll();
                  if (ok) setRequestRollOpen(false);
                }}
                disabled={Boolean(myPendingRequest) || requestingRoll}
                className={[
                  "rounded border px-3 py-2 text-sm font-semibold transition",
                  myActiveRoll
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                    : myPendingRequest
                      ? "border-amber-400 bg-amber-500/20 text-amber-200"
                      : "border-amber-400 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30",
                ].join(" ")}
              >
                {requestingRoll ? "Sending..." : "Send Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function QuestListPanel(props: {
  entries: Array<{
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<{ id: string; title: string; kind?: string; target_npc_name?: string | null; target_npc_block_id?: string | null }>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }>;
  claimingQuestId?: string | null;
  onTaskDone?: (
    entry: {
      questId: string;
      title: string;
      status: "available" | "active" | "completed" | "claimed";
      completedTaskIds: string[];
      claimedAt?: string | null;
      tasks?: Array<{
        id: string;
        title: string;
        kind?: string;
        target_npc_name?: string | null;
        target_npc_block_id?: string | null;
        target_item_id?: string | null;
      }>;
      rewards?: { faith?: number; itemIds?: string[] };
      storytellerControlled?: boolean;
    },
    task: {
      id: string;
      title: string;
      kind?: string;
      target_npc_name?: string | null;
      target_npc_block_id?: string | null;
      target_item_id?: string | null;
    }
  ) => void | Promise<void>;
  onClaim?: (entry: {
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<{
      id: string;
      title: string;
      kind?: string;
      target_npc_name?: string | null;
      target_npc_block_id?: string | null;
      target_item_id?: string | null;
    }>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }) => void | Promise<void>;
  onAbandon?: (entry: {
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<{
      id: string;
      title: string;
      kind?: string;
      target_npc_name?: string | null;
      target_npc_block_id?: string | null;
      target_item_id?: string | null;
    }>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }) => void | Promise<void>;
}) {
  const active = props.entries.filter((q) => q.status === "active" || q.status === "completed");
  const done = props.entries.filter((q) => q.status === "claimed");
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold">Quests</div>
        <div className="text-xs text-neutral-400">Accepted quests appear here and update as you progress.</div>
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Active</div>
        {active.length ? (
          active.map((q) => (
            <div key={q.questId} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-100">{q.title}</div>
                <span
                  className={[
                    "rounded px-2 py-0.5 text-[11px]",
                    q.status === "completed" ? "bg-amber-500/20 text-amber-200" : "bg-blue-500/20 text-blue-200",
                  ].join(" ")}
                >
                  {q.status === "completed" ? "Ready to claim" : "Active"}
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {(q.tasks ?? []).map((task) => {
                  const doneTask = (q.completedTaskIds ?? []).includes(task.id);
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-2 rounded border border-neutral-800 px-2 py-1">
                      <div className={["text-xs", doneTask ? "text-emerald-300" : "text-neutral-300"].join(" ")}>
                        <span className="mr-1">{doneTask ? "✓" : "○"}</span>
                        {String(task.kind ?? "").toLowerCase() === "talk_to_npc" && task.target_npc_name
                          ? `Talk to ${task.target_npc_name}`
                          : task.title}
                      </div>
                    </div>
                  );
                })}
                {q.storytellerControlled ? (
                  <div className="text-[11px] text-amber-300">Progress controlled by storyteller.</div>
                ) : null}
                <div className="text-xs text-neutral-400">
                  Tasks done: {q.completedTaskIds.length}/{(q.tasks ?? []).length || 0}
                </div>
              </div>
              {q.status === "completed" && q.storytellerControlled ? (
                <div className="mt-2 text-[11px] text-amber-300">Rewards are assigned by storyteller.</div>
              ) : null}
              {q.status === "active" && !q.storytellerControlled && props.onAbandon ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded border border-red-700/70 px-2 py-1 text-[11px] text-red-300 hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={props.claimingQuestId === q.questId}
                    onClick={() => props.onAbandon?.(q)}
                  >
                    {props.claimingQuestId === q.questId ? "Abandoning..." : "Abandon Quest"}
                  </button>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="text-sm text-neutral-400">No active quests.</div>
        )}
      </div>

      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Completed</div>
        {done.length ? (
          done.map((q) => (
            <div key={q.questId} className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-100">{q.title}</div>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-200">Claimed</span>
              </div>
              {q.claimedAt ? (
                <div className="mt-1 text-xs text-neutral-400">
                  Claimed {new Date(q.claimedAt).toLocaleString()}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="text-sm text-neutral-400">No completed quests yet.</div>
        )}
      </div>
    </div>
  );
}

function Tab(props: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: any;
}) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={[
        "rounded-xl px-3 py-2 text-sm transition relative",
        props.active ? "bg-white text-black" : "bg-neutral-950 text-neutral-200 hover:bg-neutral-900",
        props.disabled ? "opacity-40 cursor-not-allowed hover:bg-neutral-950" : "",
      ].join(" ")}
    >
      {props.children}
    </button>
  );
}

function StagePanel({
  block,
  stageState,
  linkedBlocks,
  playerShop,
}: {
  block: any;
  stageState?: any;
  linkedBlocks?: Record<string, any>;
  playerShop?: {
    characterId?: string;
    faithPoints: number;
    ownedItems: string[];
    ownedTraits?: string[];
    ownedActions?: string[];
    questProgress?: Record<string, QuestProgress>;
    claimingId?: string | null;
    claimingTraitId?: string | null;
    claimingQuestId?: string | null;
    onClaim?: (item: { id: string; itemId: string; name: string; faithRequired: number }) => void | Promise<void>;
    onClaimTraining?: (trait: { id: string; traitId: string; name: string; source: "trait" | "action" }) => void | Promise<void>;
    onQuestStart?: (quest: {
      id: string;
      title: string;
      tasks?: Array<{
        id: string;
        title?: string;
        kind?: string;
        targetNpcBlockId?: string | null;
        targetNpcName?: string | null;
        targetItemId?: string | null;
      }>;
      rewards?: { faith?: number; itemIds?: string[] };
    }) => void | Promise<void>;
    onQuestTask?: (
      quest: {
        id: string;
        title: string;
        tasks?: Array<{ id: string }>;
      },
      task: { id: string }
    ) => void | Promise<void>;
    onQuestClaim?: (quest: {
      id: string;
      title: string;
      tasks?: Array<{ id: string }>;
      rewards?: { faith?: number; itemIds?: string[] };
    }) => void | Promise<void>;
  };
}) {
  const blockType = String(block?.block_type ?? "").toLowerCase();
  const markers = blockType === "hex_crawl" ? extractHexMarkers(block?.meta) : extractMapMarkers(block?.meta);
  const [selectedMarkerBlockId, setSelectedMarkerBlockId] = useState<string | null>(null);
  const hexFocus =
    blockType === "hex_crawl" &&
    String(stageState?.hex_focus?.block_id ?? "").trim() === String(block?.id ?? "").trim()
      ? (stageState?.hex_focus ?? null)
      : null;

  useEffect(() => {
    setSelectedMarkerBlockId(null);
  }, [block?.id]);

  const revealMap = (linkedBlocks ?? {}) as Record<string, any>;
  const selectedReveal = selectedMarkerBlockId ? revealMap[selectedMarkerBlockId] ?? null : null;
  return (
    block ? (
      <div className="space-y-3">
        <RevealCard
          kind={String(block.block_type ?? "").toLowerCase() === "npc" ? undefined : block.block_type ?? "presented"}
          title={block.title ?? block.block_type ?? "Presented"}
          body={block.body ?? ""}
          className="border-neutral-800 bg-neutral-950/40 text-neutral-100"
          hideBody={String(block.block_type ?? "").toLowerCase() === "npc"}
          childrenTop={
            String(block.block_type ?? "").toLowerCase() === "npc" ? (
              <NpcTabsCard
                meta={block.meta}
                fallbackInfo={block.body ?? ""}
                imageUrl={block.image_url ?? null}
                embedded
                hideInformationText
                defaultTab="image"
                enableImageLightbox
                npcContextIds={[
                  String(block.id ?? ""),
                  String(block.meta?.npc_binding?.npc_id ?? ""),
                  String(block.meta?.npc_library?.npc_id ?? ""),
                ]}
                playerShop={playerShop}
              />
            ) : undefined
          }
        >
          {block.image_url && ["map", "hex_crawl"].includes(blockType) ? (
            <SceneMap
              src={block.image_url}
              alt={block.title ?? "Presented"}
              markers={markers as any}
              activeMarkerId={blockType === "hex_crawl" ? String(hexFocus?.marker_id ?? "").trim() || null : null}
              showMagnifier
              initialZoom={blockType === "hex_crawl" ? 12 : 2}
              onMarkerClick={(m) => {
                if (blockType === "map" && m.targetBlockId) setSelectedMarkerBlockId(m.targetBlockId);
              }}
            />
          ) : block.image_url && String(block.block_type ?? "").toLowerCase() !== "npc" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.image_url} alt={block.title ?? "Presented"} className="w-full rounded-lg border border-neutral-800" />
          ) : null}
        </RevealCard>

        {selectedReveal ? (
          <details open className="rounded-xl border border-neutral-700 bg-neutral-950/60 p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Marker Reveal: {selectedReveal.title ?? selectedReveal.block_type ?? "Details"}
            </summary>
            <div className="mt-3">
              <RevealCard
                kind={String(selectedReveal.block_type ?? "").toLowerCase() === "npc" ? undefined : selectedReveal.block_type ?? "reveal"}
                title={selectedReveal.title ?? selectedReveal.block_type ?? "Reveal"}
                body={selectedReveal.body ?? ""}
                className="border-neutral-700 bg-neutral-950/40 text-neutral-100"
                hideBody={String(selectedReveal.block_type ?? "").toLowerCase() === "npc"}
                childrenTop={
                  String(selectedReveal.block_type ?? "").toLowerCase() === "npc" ? (
                    <NpcTabsCard
                      meta={selectedReveal.meta}
                      fallbackInfo={selectedReveal.body ?? ""}
                      imageUrl={selectedReveal.image_url ?? null}
                      embedded
                      hideInformationText
                      defaultTab="image"
                      enableImageLightbox
                      npcContextIds={[
                        String(selectedReveal.id ?? ""),
                        String(selectedReveal.meta?.npc_binding?.npc_id ?? ""),
                        String(selectedReveal.meta?.npc_library?.npc_id ?? ""),
                      ]}
                      playerShop={playerShop}
                    />
                  ) : undefined
                }
              >
                {selectedReveal.image_url && String(selectedReveal.block_type ?? "").toLowerCase() !== "npc" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedReveal.image_url} alt={selectedReveal.title ?? "Reveal"} className="w-full rounded-lg border border-neutral-800" />
                ) : null}
              </RevealCard>
            </div>
          </details>
        ) : null}
        {blockType === "hex_crawl" && hexFocus ? (
          <div className="rounded-xl border border-neutral-700 bg-neutral-950/60 p-3 space-y-2">
            <div className="text-xs uppercase tracking-wide text-neutral-400">Focused Hex</div>
            <div className="text-sm font-semibold text-neutral-100">{String(hexFocus?.label ?? "Hex")}</div>
            {String(hexFocus?.player_text ?? "").trim() ? (
              <div className="text-sm text-neutral-200 whitespace-pre-wrap">{String(hexFocus.player_text)}</div>
            ) : null}
            {String(hexFocus?.focus_image_url ?? "").trim() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={String(hexFocus.focus_image_url)}
                alt={String(hexFocus?.label ?? "Focused hex")}
                className="w-full rounded-lg border border-neutral-700"
              />
            ) : null}
            {(String(hexFocus?.check_key ?? "").trim() || Number.isFinite(Number(hexFocus?.check_dc ?? NaN))) ? (
              <div className="text-xs text-emerald-300">
                Check: {String(hexFocus?.check_key ?? "").trim() || "n/a"}
                {Number.isFinite(Number(hexFocus?.check_dc ?? NaN))
                  ? ` | DC ${Math.max(0, Math.floor(Number(hexFocus.check_dc)))}`
                  : ""}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    ) : (
      <div className="text-sm text-neutral-300">
        When the storyteller clicks <span className="text-neutral-100">Present to Players</span>, it will appear here.
      </div>
    )
  );
}

function EncounterPanel(props: {
  encounter: any;
  myCombatant: any;
  actionPreview?: EncounterActionPreview;
  targetingActionId?: string | null;
  selectedTargetId?: string | null;
  manualValue: string;
  setManualValue: (value: string) => void;
  submitting: boolean;
  movingToken?: boolean;
  onSubmitManual: () => void | Promise<void>;
  onSubmitDigital: () => void | Promise<void>;
  onMoveToken?: (x: number, y: number) => void | Promise<void>;
  onCombatantClick?: (combatantId: string) => void;
}) {
  const currentTurn = props.encounter.combatants[props.encounter.turn_index] ?? null;
  const needsInitiative =
    props.encounter.status === "initiative_pending" &&
    props.myCombatant &&
    !Number.isFinite(Number(props.myCombatant.initiative_total ?? NaN));
  const gridCols = Math.max(1, Number(props.encounter.grid?.cols ?? 12));
  const gridRows = Math.max(1, Number(props.encounter.grid?.rows ?? 12));
  const lineOpacity = Math.max(0.05, Math.min(1, Number(props.encounter.grid?.line_opacity ?? 0.2) || 0.2));
  const feetPerSquare = Math.max(1, Number(props.encounter.grid?.feet_per_square ?? 5) || 5);
  const meleeCells = Math.max(1, 5 / feetPerSquare);
  const meleeDiameterPct = (meleeCells * 2 * 100) / gridCols;
  const actionCells = props.actionPreview?.rangeFeet ? Math.max(0, props.actionPreview.rangeFeet / feetPerSquare) : 0;
  const actionDiameterPct = actionCells > 0 ? (actionCells * 2 * 100) / gridCols : 0;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Encounter</div>
          <div className="text-xs text-neutral-400">
            {props.encounter.title} | {props.encounter.status === "initiative_pending" ? "Initiative Pending" : `Round ${props.encounter.round}`}
          </div>
        </div>
        {currentTurn && props.encounter.status === "active" ? (
          <div className="text-xs text-emerald-300">Current Turn: {currentTurn.name}</div>
        ) : null}
      </div>

      {props.encounter.summary ? <div className="text-sm text-neutral-300">{props.encounter.summary}</div> : null}

      {props.encounter.objectives?.length ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Objectives</div>
          <div className="mt-2 space-y-1">
            {props.encounter.objectives.map((objective: string, index: number) => (
              <div key={`${objective}-${index}`} className="text-sm text-neutral-200">
                {index + 1}. {objective}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {props.encounter.map_image_url ? (
        <div className="rounded-xl border border-neutral-800 overflow-hidden">
          <div
            className="relative"
            onClick={(e) => {
              if (props.targetingActionId) return;
              if (!props.onMoveToken) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              void props.onMoveToken(x, y);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={props.encounter.map_image_url} alt={props.encounter.title} className="w-full h-auto block" />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  `linear-gradient(to right, rgba(255,255,255,${lineOpacity}) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,${lineOpacity}) 1px, transparent 1px)`,
                backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
                backgroundPosition: `${Number(props.encounter.grid?.offset_x ?? 0) || 0}px ${Number(props.encounter.grid?.offset_y ?? 0) || 0}px`,
              }}
            />
            {props.encounter.combatants.map((row: any) => {
              const x = Number.isFinite(Number(row?.x ?? NaN)) ? Number(row.x) : null;
              const y = Number.isFinite(Number(row?.y ?? NaN)) ? Number(row.y) : null;
              if (x == null || y == null) return null;
              const hpMax = Math.max(1, Number(row?.hp_max ?? 1) || 1);
              const hpCurrent = Math.max(0, Number(row?.hp_current ?? hpMax) || 0);
              const ratio = hpCurrent / hpMax;
              const barTone = ratio <= 0.25 ? "bg-red-500" : ratio <= 0.5 ? "bg-orange-500" : "bg-emerald-500";
              const isCurrent = props.encounter.status === "active" && currentTurn?.id === row.id;
              const imageUrl = String(row?.image_url ?? "").trim();
              const label = String(row?.name ?? row?.kind ?? "Unit").trim();
              const initials = label
                .split(/\s+/)
                .map((part: string) => part.slice(0, 1))
                .join("")
                .slice(0, 2)
                .toUpperCase();
              return (
                <div key={row.id}>
                  <div
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-red-300/35 bg-red-400/10"
                    style={{ left: `${x}%`, top: `${y}%`, width: `${meleeDiameterPct}%`, aspectRatio: "1 / 1" }}
                  />
                  {props.myCombatant && row.id === props.myCombatant.id && actionDiameterPct > 0 ? (
                    <div
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/70 bg-cyan-400/10 shadow-[0_0_28px_rgba(34,211,238,0.35)]"
                      style={{ left: `${x}%`, top: `${y}%`, width: `${actionDiameterPct}%`, aspectRatio: "1 / 1" }}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onCombatantClick?.(String(row.id));
                    }}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={[
                        "h-12 w-12 overflow-hidden rounded-full border-2 shadow-lg",
                        row.kind === "player" ? "border-cyan-300 bg-cyan-950" : "border-neutral-100/80 bg-neutral-900",
                        isCurrent ? "ring-2 ring-emerald-400" : "",
                        props.selectedTargetId === row.id ? "ring-2 ring-amber-300" : "",
                        props.targetingActionId ? "shadow-[0_0_22px_rgba(251,191,36,0.35)]" : "",
                      ].join(" ")}
                    >
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">{initials || "?"}</div>
                      )}
                    </div>
                    <div className="min-w-[3.5rem] rounded-full bg-black/70 px-2 py-1 text-center text-[10px] font-medium text-white">{label}</div>
                    {Number.isFinite(Number(row?.hp_max ?? NaN)) ? (
                      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
                        <div className={`h-full ${barTone}`} style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                      </div>
                    ) : null}
                  </div>
                </button>
                </div>
              );
            })}
            <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-neutral-100">
              {feetPerSquare} ft / square
            </div>
            {props.myCombatant ? (
              <div className="absolute bottom-2 left-2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-neutral-100">
                {props.movingToken ? "Moving..." : "Click map to move your token"}
              </div>
            ) : null}
            {props.actionPreview ? (
              <div className="absolute left-2 top-2 rounded-full bg-cyan-500/20 px-3 py-1 text-[11px] text-cyan-100">
                {props.actionPreview.label}: {props.actionPreview.rangeFeet ?? 0} ft range
              </div>
            ) : null}
            {props.targetingActionId ? (
              <div className="absolute left-2 top-10 rounded-full bg-amber-500/20 px-3 py-1 text-[11px] text-amber-100">
                Select a target on the map
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {needsInitiative ? (
        <div className="rounded-xl border border-amber-300/50 bg-amber-500/10 p-3 space-y-3">
          <div className="text-sm font-semibold text-amber-100">Roll Initiative</div>
          <div className="text-xs text-amber-50/90">
            Initiative modifier: {props.myCombatant.initiative_mod >= 0 ? "+" : ""}
            {props.myCombatant.initiative_mod}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={props.onSubmitDigital}
              disabled={props.submitting}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-60"
            >
              {props.submitting ? "Rolling..." : "Roll d20"}
            </button>
            <input
              value={props.manualValue}
              onChange={(e) => props.setManualValue(e.currentTarget.value)}
              className="w-28 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
              placeholder="Manual d20"
              inputMode="numeric"
            />
            <button
              type="button"
              onClick={props.onSubmitManual}
              disabled={props.submitting}
              className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-60"
            >
              Submit Manual
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
        <div className="text-xs uppercase tracking-wide text-neutral-400">Initiative Order</div>
        <div className="mt-2 space-y-1">
          {props.encounter.combatants.map((row: any, index: number) => {
            const isCurrent = props.encounter.status === "active" && index === props.encounter.turn_index;
            const total = Number.isFinite(Number(row.initiative_total ?? NaN)) ? row.initiative_total : "—";
            return (
              <div
                key={row.id}
                className={[
                  "flex items-center justify-between rounded px-2 py-1 text-sm",
                  isCurrent ? "bg-emerald-500/15 text-emerald-100" : "text-neutral-200",
                ].join(" ")}
              >
                <div>
                  {index + 1}. {row.name}
                  <span className="ml-2 text-xs text-neutral-500">{row.kind}</span>
                </div>
                <div className="text-xs">
                  {total}
                  <span className="ml-2 text-neutral-500">
                    ({row.initiative_mod >= 0 ? "+" : ""}
                    {row.initiative_mod})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {props.encounter.combat_log?.length ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Combat Log</div>
          <div className="mt-2 space-y-1">
            {props.encounter.combat_log.slice().reverse().slice(0, 8).map((entry: any) => (
              <div key={entry.id} className="rounded border border-neutral-800 bg-neutral-950/50 px-2 py-1">
                <div className="text-[10px] uppercase text-neutral-500">{entry.type}</div>
                <div className="text-sm text-neutral-200">{entry.text}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ActionListPanel(props: {
  characterId: string;
  actions: Array<{
    id: string;
    name: string;
    type?: string | null;
    tags?: string[];
    action_config?: ActionConfig;
    summary?: string | null;
    rules_text?: string | null;
    range_normal?: number | null;
    range_max?: number | null;
    uses_attack_roll?: boolean | null;
    save_ability?: string | null;
    save_dc_override?: number | null;
    damage_dice?: string | null;
    damage_bonus?: number | null;
    attack_bonus_override?: number | null;
    damage_type?: string | null;
    on_fail?: string | null;
    on_success?: string | null;
  }>;
  sessionId?: string | null;
  sessionRoster?: SessionRosterEntry[];
  onActionPreviewChange?: (preview: EncounterActionPreview) => void;
  combatMode?: boolean;
  actionUsed?: boolean;
  usedActionId?: string | null;
  encounterCombatants?: any[];
  targetingActionId?: string | null;
  combatTargetByAction?: Record<string, string>;
  onBeginTargeting?: (actionId: string) => void;
  onUsePoint?: (actionId: string, targetCharacterId: string) => void | Promise<void>;
  pointActionBusyId?: string | null;
  attackAdvantageSources?: string[];
  temporaryAttackAdvantageEffectIds?: string[];
  temporaryAttackAdvantageSources?: string[];
  temporaryDamageBonus?: number;
  temporaryDamageBonusEffectIds?: string[];
  temporaryDamageBonusSources?: string[];
  temporaryRerollEffectIds?: string[];
  temporaryRerollSources?: string[];
}) {
  const [rolls, setRolls] = useState<Record<string, { hit?: string; damage?: string; hitSuccess?: boolean; targetId?: string }>>({});
  const [pointTargetByAction, setPointTargetByAction] = useState<Record<string, string>>({});
  const HEAL_TYPES = new Set(["healing", "temporary_hp"]);
  const router = useRouter();

  function rollDie(sides: number) {
    return Math.floor(Math.random() * sides) + 1;
  }

  async function appendEncounterRollNote(text: string, type: "note" | "damage" | "heal" = "note") {
    if (!props.sessionId || !props.characterId) return;
    const res = await appendEncounterLogAction({
      sessionId: props.sessionId,
      characterId: props.characterId,
      type,
      text,
    });
    if (!res.ok) {
      alert(res.error ?? "Could not write to encounter log.");
      return;
    }
    router.refresh();
  }

  async function consumeTurnAction(action: any) {
    if (!props.sessionId || !props.characterId || !props.combatMode) return true;
    if (props.actionUsed) return false;
    const res = await consumeEncounterTurnActionAction({
      sessionId: props.sessionId,
      characterId: props.characterId,
      actionId: String(action?.id ?? ""),
      actionName: String(action?.name ?? ""),
    });
    if (!res.ok) {
      alert(res.error ?? "Your action is already used this turn.");
      return false;
    }
    return true;
  }

  function setActionPreview(action: any | null) {
    if (!props.onActionPreviewChange) return;
    if (!action) {
      props.onActionPreviewChange(null);
      return;
    }
    const rangeFeet = Number.isFinite(Number(action?.range_normal ?? NaN)) ? Math.max(0, Number(action.range_normal)) : null;
    props.onActionPreviewChange({
      actionId: String(action?.id ?? ""),
      label: String(action?.name ?? "Action"),
      rangeFeet,
      meleeFeet: 5,
    });
  }

  function selectedTargetLabel(actionId: string) {
    const targetId = String(props.combatTargetByAction?.[actionId] ?? "").trim();
    if (!targetId) return "";
    return String((props.encounterCombatants ?? []).find((row: any) => String(row?.id ?? "") === targetId)?.name ?? "").trim();
  }

  async function consumeFirstRerollEffect() {
    const effectId = String((props.temporaryRerollEffectIds ?? [])[0] ?? "").trim();
    if (!props.sessionId || !props.characterId || !effectId) return true;
    const res = await consumePointSupportEffectsAction({
      sessionId: props.sessionId,
      characterId: props.characterId,
      effectIds: [effectId],
    });
    if (!res.ok) {
      alert(res.error ?? "Could not consume reroll effect.");
      return false;
    }
    router.refresh();
    return true;
  }

  async function rollHit(action: any, isReroll = false) {
    const targetId = String(props.combatTargetByAction?.[String(action.id)] ?? "").trim();
    const target = (props.encounterCombatants ?? []).find((row: any) => String(row?.id ?? "") === targetId) ?? null;
    const targetLabel = String(target?.name ?? "").trim();
    if (props.combatMode && !targetLabel) {
      alert("Choose a target on the map first.");
      return;
    }
    const bonus = Number(action.attack_bonus_override ?? 0);
    const attackAdvantageSources = [
      ...(props.attackAdvantageSources ?? []),
      ...(props.temporaryAttackAdvantageSources ?? []),
    ];
    const hasAttackAdvantage = Array.isArray(attackAdvantageSources) && attackAdvantageSources.length > 0;
    const d20 = rollDie(20);
    const d20b = hasAttackAdvantage ? rollDie(20) : null;
    const chosen = d20b == null ? d20 : Math.max(d20, d20b);
    const total = chosen + (Number.isFinite(bonus) ? bonus : 0);
    const targetDefense = Number.isFinite(Number(target?.defense ?? NaN)) ? Number(target.defense) : null;
    if (props.combatMode && targetDefense == null) {
      alert(`${targetLabel || "That target"} has no defense/AC set yet.`);
      setRolls((prev) => ({
        ...prev,
        [action.id]: {
          ...(prev[action.id] ?? {}),
          hit: `${targetLabel || "Target"} has no defense/AC set yet.`,
          hitSuccess: null,
          targetId,
        },
      }));
      return;
    }
    const hitSuccess = targetDefense == null ? null : total >= targetDefense;
    setRolls((prev) => ({
      ...prev,
      [action.id]: {
        ...(prev[action.id] ?? {}),
        hit: hasAttackAdvantage
          ? `${total} (adv ${chosen} from [${d20}, ${d20b}]${bonus ? ` + ${bonus}` : ""})${targetDefense != null ? ` vs AC ${targetDefense} ${hitSuccess ? "HIT" : "MISS"}` : ""}`
          : `${total} (d20 ${d20}${bonus ? ` + ${bonus}` : ""})${targetDefense != null ? ` vs AC ${targetDefense} ${hitSuccess ? "HIT" : "MISS"}` : ""}`,
        hitSuccess,
        targetId,
      },
    }));
    await appendEncounterRollNote(
      `${String(action.name ?? "Action")}${targetLabel ? ` vs ${targetLabel}` : ""} hit roll: ${total}${hasAttackAdvantage ? ` with advantage [${d20}, ${d20b}]` : ` on d20 ${d20}`}${bonus ? ` + ${bonus}` : ""}${targetDefense != null ? ` against AC ${targetDefense} ${hitSuccess ? "HIT" : "MISS"}` : ""}.`,
      "note"
    );
    if (isReroll) {
      const ok = await consumeFirstRerollEffect();
      if (!ok) return;
    }
    if (props.sessionId && props.characterId && (props.temporaryAttackAdvantageEffectIds ?? []).length) {
      const res = await consumePointSupportEffectsAction({
        sessionId: props.sessionId,
        characterId: props.characterId,
        effectIds: props.temporaryAttackAdvantageEffectIds ?? [],
      });
      if (!res.ok) {
        alert(res.error ?? "Could not consume Point attack bonus.");
        return;
      }
      router.refresh();
    }
  }

  async function rollDamage(action: any, isReroll = false) {
    const actionRoll = rolls[String(action.id)] ?? {};
    const targetId = String(actionRoll.targetId ?? props.combatTargetByAction?.[String(action.id)] ?? "").trim();
    const target = (props.encounterCombatants ?? []).find((row: any) => String(row?.id ?? "") === targetId) ?? null;
    const targetLabel = String(target?.name ?? "").trim();
    if (props.combatMode && !targetLabel) {
      alert("Choose a target on the map first.");
      return;
    }
    if (props.combatMode && actionRoll.hitSuccess === false) {
      alert("That attack missed. You cannot roll damage for it.");
      return;
    }
    if (props.combatMode && actionRoll.hitSuccess !== true && !HEAL_TYPES.has(String(action.damage_type ?? "").toLowerCase())) {
      alert("Roll to hit first.");
      return;
    }
    const formula = String(action.damage_dice ?? "").trim().toLowerCase();
    const bonusFromField = Number(action.damage_bonus ?? 0);
    const m = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return;
    const count = Math.max(1, Number(m[1] || 1));
    const sides = Math.max(2, Number(m[2] || 2));
    const inlineBonus = Number(m[3] || 0);
    const tempBonus = Math.max(0, Number(props.temporaryDamageBonus ?? 0) || 0);
    const bonus =
      (Number.isFinite(inlineBonus) ? inlineBonus : 0) +
      (Number.isFinite(bonusFromField) ? bonusFromField : 0) +
      tempBonus;
    const rollsArr = Array.from({ length: count }, () => rollDie(sides));
    const total = rollsArr.reduce((t, n) => t + n, 0) + bonus;
    const outcomeLabel = HEAL_TYPES.has(String(action.damage_type ?? "").toLowerCase()) ? "heal" : "damage";
    setRolls((prev) => ({
      ...prev,
      [action.id]: {
        ...(prev[action.id] ?? {}),
        damage: `${total} ${outcomeLabel} ([${rollsArr.join(", ")}]${bonus ? ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""})`,
        targetId,
      },
    }));
    if (props.combatMode && targetId) {
      if (outcomeLabel === "damage") {
        const res = await applyEncounterDamageAction({
          sessionId: String(props.sessionId ?? ""),
          characterId: props.characterId,
          targetCombatantId: targetId,
          amount: total,
          sourceActionName: String(action.name ?? ""),
        });
        if (!res.ok) {
          alert(res.error ?? "Could not apply damage to target.");
          return;
        }
      } else if (outcomeLabel === "heal") {
        const res = await applyEncounterHealingAction({
          sessionId: String(props.sessionId ?? ""),
          characterId: props.characterId,
          targetCombatantId: targetId,
          amount: total,
          sourceActionName: String(action.name ?? ""),
        });
        if (!res.ok) {
          alert(res.error ?? "Could not apply healing to target.");
          return;
        }
      }
    }
    if (!(props.combatMode && targetId)) {
      await appendEncounterRollNote(
        `${String(action.name ?? "Action")}${targetLabel ? ` vs ${targetLabel}` : ""} ${outcomeLabel} roll: ${total} from [${rollsArr.join(", ")}]${bonus ? ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""}.`,
        outcomeLabel === "heal" ? "heal" : "damage"
      );
    }
    if (isReroll) {
      const ok = await consumeFirstRerollEffect();
      if (!ok) return;
    }
    if (props.sessionId && props.characterId && (props.temporaryDamageBonusEffectIds ?? []).length) {
      const res = await consumePointSupportEffectsAction({
        sessionId: props.sessionId,
        characterId: props.characterId,
        effectIds: props.temporaryDamageBonusEffectIds ?? [],
      });
      if (!res.ok) {
        alert(res.error ?? "Could not consume Point damage bonus.");
        return;
      }
      router.refresh();
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-semibold">Actions</div>
      {props.actions.length ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-neutral-800">
          <div className="grid grid-cols-12 gap-2 border-b border-neutral-800 bg-neutral-900/50 px-3 py-2 text-[11px] uppercase tracking-wide text-neutral-400">
            <div className="col-span-3">Attack</div>
            <div className="col-span-2">Range</div>
            <div className="col-span-2">Hit / DC</div>
            <div className="col-span-2">Damage</div>
            <div className="col-span-3">Notes</div>
          </div>
          {props.actions.map((a) => (
            <div
              key={a.id}
              className="grid grid-cols-12 gap-2 border-b border-neutral-800 px-3 py-2 text-sm last:border-b-0"
              onMouseEnter={() => setActionPreview(a)}
              onMouseLeave={() => setActionPreview(null)}
              onFocus={() => setActionPreview(a)}
              onBlur={() => setActionPreview(null)}
            >
              {(() => {
                const actionConfig = normalizeActionConfig(a.action_config);
                const availableTargets =
                  actionConfig?.kind === "targeted_support"
                    ? (props.sessionRoster ?? []).filter((row) =>
                        actionConfig.target_scope === "ally_or_self"
                          ? true
                          : String(row.characterId) !== String(props.characterId)
                      )
                    : [];
                const hasReroll = (props.temporaryRerollEffectIds ?? []).length > 0;
                const combatTarget = selectedTargetLabel(String(a.id));
                const targetRequired = Boolean(props.combatMode);
                const otherActionLocked = Boolean(props.combatMode && props.actionUsed && props.usedActionId && props.usedActionId !== a.id);
                const thisActionAlreadyUsed = Boolean(props.combatMode && props.actionUsed && props.usedActionId === a.id);
                return (
                  <>
              <div className="col-span-3 min-w-0">
                <div className="truncate font-semibold text-neutral-100">{a.name}</div>
                <div className="text-[11px] text-neutral-400">{a.type ?? "other"}</div>
              </div>
              <div className="col-span-2 text-xs text-neutral-300">
                {a.range_normal ? `${a.range_normal} ft.` : ""}
                {a.range_max ? ` (${a.range_max})` : ""}
              </div>
              <div className="col-span-2 text-xs text-neutral-300">
                {actionConfig?.kind === "targeted_support" ? (
                  <div className="space-y-1">
                    {props.combatMode ? (
                      <>
                        <button
                          type="button"
                          className={[
                            "rounded border px-2 py-1 text-[11px]",
                            props.targetingActionId === a.id
                              ? "border-amber-400 bg-amber-500/20 text-amber-200 shadow-[0_0_0_2px_rgba(251,191,36,0.25),0_0_14px_rgba(245,158,11,0.35)] animate-pulse"
                              : "border-neutral-700 hover:bg-neutral-900",
                          ].join(" ")}
                          onClick={() => props.onBeginTargeting?.(String(a.id))}
                        >
                          {combatTarget ? `Target: ${combatTarget}` : "Choose Target"}
                        </button>
                      </>
                    ) : (
                      <select
                        value={pointTargetByAction[a.id] ?? ""}
                        onChange={(e) =>
                          setPointTargetByAction((prev) => ({
                            ...prev,
                            [a.id]: e.currentTarget.value,
                          }))
                        }
                        className="w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-[11px]"
                        disabled={!props.sessionId || Boolean(props.pointActionBusyId)}
                      >
                        <option value="">{actionConfig.target_scope === "ally_or_self" ? "Choose ally or self" : "Choose ally"}</option>
                        {availableTargets.map((row) => (
                          <option key={row.characterId} value={row.characterId}>
                            {row.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      className={[
                        "rounded px-2 py-0.5 text-[11px] disabled:opacity-60",
                        props.combatMode
                          ? "border border-green-300 bg-green-500/15 shadow-[0_0_0_2px_rgba(74,222,128,0.8),0_0_24px_rgba(34,197,94,0.95),0_0_44px_rgba(34,197,94,0.55)] animate-pulse"
                          : "border border-neutral-700 hover:bg-neutral-900",
                      ].join(" ")}
                      disabled={
                        !props.sessionId ||
                        (!props.combatMode && (!availableTargets.length || !String(pointTargetByAction[a.id] ?? "").trim())) ||
                        (props.combatMode && !combatTarget) ||
                        Boolean(props.pointActionBusyId) ||
                        Boolean(props.combatMode && props.actionUsed)
                      }
                      onClick={() =>
                        props.onUsePoint?.(
                          a.id,
                          props.combatMode
                            ? String(
                                (props.encounterCombatants ?? []).find((row: any) => String(row?.id ?? "") === String(props.combatTargetByAction?.[a.id] ?? ""))?.character_id ?? ""
                              ).trim()
                            : String(pointTargetByAction[a.id] ?? "").trim()
                        )
                      }
                    >
                      {props.actionUsed ? "Action Used" : props.pointActionBusyId === a.id ? "Applying..." : "Use Action"}
                    </button>
                  </div>
                ) : a.uses_attack_roll !== false && a.attack_bonus_override != null ? (
                  <div className="space-y-1">
                    <div>+{a.attack_bonus_override}</div>
                    <button
                      type="button"
                      className={[
                        "rounded px-2 py-0.5 text-[11px]",
                        props.combatMode
                          ? "border border-green-300 bg-green-500/15 shadow-[0_0_0_2px_rgba(74,222,128,0.8),0_0_24px_rgba(34,197,94,0.95),0_0_44px_rgba(34,197,94,0.55)] animate-pulse"
                          : "border border-neutral-700 hover:bg-neutral-900",
                      ].join(" ")}
                      disabled={Boolean(props.combatMode && props.actionUsed)}
                      onClick={async () => {
                        const ok = await consumeTurnAction(a);
                        if (!ok) return;
                        await rollHit(a);
                      }}
                    >
                      {props.actionUsed ? "Action Used" : "Roll Hit"}
                    </button>
                    {targetRequired ? (
                      <button
                        type="button"
                        className={[
                          "rounded px-2 py-0.5 text-[11px]",
                          props.targetingActionId === a.id
                            ? "border border-amber-400 bg-amber-500/20 text-amber-200 shadow-[0_0_0_2px_rgba(251,191,36,0.25),0_0_14px_rgba(245,158,11,0.35)] animate-pulse"
                            : "border border-neutral-700 hover:bg-neutral-900",
                        ].join(" ")}
                        onClick={() => props.onBeginTargeting?.(String(a.id))}
                      >
                        {combatTarget ? `Target: ${combatTarget}` : "Choose Target"}
                      </button>
                    ) : null}
                    {Array.isArray([...((props.attackAdvantageSources ?? []) as string[]), ...((props.temporaryAttackAdvantageSources ?? []) as string[])]) &&
                    [...(props.attackAdvantageSources ?? []), ...(props.temporaryAttackAdvantageSources ?? [])].length ? (
                      <div className="text-[11px] text-emerald-300">
                        Adv: {[...(props.attackAdvantageSources ?? []), ...(props.temporaryAttackAdvantageSources ?? [])].join(", ")}
                      </div>
                    ) : null}
                    {rolls[a.id]?.hit ? <div className="text-emerald-300">{rolls[a.id]?.hit}</div> : null}
                    {hasReroll && rolls[a.id]?.hit ? (
                      <button
                        type="button"
                        className="rounded border border-amber-600/70 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-neutral-900"
                        onClick={() => rollHit(a, true)}
                      >
                        Reroll Hit
                      </button>
                    ) : null}
                  </div>
                ) : a.save_dc_override != null ? (
                  <div>{`DC ${a.save_dc_override}${a.save_ability ? ` ${String(a.save_ability).toUpperCase()}` : ""}`}</div>
                ) : null}
              </div>
              <div className="col-span-2 text-xs text-neutral-300">
                {a.damage_dice ? (
                  <div>
                    <div>{`${a.damage_dice}${a.damage_type ? ` ${a.damage_type}` : ""}`}</div>
                    {Number(props.temporaryDamageBonus ?? 0) > 0 ? (
                      <div className="text-[11px] text-emerald-300">
                        +{props.temporaryDamageBonus} dmg: {(props.temporaryDamageBonusSources ?? []).join(", ")}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      className={[
                        "mt-1 rounded px-2 py-0.5 text-[11px]",
                        props.combatMode
                          ? "border border-green-300 bg-green-500/15 shadow-[0_0_0_2px_rgba(74,222,128,0.8),0_0_24px_rgba(34,197,94,0.95),0_0_44px_rgba(34,197,94,0.55)] animate-pulse"
                          : "border border-neutral-700 hover:bg-neutral-900",
                      ].join(" ")}
                      disabled={otherActionLocked}
                      onClick={async () => {
                        const needsOwnActionSpend = a.uses_attack_roll === false;
                        if (needsOwnActionSpend && !thisActionAlreadyUsed) {
                          const ok = await consumeTurnAction(a);
                          if (!ok) return;
                        }
                        await rollDamage(a);
                      }}
                    >
                      {otherActionLocked ? "Action Used" : HEAL_TYPES.has(String(a.damage_type ?? "").toLowerCase()) ? "Roll Heal" : "Roll Dmg"}
                    </button>
                    {targetRequired ? (
                      <div className="text-[11px] text-amber-200">{combatTarget ? `Targeting ${combatTarget}` : "Choose a target on the map"}</div>
                    ) : null}
                    {rolls[a.id]?.damage ? <div className="text-emerald-300">{rolls[a.id]?.damage}</div> : null}
                    {hasReroll && rolls[a.id]?.damage ? (
                      <button
                        type="button"
                        className="mt-1 rounded border border-amber-600/70 px-2 py-0.5 text-[11px] text-amber-200 hover:bg-neutral-900"
                        onClick={() => rollDamage(a, true)}
                      >
                        Reroll Dmg
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="col-span-3 text-xs text-neutral-300">
                {a.summary?.trim() ? <div>{a.summary}</div> : null}
                {!a.summary?.trim() && a.rules_text?.trim() ? (
                  <div className="line-clamp-2">{a.rules_text}</div>
                ) : null}
                {a.on_fail?.trim() ? <div>{`On fail: ${a.on_fail}`}</div> : null}
                {a.on_success?.trim() ? <div>{`On success: ${a.on_success}`}</div> : null}
                {hasReroll ? (
                  <div className="text-amber-300">Reroll ready: {(props.temporaryRerollSources ?? []).join(", ")}</div>
                ) : null}
              </div>
                  </>
                );
              })()}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-neutral-400">No learned actions yet.</div>
      )}
    </div>
  );
}

function TraitListPanel(props: { traits: Array<{ id: string; name: string; summary?: string | null; type?: string | null }> }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-semibold">Traits</div>
      {props.traits.length ? (
        <div className="mt-3 space-y-2">
          {props.traits.map((t) => (
            <div key={t.id} className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-neutral-100">{t.name}</div>
                <div className="text-[11px] text-neutral-400">{t.type ?? "trait"}</div>
              </div>
              {t.summary ? <div className="mt-1 text-xs text-neutral-300">{t.summary}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm text-neutral-400">No learned traits yet.</div>
      )}
    </div>
  );
}

function PendingPointChoicePanel(props: {
  effects: PointSupportEffect[];
  resolvingId?: string | null;
  onChoose: (effectId: string, choice: SupportChoice) => void | Promise<void>;
}) {
  return (
    <div className="rounded-2xl border border-amber-400/60 bg-amber-500/10 p-4">
      <div className="text-sm font-semibold text-amber-100">Support Choice</div>
      <div className="mt-1 text-xs text-amber-50/90">Choose how to resolve the active support effect.</div>
      <div className="mt-3 space-y-3">
        {props.effects.map((effect) => {
          const sourceName = String(effect.source_name ?? "").trim() || "An ally";
          const actionName = String(effect.action_name ?? "").trim() || "Support";
          const options = (Array.isArray(effect.options) ? effect.options : [])
            .map((opt) => {
              const trigger = String(opt?.trigger ?? "").trim().toLowerCase() as SupportChoice | "";
              if (!["next_attack_roll", "next_damage_roll", "next_skill_check", "reroll_next_roll"].includes(trigger)) {
                return null;
              }
              return {
                trigger: trigger as SupportChoice,
                label: String(opt?.label ?? "").trim() || null,
              };
            })
            .filter((opt): opt is { trigger: SupportChoice; label: string | null } => Boolean(opt));
          const busy = props.resolvingId === effect.id;
          return (
            <div key={effect.id} className="rounded-xl border border-amber-300/40 bg-neutral-950/40 p-3">
              <div className="text-sm text-neutral-100">{sourceName} used {actionName} on you.</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {options.map((option) => (
                  <button
                    type="button"
                    key={`${effect.id}-${option.trigger}`}
                    onClick={() => props.onChoose(effect.id, option.trigger)}
                    disabled={busy}
                    className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-60"
                  >
                    {busy ? "Choosing..." : String(option.label ?? option.trigger)}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RollRequestPanel(props: {
  prompt: string;
  guidedResult: GuidedRoll | null;
  diceMode: "digital" | "manual";
  setDiceMode: (mode: "digital" | "manual") => void;
  manualValue: string;
  manualValueB: string;
  setManualValue: (v: string) => void;
  setManualValueB: (v: string) => void;
  onSubmitManual: () => void;
  rollLocked: boolean;
  submitting: boolean;
  advantageSources?: string[];
  rerollSources?: string[];
  rerollReady?: boolean;
  rerollPendingManual?: boolean;
  onUseReroll?: () => void | Promise<void>;
}) {
  const hasAdvantage = Array.isArray(props.advantageSources) && props.advantageSources.length > 0;
  const hasReroll = Array.isArray(props.rerollSources) && props.rerollSources.length > 0;
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Roll Request</div>
        <div className="flex items-center gap-1 rounded-lg border border-neutral-700 p-1 text-xs">
          <button
            type="button"
            disabled={props.rollLocked || props.submitting}
            onClick={() => props.setDiceMode("digital")}
            className={[
              "rounded px-2 py-1",
              props.diceMode === "digital" ? "bg-neutral-200 text-neutral-900 font-semibold" : "text-neutral-300 hover:bg-neutral-800",
            ].join(" ")}
          >
            Digital Dice
          </button>
          <button
            type="button"
            disabled={props.rollLocked || props.submitting}
            onClick={() => props.setDiceMode("manual")}
            className={[
              "rounded px-2 py-1",
              props.diceMode === "manual" ? "bg-neutral-200 text-neutral-900 font-semibold" : "text-neutral-300 hover:bg-neutral-800",
            ].join(" ")}
          >
            Table Dice
          </button>
        </div>
      </div>

      <div className="mt-3 text-sm text-neutral-200">{props.prompt || "Follow the storyteller's roll instruction."}</div>
      {Array.isArray(props.advantageSources) && props.advantageSources.length ? (
        <div className="mt-2 rounded-lg border border-emerald-300/60 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          Advantage active: {props.advantageSources.join(", ")}
        </div>
      ) : null}
      {hasReroll ? (
        <div className="mt-2 rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Reroll available: {props.rerollSources?.join(", ")}
        </div>
      ) : null}

      {props.diceMode === "manual" ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-neutral-300">
            Enter only your d20 roll{hasAdvantage ? "s" : ""}. The app adds modifiers automatically.
            {props.rerollPendingManual ? " Reroll is armed for your next submit." : ""}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={20}
              value={props.manualValue}
              onChange={(e) => props.setManualValue(e.currentTarget.value)}
              placeholder="d20 roll"
              className="w-28 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
              disabled={props.rollLocked || props.submitting}
            />
            {hasAdvantage ? (
              <input
                type="number"
                min={1}
                max={20}
                value={props.manualValueB}
                onChange={(e) => props.setManualValueB(e.currentTarget.value)}
                placeholder="2nd d20"
                className="w-28 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
                disabled={props.rollLocked || props.submitting}
              />
            ) : null}
            <button
              type="button"
              onClick={props.onSubmitManual}
              disabled={props.rollLocked || props.submitting}
              className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Submit
            </button>
            {hasReroll && props.rerollReady ? (
              <button
                type="button"
                onClick={props.onUseReroll}
                disabled={props.submitting}
                className="rounded-lg border border-amber-600/70 px-3 py-1.5 text-sm text-amber-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Use Reroll
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          <span>Digital Dice active: click the glowing target to roll once.</span>
          {hasReroll && props.rerollReady ? (
            <button
              type="button"
              onClick={props.onUseReroll}
              disabled={props.submitting}
              className="rounded-lg border border-amber-600/70 px-3 py-1.5 text-sm text-amber-200 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Use Reroll
            </button>
          ) : null}
        </div>
      )}

      {props.guidedResult ? (
        <div className="mt-3 rounded-lg border border-green-300/70 bg-neutral-950/60 px-3 py-2 text-sm text-green-200">
          Result: <span className="font-semibold">{props.guidedResult.total}</span> ({props.guidedResult.breakdown})
        </div>
      ) : null}
      <div className="mt-2 text-xs text-neutral-400">
        Example: Click <span className="text-neutral-200">Perception</span> in your Skills panel, then submit your total.
      </div>
    </div>
  );
}

