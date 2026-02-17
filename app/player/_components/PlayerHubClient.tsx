"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PlayerStatusHeader from "./PlayerStatusHeader";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";
import { AbilitiesCard, SavesCard, SkillsCard, PassivesCard, type AbilityKey } from "./PlayerSheetPanels";
import RollPanel from "./RollPanel";
import PlayerInventoryPanel from "./PlayerInventoryPanel";
import { claimNpcGearItemAction, leaveSessionAction, submitRollResultAction } from "../actions";
import RevealCard from "@/components/episode-runtime/RevealCard";
import SceneMap from "@/components/episode-runtime/SceneMap";
import NpcTabsCard from "@/components/episode-runtime/NpcTabsCard";
import { extractMapMarkers } from "@/lib/episodeRuntime";

type TabKey = "inventory" | "actions" | "talents" | "journey";

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
}) {
  const [tab, setTab] = useState<TabKey>("inventory");
  const [joinOpen, setJoinOpen] = useState(false);
  const [optimisticLiveSession, setOptimisticLiveSession] = useState<{ id: string; name?: string | null } | null>(null);
  const [claimingGearId, setClaimingGearId] = useState<string | null>(null);
  const router = useRouter();

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
        setStage(json);
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

  const rollOpen = Boolean(stageState?.roll_open);
  const rollPrompt = String(stageState?.roll_prompt ?? "");
  const promptTarget = useMemo(() => (rollOpen ? detectPromptTarget(rollPrompt) : null), [rollOpen, rollPrompt]);
  const stageStoryText = String(stage?.session?.story_text ?? selectedSession?.story_text ?? "");
  const [diceMode, setDiceMode] = useState<"digital" | "manual">("digital");
  const [manualValue, setManualValue] = useState("");
  const [submittingRoll, setSubmittingRoll] = useState(false);
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

  useEffect(() => {
    if (!rollOpen) {
      setGuidedResult(null);
      setFlight(null);
      setManualValue("");
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
    const res = await claimNpcGearItemAction({
      characterId: String(props.character?.id ?? ""),
      itemId: item.itemId,
    });
    setClaimingGearId(null);
    if (!res.ok) {
      alert(res.error ?? "Could not add item.");
      return;
    }
    router.refresh();
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
            />
            <SavesCard stat={stat} />
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
                  linkedBlocks={stage?.linkedBlocks ?? {}}
                  playerShop={{
                    faithPoints,
                    ownedItems: ownedInventoryItemIds,
                    claimingId: claimingGearId,
                    onClaim: handleClaimNpcGear,
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
                      setManualValue={setManualValue}
                      onSubmitManual={async () => {
                        if (rollLocked || submittingRoll) return;
                        const v = Number(manualValue);
                        if (!Number.isFinite(v)) {
                          alert("Enter a valid roll value.");
                          return;
                        }
                        setGuidedResult({ label: "Manual Roll", total: v, breakdown: "Real dice" });
                        await submitRoll(v, "manual");
                      }}
                      rollLocked={rollLocked}
                      submitting={submittingRoll}
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

              <div className="ml-auto flex items-center gap-2 pr-2 text-xs text-neutral-300">
                {isLiveMode ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-200">
                    LIVE • {liveSessionNameForHeader}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              {tab === "inventory" ? (
                <PlayerInventoryPanel characterId={props.character.id} />
              ) : tab === "journey" ? (
                <div>
                  <div className="text-sm font-semibold">Journal</div>
                  <div className="mt-3">
                    <JourneyLog items={props.gameLog ?? []} />
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
                  <RollPanel
                    stat={stat}
                    disabled={isLiveMode && !rollOpen}
                    disabledReason="Rolls are handled in Live Mode."
                    highlightAbility={promptTarget?.kind === "ability" ? promptTarget.abilityKey : undefined}
                    highlightSkill={promptTarget?.kind === "skill" ? promptTarget.skillKey : undefined}
                    highlightDie={promptTarget?.kind === "die" ? promptTarget.die : undefined}
                    onGuidedRoll={handleRollPanelGuided}
                    lockRoll={rollLocked || diceMode === "manual" || submittingRoll}
                  />
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
  linkedBlocks,
  playerShop,
}: {
  block: any;
  linkedBlocks?: Record<string, any>;
  playerShop?: {
    faithPoints: number;
    ownedItems: string[];
    claimingId?: string | null;
    onClaim?: (item: { id: string; itemId: string; name: string; faithRequired: number }) => void | Promise<void>;
  };
}) {
  const markers = extractMapMarkers(block?.meta);
  const [selectedMarkerBlockId, setSelectedMarkerBlockId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedMarkerBlockId(null);
  }, [block?.id]);

  const revealMap = (linkedBlocks ?? {}) as Record<string, any>;
  const selectedReveal = selectedMarkerBlockId ? revealMap[selectedMarkerBlockId] ?? null : null;
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-semibold">Stage</div>

      {block ? (
        <div className="mt-3 space-y-3">
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
                  playerShop={playerShop}
                />
              ) : undefined
            }
          >
            {block.image_url && String(block.block_type ?? "").toLowerCase() === "map" ? (
              <SceneMap
                src={block.image_url}
                alt={block.title ?? "Presented"}
                markers={markers as any}
                showMagnifier
                onMarkerClick={(m) => {
                  if (m.targetBlockId) setSelectedMarkerBlockId(m.targetBlockId);
                }}
              />
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
        </div>
      ) : (
        <div className="mt-3 text-sm text-neutral-300">
          When the storyteller clicks <span className="text-neutral-100">Present to Players</span>, it will appear here.
        </div>
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
  setManualValue: (v: string) => void;
  onSubmitManual: () => void;
  rollLocked: boolean;
  submitting: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">Roll Request</div>
        <label className="flex items-center gap-2 rounded-lg border border-neutral-700 px-2 py-1 text-xs text-neutral-200">
          <input
            type="checkbox"
            checked={props.diceMode === "manual"}
            onChange={(e) => props.setDiceMode(e.currentTarget.checked ? "manual" : "digital")}
            className="accent-emerald-400"
            disabled={props.rollLocked || props.submitting}
          />
          {props.diceMode === "manual" ? "Real Dice" : "Digital Dice"}
        </label>
      </div>

      <div className="mt-3 text-sm text-neutral-200">{props.prompt || "Follow the storyteller's roll instruction."}</div>

      {props.diceMode === "manual" ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            value={props.manualValue}
            onChange={(e) => props.setManualValue(e.currentTarget.value)}
            placeholder="Type your total"
            className="w-32 rounded-lg border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm"
            disabled={props.rollLocked || props.submitting}
          />
          <button
            type="button"
            onClick={props.onSubmitManual}
            disabled={props.rollLocked || props.submitting}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Submit
          </button>
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

