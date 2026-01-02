"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlayerStatusHeader from "./PlayerStatusHeader";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";
import { AbilitiesCard, SavesCard, SkillsCard, PassivesCard } from "./PlayerSheetPanels";
import RollPanel from "./RollPanel";

type TabKey = "inventory" | "actions" | "traits" | "talents" | "journey" | "sessions";

function isLiveState(state: any) {
  if (!state) return false;
  if (state.player_view === true) return true;
  if (state.is_live === true) return true;
  if (state.live === true) return true;
  if (state.roll_open === true) return true;
  return false;
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

  const sessionsRef = useRef<HTMLDivElement | null>(null);
  const [pulseSessions, setPulseSessions] = useState(false);
  const [autoRouted, setAutoRouted] = useState(false);

  const stat = (props.character?.stat_block ?? {}) as any;

  const liveSession = useMemo(() => {
    const candidates = (props.sessions ?? [])
      .map((s) => ({ session: s, state: props.sessionStates?.[s.id] }))
      .filter(({ state }) => Boolean(state));
    return candidates.find(({ state }) => isLiveState(state))?.session ?? null;
  }, [props.sessions, props.sessionStates]);

  // Stage selection inside Sessions tab
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Auto-default to Sessions tab + glow when live (once)
  useEffect(() => {
    if (!autoRouted && liveSession) {
      setTab("sessions");
      setAutoRouted(true);

      setPulseSessions(true);
      setTimeout(() => setPulseSessions(false), 4500);

      setTimeout(() => sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
  }, [liveSession, autoRouted]);

  // If a live session exists, default the selected session to it.
  useEffect(() => {
    if (!selectedSessionId && liveSession?.id) setSelectedSessionId(liveSession.id);
  }, [liveSession, selectedSessionId]);

  const derived = stat?.derived ?? {};
  const resources = stat?.resources ?? {};
  const effects = stat?.effects ?? [];
  const isLiveMode = Boolean(liveSession);

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
              <Tab
                active={tab === "sessions"}
                onClick={() => {
                  setTab("sessions");
                  setTimeout(() => sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
                }}
                glow={pulseSessions}
              >
                Sessions
              </Tab>

              <div className="ml-auto flex items-center gap-2 pr-2 text-xs text-neutral-300">
                {isLiveMode ? (
                  <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-200">LIVE • {liveSession?.name}</span>
                ) : (
                  <button
                    className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 hover:bg-neutral-900"
                    onClick={() => setJoinOpen(true)}
                  >
                    Join Session
                  </button>
                )}
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
                <div
                  ref={sessionsRef}
                  className={[
                    "scroll-mt-24",
                    pulseSessions ? "rounded-2xl ring-2 ring-red-400/60 shadow-[0_0_22px_rgba(248,113,113,0.28)]" : "",
                  ].join(" ")}
                >
                  <SessionsWithStage
                    sessions={props.sessions ?? []}
                    sessionStates={props.sessionStates ?? {}}
                    presentedBlocks={props.presentedBlocks ?? {}}
                    selectedSessionId={selectedSessionId}
                    onSelect={(id) => setSelectedSessionId(id)}
                    onJoin={() => setJoinOpen(true)}
                  />
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
  glow?: boolean;
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
        props.glow ? "ring-2 ring-red-400/60 shadow-[0_0_18px_rgba(248,113,113,0.35)]" : "",
      ].join(" ")}
    >
      {props.children}
      {props.glow ? <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" /> : null}
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

function SessionsWithStage(props: {
  sessions: any[];
  sessionStates: Record<string, any>;
  presentedBlocks: Record<string, any>;
  selectedSessionId: string | null;
  onSelect: (id: string) => void;
  onJoin: () => void;
}) {
  const selected = props.sessions.find((s) => s.id === props.selectedSessionId) ?? props.sessions[0] ?? null;
  const state = selected ? props.sessionStates?.[selected.id] : null;

  const presentedId = state?.presented_block_id as string | undefined;
  const block = presentedId ? props.presentedBlocks?.[presentedId] : null;

  const rollOpen = Boolean(state?.roll_open);
  const rollDie = String(state?.roll_die ?? "d20");
  const rollPrompt = String(state?.roll_prompt ?? "");
  const rollTarget = String(state?.roll_target ?? "all");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {/* Session list */}
      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Your Sessions</div>
          <button className="rounded-xl border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-950" onClick={props.onJoin}>
            Join another
          </button>
        </div>

        {!props.sessions.length ? (
          <div className="text-sm text-neutral-300">You haven’t joined a session yet.</div>
        ) : (
          <div className="space-y-2">
            {props.sessions.map((s) => {
              const st = props.sessionStates?.[s.id];
              const live = isLiveState(st);
              const active = selected?.id === s.id;

              return (
                <button
                  key={s.id}
                  onClick={() => props.onSelect(s.id)}
                  className={[
                    "w-full text-left rounded-2xl border p-4 transition",
                    active
                      ? "border-neutral-600 bg-neutral-950/60"
                      : "border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900/40",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{s.name ?? "Session"}</div>
                      <div className="mt-1 text-xs text-neutral-400">{s.id}</div>
                    </div>
                    {live ? (
                      <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-200">LIVE</span>
                    ) : (
                      <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-300">OFFLINE</span>
                    )}
                  </div>
                  {st?.presented_block_id ? (
                    <div className="mt-2 text-xs text-neutral-300">Presented content available</div>
                  ) : (
                    <div className="mt-2 text-xs text-neutral-500">Nothing presented yet</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Stage */}
      <div className="lg:col-span-7 space-y-4">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Stage</div>
            <div className="text-xs text-neutral-400">
              {selected ? selected.name : "No session selected"}
            </div>
          </div>

          {block ? (
            <div className="mt-3 space-y-3">
              <div className="text-lg font-extrabold">{block.title ?? block.block_type ?? "Presented"}</div>
              {block.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={block.image_url} alt={block.title ?? "Presented"} className="w-full rounded-xl border border-neutral-800" />
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

        <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Roll Request</div>
            {rollOpen ? (
              <span className="rounded-full bg-red-500/20 px-2 py-1 text-xs text-red-200">OPEN</span>
            ) : (
              <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs text-neutral-300">CLOSED</span>
            )}
          </div>

          <div className="mt-3 space-y-2 text-sm text-neutral-200">
            <div>
              Die: <span className="font-bold text-white">{rollDie}</span>
            </div>
            {rollPrompt ? <div className="text-neutral-300">{rollPrompt}</div> : <div className="text-neutral-500">No prompt.</div>}
            <div className="text-xs text-neutral-500">Target: {rollTarget}</div>
          </div>

          <div className="mt-4 text-xs text-neutral-500">
            Next phase: we’ll wire the “submit roll” controls right here (manual or digital) using the same logic from
            <code className="ml-1 rounded bg-neutral-900 px-1">/player/sessions/[id]</code>.
          </div>
        </div>

        {selected?.story_text ? (
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-sm font-semibold">Story (Board)</div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
              {selected.story_text}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
