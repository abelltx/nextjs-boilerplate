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
  if (state.roll_open === true) return true; // fallback signal
  return false;
}

export default function PlayerHubClient(props: {
  userEmail: string;
  accessLabel: string;
  character: any;
  inventory: any[];
  sessions: any[];
  sessionStates: Record<string, any>;
  gameLog: any[];
}) {
  const [tab, setTab] = useState<TabKey>("inventory");
  const [joinOpen, setJoinOpen] = useState(false);

  // Prevent "tab yanking": only auto-route once.
  const [autoRouted, setAutoRouted] = useState(false);

  const sessionsRef = useRef<HTMLDivElement | null>(null);
  const [pulseSessions, setPulseSessions] = useState(false);

  // stat_block is optional for now. Panels will show defaults if empty.
  const stat = (props.character?.stat_block ?? {}) as any;

  const liveSession = useMemo(() => {
    const candidates = (props.sessions ?? [])
      .map((s) => ({ session: s, state: props.sessionStates?.[s.id] }))
      .filter(({ state }) => Boolean(state));

    return candidates.find(({ state }) => isLiveState(state))?.session ?? null;
  }, [props.sessions, props.sessionStates]);

  // Auto-default to Sessions tab if any session is live (once).
  useEffect(() => {
    if (!autoRouted && liveSession) {
      setTab("sessions");
      setAutoRouted(true);

      // glow for a few seconds
      setPulseSessions(true);
      setTimeout(() => setPulseSessions(false), 4500);

      // scroll to Sessions panel after DOM paints
      setTimeout(() => {
        sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }, [liveSession, autoRouted]);


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

        {/* Soft "enter live" banner */}
        {liveSession ? (
        <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-red-100">A session is LIVE right now</div>
              <div className="text-sm text-red-200/80">{liveSession.name}</div>
            </div>

            <button
              onClick={() => {
                setTab("sessions");
                setPulseSessions(true);
                setTimeout(() => setPulseSessions(false), 4500);
                setTimeout(() => {
                  sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 50);
              }}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200"
            >
              View Session Status ↓
            </button>
          </div>
        </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* LEFT RAIL */}
          <aside className="lg:col-span-3 space-y-4">
            <AbilitiesCard stat={stat} />
            <SavesCard stat={stat} />
            <SkillsCard stat={stat} />
            <PassivesCard stat={stat} />

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4 text-xs text-neutral-400">
              Signed in as {props.userEmail} • {props.accessLabel}
            </div>

            {/* Recent Journey */}
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

          {/* MAIN */}
          <section className="lg:col-span-9">
            <div className="flex flex-wrap gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
              <Tab active={tab === "inventory"} onClick={() => setTab("inventory")}>
                Inventory
              </Tab>
              <Tab active={tab === "actions"} onClick={() => setTab("actions")}>
                Actions
              </Tab>
              <Tab active={tab === "traits"} onClick={() => setTab("traits")}>
                Abilities & Traits
              </Tab>
              <Tab
                active={tab === "talents"}
                onClick={() => setTab("talents")}
                disabled={isLiveMode}
                title={isLiveMode ? "Spend points between sessions in the Elder tents." : undefined}
              >
                Talents
              </Tab>
              <Tab active={tab === "journey"} onClick={() => setTab("journey")}>
                Journey Log
              </Tab>
              <Tab
              active={tab === "sessions"}
              onClick={() => {
                setTab("sessions");
                sessionsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
                    pulseSessions
                      ? "rounded-2xl ring-2 ring-red-400/60 shadow-[0_0_22px_rgba(248,113,113,0.28)]"
                      : "",
                  ].join(" ")}
                >
                  <SessionsPanel
                    sessions={props.sessions ?? []}
                    sessionStates={props.sessionStates ?? {}}
                    onJoin={() => setJoinOpen(true)}
                  />
                </div>

              ) : tab === "talents" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Talents</div>
                  <div className="text-sm text-neutral-300">
                    Scaffold only for now. Next: Elder cards + spend drawer.
                  </div>
                </div>
              ) : tab === "traits" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Abilities & Traits</div>
                  <div className="text-sm text-neutral-300">
                    Next: show passive traits, trainings, callings, and effect sources (items/talents).
                  </div>
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
      {props.glow ? (
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" />
      ) : null}
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

function SessionsPanel({
  sessions,
  sessionStates,
  onJoin,
}: {
  sessions: any[];
  sessionStates: Record<string, any>;
  onJoin: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">Your Sessions</div>
        <button className="rounded-xl border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-950" onClick={onJoin}>
          Join another
        </button>
      </div>

      {!sessions.length ? (
        <div className="text-sm text-neutral-300">You haven’t joined a session yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {sessions.map((s) => {
            const state = sessionStates?.[s.id];
            const live = isLiveState(state);

            return (
              <a
                key={s.id}
                href={`/player/sessions/${s.id}`}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 hover:bg-neutral-900/40"
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

                {live ? (
                  <div className="mt-3 text-xs text-neutral-200">DM is active — open now</div>
                ) : (
                  <div className="mt-3 text-xs text-neutral-400">Not currently live</div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
