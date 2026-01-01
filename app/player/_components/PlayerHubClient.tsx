"use client";

import { useMemo, useState } from "react";
import PlayerStatusHeader from "./PlayerStatusHeader";
import { AbilitiesCard, SavesCard, SkillsCard, PassivesCard, type StatBlock } from "./PlayerSheetPanels";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";

type TabKey = "inventory" | "actions" | "traits" | "talents" | "journey" | "sessions";

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

  // If you don’t have a character stat_block yet, this still renders using safe defaults.
  const stat: StatBlock = (props.character?.stat_block ?? {}) as any;

  const liveSession = useMemo(() => {
    const candidates = (props.sessions ?? [])
      .map((s) => ({ session: s, state: props.sessionStates?.[s.id] }))
      .filter(({ state }) => Boolean(state));

    const isLive = (state: any) => {
      if (state?.player_view === true) return true;
      if (state?.is_live === true) return true;
      if (state?.live === true) return true;
      if (state?.roll_open === true) return true; // fallback signal
      return false;
    };

    const live = candidates.find(({ state }) => isLive(state));
    return live?.session ?? null;
  }, [props.sessions, props.sessionStates]);

  const isLiveMode = Boolean(liveSession);

  const derived = stat.derived ?? {};
  const resources = stat.resources ?? {};
  const effects = stat.effects ?? [];

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
          {/* LEFT RAIL (big rock) */}
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
              {isLiveMode ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">
                  LIVE mode panel goes here next (your realtime components). For now, hub stays usable.
                </div>
              ) : tab === "inventory" ? (
                <InventoryPanel items={props.inventory} />
              ) : tab === "journey" ? (
                <div>
                  <div className="text-sm font-semibold">Journey Log</div>
                  <div className="mt-3">
                    <JourneyLog items={props.gameLog ?? []} />
                  </div>
                </div>
              ) : tab === "sessions" ? (
                <SessionsPanel sessions={props.sessions ?? []} onJoin={() => setJoinOpen(true)} />
              ) : tab === "talents" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Talents</div>
                  <div className="text-sm text-neutral-300">Scaffold only for now. Next: Elder cards + spend drawer.</div>
                </div>
              ) : tab === "traits" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Abilities & Traits</div>
                  <div className="text-sm text-neutral-300">
                    Next: show passive traits, trainings, callings, and effect sources (items/talents).
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-sm font-semibold">Actions</div>
                  <div className="text-sm text-neutral-300">Next: roll buttons, attacks, and use-item actions.</div>
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

function Tab(props: { active: boolean; onClick: () => void; disabled?: boolean; title?: string; children: any }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className={[
        "rounded-xl px-3 py-2 text-sm transition",
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
          <li key={it.id} className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2">
            <span>{it.name}</span>
            <span className="text-neutral-400">{it.quantity > 1 ? `× ${it.quantity}` : ""}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionsPanel({ sessions, onJoin }: { sessions: any[]; onJoin: () => void }) {
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
          {sessions.map((s) => (
            <a key={s.id} href={`/player/sessions/${s.id}`} className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4 hover:bg-neutral-900/40">
              <div className="text-sm font-semibold">{s.name ?? "Session"}</div>
              <div className="mt-1 text-xs text-neutral-400">{s.id}</div>
              <div className="mt-3 text-xs text-neutral-300">Open</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
