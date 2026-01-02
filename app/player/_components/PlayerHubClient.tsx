"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PlayerStatusHeader from "./PlayerStatusHeader";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";
import { AbilitiesCard, SavesCard, SkillsCard, PassivesCard } from "./PlayerSheetPanels";
import RollPanel from "./RollPanel";
import { leaveSessionAction, submitRollResultAction } from "../actions";

type TabKey = "inventory" | "actions" | "traits" | "talents" | "journey" | "sessions";

function isLiveState(state: any) {
  if (!state) return false;
  if (state.player_view === true) return true;
  if (state.is_live === true) return true;
  if (state.live === true) return true;
  if (state.roll_open === true) return true;
  return false;
}

function parseDieSides(die: string) {
  const m = String(die || "").match(/d(\d+)/i);
  return m ? Number(m[1]) : 20;
}

function rollDie(die: string) {
  const sides = parseDieSides(die);
  return Math.floor(Math.random() * sides) + 1;
}

export default function PlayerHubClient(props: {
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

  const router = useRouter();

  const stat = (props.character?.stat_block ?? {}) as any;
  const derived = stat?.derived ?? {};
  const resources = stat?.resources ?? {};
  const effects = stat?.effects ?? [];

  const liveSession = useMemo(() => {
    const candidates = (props.sessions ?? [])
      .map((s) => ({ session: s, state: props.sessionStates?.[s.id] }))
      .filter(({ state }) => Boolean(state));
    return candidates.find(({ state }) => isLiveState(state))?.session ?? null;
  }, [props.sessions, props.sessionStates]);

  const isLiveMode = Boolean(liveSession);

  // Selected session for the Sessions tab (default: live, else first)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSessionId) {
      if (liveSession?.id) setSelectedSessionId(liveSession.id);
      else if (props.sessions?.[0]?.id) setSelectedSessionId(props.sessions[0].id);
    }
  }, [selectedSessionId, liveSession, props.sessions]);

  // Live/polled stage payload
  const [stage, setStage] = useState<{
    ok: boolean;
    session?: any;
    state?: any;
    block?: any;
    players?: string[];
  } | null>(null);

  const selectedSession = props.sessions.find((s) => s.id === selectedSessionId) ?? null;

  // Poll while Sessions tab is active
  useEffect(() => {
    if (tab !== "sessions") return;
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
  }, [tab, selectedSessionId]);

  // Auto-focus Sessions tab if a live session exists (once per mount)
  useEffect(() => {
    if (liveSession) setTab("sessions");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!liveSession]);

  const stageState = stage?.state ?? (selectedSessionId ? props.sessionStates?.[selectedSessionId] : null);
  const stageBlock = stage?.block ?? null;

  const rollOpen = Boolean(stageState?.roll_open);
  const rollDieStr = String(stageState?.roll_die ?? "d20");
  const rollPrompt = String(stageState?.roll_prompt ?? "");
  const rollTarget = String(stageState?.roll_target ?? "all");
  const rollModes = (stageState?.roll_modes ?? {}) as Record<string, any>;
  const rollResults = (stageState?.roll_results ?? {}) as Record<string, any>;

  const players = stage?.players ?? [];

  // DM roll entry UI state
  const [dmTargetPlayer, setDmTargetPlayer] = useState<string>("");
  const [dmManual, setDmManual] = useState<string>("");

  useEffect(() => {
    if (!dmTargetPlayer && players.length) setDmTargetPlayer(players[0]);
  }, [dmTargetPlayer, players]);

  async function submitFor(playerId: string, value: number, source: "manual" | "digital") {
    const res = await submitRollResultAction({
      sessionId: selectedSessionId!,
      playerId,
      rollValue: value,
      source,
    });
    if (!res.ok) alert(res.error ?? "Failed to submit roll.");
    router.refresh(); // refresh server props too (nice to keep list state consistent)
  }

  async function handleLeave() {
    if (!selectedSessionId) return;

    const ok = window.confirm(
      "Leave this session?\n\nWARNING: If you leave, your current participation/progress for this session may be lost and you’ll need a new join code to re-enter."
    );
    if (!ok) return;

    const res = await leaveSessionAction(selectedSessionId);
    if (!res.ok) {
      alert(res.error ?? "Failed to leave session.");
      return;
    }

    setStage(null);
    setSelectedSessionId(null);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
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
          liveSessionName={liveSession?.name ?? null}
          onJoinClick={() => setJoinOpen(true)}
        />

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="lg:col-span-3 space-y-4">
            <AbilitiesCard stat={stat} />
            <SavesCard stat={stat} />
            <SkillsCard stat={stat} />
            <PassivesCard stat={stat} />

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">
              Signed in as {props.userEmail} • {props.accessLabel}
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Recent Journey</div>
                <button className="text-xs text-neutral-300 hover:text-white" onClick={() => setTab("journey")}>
                  View all
                </button>
              </div>
              <div className="mt-3">
                <JourneyLog items={(props.gameLog ?? []).slice(0, 5)} compact />
              </div>
            </div>
          </aside>

          <section className="lg:col-span-9">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
              <Tab active={tab === "inventory"} onClick={() => setTab("inventory")}>Inventory</Tab>
              <Tab active={tab === "actions"} onClick={() => setTab("actions")}>Actions</Tab>
              <Tab active={tab === "traits"} onClick={() => setTab("traits")}>Abilities & Traits</Tab>
              <Tab
                active={tab === "talents"}
                onClick={() => setTab("talents")}
                disabled={isLiveMode}
                title={isLiveMode ? "Spend points between sessions in the Elder tents." : undefined}
              >
                Talents
              </Tab>
              <Tab active={tab === "journey"} onClick={() => setTab("journey")}>Journey Log</Tab>
              <Tab active={tab === "sessions"} onClick={() => setTab("sessions")}>Sessions</Tab>

              <div className="ml-auto flex items-center gap-2 pr-2 text-xs text-neutral-300">
                {isLiveMode ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-200">LIVE • {liveSession?.name}</span>
                ) : null}

                <button
                  className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 hover:bg-neutral-900"
                  onClick={() => setJoinOpen(true)}
                >
                  Join Session
                </button>

                {selectedSessionId ? (
                  <button
                    className="rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-red-200 hover:bg-red-500/15"
                    onClick={handleLeave}
                  >
                    Leave Session
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
              {tab === "inventory" ? (
                <InventoryPanel items={props.inventory} />
              ) : tab === "journey" ? (
                <div>
                  <div className="text-sm font-semibold">Journey Log</div>
                  <div className="mt-3">
                    <JourneyLog items={props.gameLog ?? []} />
                  </div>
                </div>
              ) : tab === "sessions" ? (
                <div className="space-y-4">
                  {/* session selector (keeps full-width stage) */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Session</div>

                    <select
                      value={selectedSessionId ?? ""}
                      onChange={(e) => setSelectedSessionId(e.target.value)}
                      className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
                    >
                      {(props.sessions ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name ?? s.id.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <StagePanel block={stageBlock} />

                  <RollRequestPanel
                    open={rollOpen}
                    die={rollDieStr}
                    prompt={rollPrompt}
                    target={rollTarget}
                    players={players}
                    rollModes={rollModes}
                    rollResults={rollResults}
                    dmTargetPlayer={dmTargetPlayer}
                    setDmTargetPlayer={setDmTargetPlayer}
                    dmManual={dmManual}
                    setDmManual={setDmManual}
                    onSubmitManual={async () => {
                      if (!dmTargetPlayer) return;
                      const n = Number(dmManual);
                      if (!Number.isFinite(n)) return alert("Enter a number.");
                      await submitFor(dmTargetPlayer, n, "manual");
                      setDmManual("");
                    }}
                    onSubmitDigital={async () => {
                      if (!dmTargetPlayer) return;
                      const val = rollDie(rollDieStr);
                      await submitFor(dmTargetPlayer, val, "digital");
                    }}
                  />

                  {selectedSession?.story_text ? (
                    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="text-sm font-semibold">Story (Board)</div>
                      <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                        {selectedSession.story_text}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : tab === "talents" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Talents</div>
                  <div className="text-sm text-neutral-300">Scaffold only for now.</div>
                </div>
              ) : tab === "traits" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Abilities & Traits</div>
                  <div className="text-sm text-neutral-300">Next: passive traits and sources.</div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-semibold">Actions</div>
                  <RollPanel stat={stat} disabled={isLiveMode} disabledReason="Rolls are handled in Live Mode." />
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <JoinSessionModal open={joinOpen} onClose={() => setJoinOpen(false)} />
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

function InventoryPanel({ items }: { items: any[] }) {
  if (!items?.length) return <div className="text-sm text-neutral-300">No items yet.</div>;
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">Inventory</div>
      <ul className="mt-2 space-y-1 text-sm text-neutral-200">
        {items.map((it) => (
          <li
            key={it.id}
            className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2"
          >
            <span>{it.name}</span>
            <span className="text-neutral-400">{it.quantity > 1 ? `× ${it.quantity}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StagePanel({ block }: { block: any }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-semibold">Stage</div>

      {block ? (
        <div className="mt-3 space-y-3">
          <div className="text-lg font-extrabold">{block.title ?? block.block_type ?? "Presented"}</div>

          {block.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={block.image_url}
              alt={block.title ?? "Presented"}
              className="w-full rounded-xl border border-neutral-800"
            />
          ) : null}

          {block.body ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{block.body}</div>
          ) : (
            <div className="text-sm text-neutral-400">No body text.</div>
          )}
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
  open: boolean;
  die: string;
  prompt: string;
  target: string;
  players: string[];
  rollModes: Record<string, any>;
  rollResults: Record<string, any>;
  dmTargetPlayer: string;
  setDmTargetPlayer: (v: string) => void;
  dmManual: string;
  setDmManual: (v: string) => void;
  onSubmitManual: () => void;
  onSubmitDigital: () => void;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Roll Request</div>
        {props.open ? (
          <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-200">OPEN</span>
        ) : (
          <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-300">CLOSED</span>
        )}
      </div>

      <div className="mt-3 space-y-2 text-sm text-neutral-200">
        <div>
          Die: <span className="font-bold text-white">{props.die || "d20"}</span>
        </div>
        {props.prompt ? <div className="text-neutral-300">{props.prompt}</div> : <div className="text-neutral-500">No prompt.</div>}
        <div className="text-xs text-neutral-500">Target: {props.target}</div>
      </div>

      {/* DM roll entry controls */}
      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
        <div className="text-xs font-semibold text-neutral-200">DM Roll Entry</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={props.dmTargetPlayer}
            onChange={(e) => props.setDmTargetPlayer(e.target.value)}
            className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
          >
            {props.players.length ? (
              props.players.map((pid) => (
                <option key={pid} value={pid}>
                  {pid.slice(0, 8)} ({props.rollModes?.[pid] ?? "dm"})
                </option>
              ))
            ) : (
              <option value="">No players</option>
            )}
          </select>

          <input
            value={props.dmManual}
            onChange={(e) => props.setDmManual(e.target.value)}
            placeholder="Manual value…"
            className="w-40 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white"
          />

          <button
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            onClick={props.onSubmitManual}
            disabled={!props.open || !props.dmTargetPlayer}
            title={!props.open ? "Roll is closed" : ""}
          >
            Submit Manual
          </button>

          <button
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
            onClick={props.onSubmitDigital}
            disabled={!props.open || !props.dmTargetPlayer}
            title={!props.open ? "Roll is closed" : ""}
          >
            Roll & Submit
          </button>
        </div>

        {/* Results snapshot */}
        <div className="mt-3 text-xs text-neutral-400">
          Latest results:
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {Object.keys(props.rollResults ?? {}).length ? (
              Object.entries(props.rollResults ?? {}).map(([pid, r]: any) => (
                <div key={pid} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-2">
                  <div className="text-neutral-200">
                    {pid.slice(0, 8)}: <span className="font-semibold text-white">{String(r?.roll_value ?? "")}</span>
                  </div>
                  <div className="text-neutral-500">source: {String(r?.source ?? "")}</div>
                </div>
              ))
            ) : (
              <div className="text-neutral-500">No results yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
