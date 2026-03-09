"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import PlayerStatusHeader from "./PlayerStatusHeader";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";
import { AbilitiesCard, SavesCard, SkillsCard, PassivesCard, type AbilityKey } from "./PlayerSheetPanels";
import RollPanel from "./RollPanel";
import PlayerInventoryPanel from "./PlayerInventoryPanel";
import {
  abandonNpcQuestAction,
  claimNpcActionAction,
  claimNpcGearItemAction,
  claimNpcQuestRewardsAction,
  claimNpcTrainingTraitAction,
  completeNpcQuestTaskAction,
  leaveSessionAction,
  requestRollApprovalAction,
  startNpcQuestAction,
  submitRollResultAction,
} from "../actions";
import RevealCard from "@/components/episode-runtime/RevealCard";
import SceneMap from "@/components/episode-runtime/SceneMap";
import NpcTabsCard from "@/components/episode-runtime/NpcTabsCard";
import { extractHexMarkers, extractMapMarkers } from "@/lib/episodeRuntime";

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
type QuestProgress = {
  status: "available" | "active" | "completed" | "claimed";
  completedTaskIds: string[];
  claimedAt?: string | null;
};

const SKILL_ALIASES: Array<{ key: string; aliases: string[] }> = [
  { key: "acrobatics", aliases: ["acrobatics"] },
  { key: "animal_handling", aliases: ["animal handling", "animal_handling"] },
  { key: "arcana", aliases: ["arcana"] },
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
  "Athletics",
  "Acrobatics",
  "Stealth",
  "Survival",
  "Arcana",
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
    tasks?: Array<{ id: string; title: string; kind?: string; target_npc_name?: string | null; target_npc_block_id?: string | null }>;
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
  const stageBlock = stage?.block ?? null;
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
  const skillAdvantageMap: Record<string, boolean> = useMemo(() => {
    const out: Record<string, boolean> = {};
    SKILL_ALIASES.forEach((s) => {
      const keys = [s.key, ...s.aliases].map((v) => normalizeAdvantageKey(v));
      out[s.key] = keys.some((k) => Array.isArray(advantageMap[k]) && advantageMap[k].length > 0);
    });
    return out;
  }, [advantageMap]);
  const activePromptAdvantageSources = useMemo(() => {
    if (!rollOpen || !promptTarget) return [] as string[];
    if (promptTarget.kind === "ability") {
      return advantageMap[normalizeAdvantageKey(promptTarget.abilityKey)] ?? [];
    }
    if (promptTarget.kind === "skill") {
      return advantageMap[normalizeAdvantageKey(promptTarget.skillKey)] ?? [];
    }
    return [] as string[];
  }, [rollOpen, promptTarget, advantageMap]);
  const stageStoryText = String(stage?.session?.story_text ?? selectedSession?.story_text ?? "");
  const [diceMode, setDiceMode] = useState<"digital" | "manual">("digital");
  const [manualValue, setManualValue] = useState("");
  const [manualValueB, setManualValueB] = useState("");
  const [submittingRoll, setSubmittingRoll] = useState(false);
  const [requestingRoll, setRequestingRoll] = useState(false);
  const [requestCheckKey, setRequestCheckKey] = useState("Perception");
  const [requestMessage, setRequestMessage] = useState("");
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
  const rollLocked = rollOpen && (Boolean(guidedResult) || Boolean(flight) || alreadySubmittedRound);
  const rollRequests = Array.isArray(stageState?.roll_requests) ? (stageState.roll_requests as any[]) : [];
  const myPendingRequest = rollRequests.find(
    (r: any) =>
      String(r?.player_id ?? "").trim() === props.userId &&
      String(r?.status ?? "pending").trim().toLowerCase() === "pending"
  );
  const myActiveRoll = rollOpen && (String(stageState?.roll_target ?? "all").trim() === "all" || String(stageState?.roll_target ?? "").trim() === props.userId);

  useEffect(() => {
    if (!rollOpen) {
      setGuidedResult(null);
      setFlight(null);
      setManualValue("");
      setManualValueB("");
      setSubmittingRoll(false);
    }
  }, [rollOpen, rollPrompt]);

  async function submitRoll(value: number, source: "manual" | "digital") {
    if (!selectedSessionId) return;
    setSubmittingRoll(true);
    const res = await submitRollResultAction({
      sessionId: selectedSessionId,
      rollValue: value,
      source,
    });
    setSubmittingRoll(false);
    if (!res.ok) {
      alert(res.error ?? "Could not submit roll.");
      return;
    }
    router.refresh();
  }

  function calculateManualRollTotal(rawA: number, rawB?: number | null) {
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
    const advText =
      hasAdvantage && Number.isFinite(Number(rawB))
        ? `adv[d20(${rawA}), d20(${Number(rawB)})=>${pickedDie}]`
        : `d20(${pickedDie})`;
    const sign = bonus >= 0 ? "+" : "-";
    const absBonus = Math.abs(bonus);
    const breakdown =
      promptTarget?.kind === "die"
        ? `${advText}`
        : `${advText} ${sign} ${absBonus} (${bonusLabel})`;
    return { total, breakdown };
  }

  async function handleRequestRoll() {
    if (!selectedSessionId || requestingRoll || myPendingRequest) return;
    setRequestingRoll(true);
    try {
      const res = await requestRollApprovalAction({
        sessionId: selectedSessionId,
        checkKey: requestCheckKey,
        message: requestMessage.trim() || undefined,
      });
      if (!res.ok) {
        alert(res.error ?? "Could not send roll request.");
        return;
      }
      setRequestMessage("");
      router.refresh();
    } finally {
      setRequestingRoll(false);
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
    if (diceMode !== "digital") return;
    if (rollLocked) return;
    if (!rollOpen || promptTarget?.kind !== "ability" || promptTarget.abilityKey !== ability) return;
    launchRollFlight(fromRect, { label: meta.label, total: meta.total, breakdown: meta.breakdown ?? "" });
  }

  function handleSkillGuidedRoll(skillKey: string, meta: { label: string; total: number; breakdown?: string }, fromRect: DOMRect) {
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
    tasks?: Array<{ id: string; title?: string; kind?: string; targetNpcBlockId?: string | null; targetNpcName?: string | null }>;
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
    quest: { id: string; title: string; tasks?: Array<{ id: string }> },
    task: { id: string }
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
          <aside className="lg:col-span-3 space-y-4">
            <AbilitiesCard
              stat={stat}
              highlightAbility={promptTarget?.kind === "ability" ? promptTarget.abilityKey : null}
              onAbilityRoll={handleAbilityGuidedRoll}
              rollLocked={rollLocked || diceMode === "manual" || submittingRoll}
              advantageByAbility={abilityAdvantageMap}
            />
            <SavesCard stat={stat} highlightAbility={promptTarget?.kind === "ability" ? promptTarget.abilityKey : null} />
            <PassivesCard stat={stat} />

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">
              Signed in as {props.userEmail} - {props.accessLabel}
            </div>
          </aside>

          <section className="lg:col-span-6">
            <div className="mb-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-sm font-semibold">Stage</div>

              <div className="mt-4 space-y-4">
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

                {rollOpen ? (
                  <div ref={promptBoxRef}>
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
                        const computed = calculateManualRollTotal(rawA, rawB);
                        setGuidedResult({ label: "Table Dice", total: computed.total, breakdown: computed.breakdown });
                        await submitRoll(computed.total, "manual");
                      }}
                      rollLocked={rollLocked}
                      submitting={submittingRoll}
                      advantageSources={activePromptAdvantageSources}
                    />
                  </div>
                ) : null}

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
              <Tab active={tab === "actions"} onClick={() => setTab("actions")}>Actions</Tab>
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
                      { id: entry.questId, title: entry.title, tasks: (entry.tasks ?? []).map((t) => ({ id: t.id })) },
                      { id: task.id }
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
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Actions</div>
                  {selectedSessionId ? (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950/50 p-3 space-y-2">
                      <div className="text-xs uppercase tracking-wide text-neutral-400">Request Roll</div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        <select
                          className="rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
                          value={requestCheckKey}
                          onChange={(e) => setRequestCheckKey(e.currentTarget.value)}
                          disabled={Boolean(myPendingRequest) || requestingRoll}
                        >
                          {REQUESTABLE_CHECKS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <input
                          className="md:col-span-2 rounded border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
                          placeholder="Optional plan for storyteller..."
                          value={requestMessage}
                          onChange={(e) => setRequestMessage(e.currentTarget.value)}
                          disabled={Boolean(myPendingRequest) || requestingRoll}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleRequestRoll}
                        disabled={Boolean(myPendingRequest) || requestingRoll}
                        className={[
                          "rounded border px-3 py-2 text-sm font-semibold transition",
                          myActiveRoll
                            ? "border-emerald-400 bg-emerald-500/20 text-emerald-200 shadow-[0_0_0_2px_rgba(74,222,128,0.35),0_0_22px_rgba(34,197,94,0.45)]"
                            : myPendingRequest
                              ? "border-amber-400 bg-amber-500/20 text-amber-200 shadow-[0_0_0_2px_rgba(251,191,36,0.25),0_0_14px_rgba(245,158,11,0.35)] animate-pulse"
                              : "border-amber-400 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30",
                        ].join(" ")}
                      >
                        {myActiveRoll ? "Roll Active" : myPendingRequest ? "Request Pending" : requestingRoll ? "Sending..." : "Request Roll"}
                      </button>
                    </div>
                  ) : null}
                  <RollPanel
                    stat={stat}
                    disabled={isLiveMode && !rollOpen}
                    disabledReason="Rolls are handled in Live Mode."
                    highlightAbility={promptTarget?.kind === "ability" ? promptTarget.abilityKey : undefined}
                    highlightSkill={promptTarget?.kind === "skill" ? promptTarget.skillKey : undefined}
                    highlightDie={promptTarget?.kind === "die" ? promptTarget.die : undefined}
                    onGuidedRoll={handleRollPanelGuided}
                    lockRoll={rollLocked || diceMode === "manual" || submittingRoll}
                    showAbilityChecks={false}
                    showSkillChecks={false}
                    showRollConsole={false}
                  />
                  <ActionListPanel actions={props.playerActions ?? []} />
                  <TraitListPanel traits={props.playerTraits ?? []} />
                </div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-3 space-y-4">
            <div className="lg:sticky lg:top-4">
              <SkillsCard
                stat={stat}
                highlightSkill={promptTarget?.kind === "skill" ? promptTarget.skillKey : null}
                onSkillRoll={handleSkillGuidedRoll}
                rollLocked={rollLocked || diceMode === "manual" || submittingRoll}
                advantageBySkill={skillAdvantageMap}
              />
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
      tasks?: Array<{ id: string; title: string; kind?: string; target_npc_name?: string | null; target_npc_block_id?: string | null }>;
      rewards?: { faith?: number; itemIds?: string[] };
      storytellerControlled?: boolean;
    },
    task: { id: string; title: string; kind?: string; target_npc_name?: string | null; target_npc_block_id?: string | null }
  ) => void | Promise<void>;
  onClaim?: (entry: {
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<{ id: string; title: string; kind?: string; target_npc_name?: string | null; target_npc_block_id?: string | null }>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }) => void | Promise<void>;
  onAbandon?: (entry: {
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<{ id: string; title: string; kind?: string; target_npc_name?: string | null; target_npc_block_id?: string | null }>;
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
      tasks?: Array<{ id: string; title?: string; kind?: string; targetNpcBlockId?: string | null; targetNpcName?: string | null }>;
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

function ActionListPanel(props: {
  actions: Array<{
    id: string;
    name: string;
    type?: string | null;
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
}) {
  const [rolls, setRolls] = useState<Record<string, { hit?: string; damage?: string }>>({});
  const HEAL_TYPES = new Set(["healing", "temporary_hp"]);

  function rollDie(sides: number) {
    return Math.floor(Math.random() * sides) + 1;
  }

  function rollHit(action: any) {
    const bonus = Number(action.attack_bonus_override ?? 0);
    const d20 = rollDie(20);
    const total = d20 + (Number.isFinite(bonus) ? bonus : 0);
    setRolls((prev) => ({
      ...prev,
      [action.id]: {
        ...(prev[action.id] ?? {}),
        hit: `${total} (d20 ${d20}${bonus ? ` + ${bonus}` : ""})`,
      },
    }));
  }

  function rollDamage(action: any) {
    const formula = String(action.damage_dice ?? "").trim().toLowerCase();
    const bonusFromField = Number(action.damage_bonus ?? 0);
    const m = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!m) return;
    const count = Math.max(1, Number(m[1] || 1));
    const sides = Math.max(2, Number(m[2] || 2));
    const inlineBonus = Number(m[3] || 0);
    const bonus = (Number.isFinite(inlineBonus) ? inlineBonus : 0) + (Number.isFinite(bonusFromField) ? bonusFromField : 0);
    const rollsArr = Array.from({ length: count }, () => rollDie(sides));
    const total = rollsArr.reduce((t, n) => t + n, 0) + bonus;
    const outcomeLabel = HEAL_TYPES.has(String(action.damage_type ?? "").toLowerCase()) ? "heal" : "damage";
    setRolls((prev) => ({
      ...prev,
      [action.id]: {
        ...(prev[action.id] ?? {}),
        damage: `${total} ${outcomeLabel} ([${rollsArr.join(", ")}]${bonus ? ` ${bonus > 0 ? "+" : "-"} ${Math.abs(bonus)}` : ""})`,
      },
    }));
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
            <div key={a.id} className="grid grid-cols-12 gap-2 border-b border-neutral-800 px-3 py-2 text-sm last:border-b-0">
              <div className="col-span-3 min-w-0">
                <div className="truncate font-semibold text-neutral-100">{a.name}</div>
                <div className="text-[11px] text-neutral-400">{a.type ?? "other"}</div>
              </div>
              <div className="col-span-2 text-xs text-neutral-300">
                {a.range_normal ? `${a.range_normal} ft.` : ""}
                {a.range_max ? ` (${a.range_max})` : ""}
              </div>
              <div className="col-span-2 text-xs text-neutral-300">
                {a.uses_attack_roll !== false && a.attack_bonus_override != null ? (
                  <div className="space-y-1">
                    <div>+{a.attack_bonus_override}</div>
                    <button
                      type="button"
                      className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] hover:bg-neutral-900"
                      onClick={() => rollHit(a)}
                    >
                      Roll Hit
                    </button>
                    {rolls[a.id]?.hit ? <div className="text-emerald-300">{rolls[a.id]?.hit}</div> : null}
                  </div>
                ) : a.save_dc_override != null ? (
                  <div>{`DC ${a.save_dc_override}${a.save_ability ? ` ${String(a.save_ability).toUpperCase()}` : ""}`}</div>
                ) : null}
              </div>
              <div className="col-span-2 text-xs text-neutral-300">
                {a.damage_dice ? (
                  <div>
                    <div>{`${a.damage_dice}${a.damage_type ? ` ${a.damage_type}` : ""}`}</div>
                    <button
                      type="button"
                      className="mt-1 rounded border border-neutral-700 px-2 py-0.5 text-[11px] hover:bg-neutral-900"
                      onClick={() => rollDamage(a)}
                    >
                      {HEAL_TYPES.has(String(a.damage_type ?? "").toLowerCase()) ? "Roll Heal" : "Roll Dmg"}
                    </button>
                    {rolls[a.id]?.damage ? <div className="text-emerald-300">{rolls[a.id]?.damage}</div> : null}
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
              </div>
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
}) {
  const hasAdvantage = Array.isArray(props.advantageSources) && props.advantageSources.length > 0;
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

      {props.diceMode === "manual" ? (
        <div className="mt-3 space-y-2">
          <div className="text-xs text-neutral-300">
            Enter only your d20 roll{hasAdvantage ? "s" : ""}. The app adds modifiers automatically.
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
          </div>
        </div>
      ) : (
        <div className="mt-3 text-xs text-neutral-400">Digital Dice active: click the glowing target to roll once.</div>
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

