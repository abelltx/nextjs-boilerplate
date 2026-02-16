"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import PlayerStatusHeader from "./PlayerStatusHeader";
import JourneyLog from "./JourneyLog";
import JoinSessionModal from "./JoinSessionModal";
import { AbilitiesCard, SavesCard, SkillsCard, PassivesCard } from "./PlayerSheetPanels";
import RollPanel from "./RollPanel";
import PlayerInventoryPanel from "./PlayerInventoryPanel";
import { leaveSessionAction } from "../actions";

type TabKey = "inventory" | "actions" | "talents" | "journey";

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
  const [optimisticLiveSession, setOptimisticLiveSession] = useState<{ id: string; name?: string | null } | null>(null);
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

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedSessionId) {
      if (liveSession?.id) setSelectedSessionId(liveSession.id);
      else if (props.sessions?.[0]?.id) setSelectedSessionId(props.sessions[0].id);
    }
  }, [selectedSessionId, liveSession, props.sessions]);

  const [stage, setStage] = useState<{
    ok: boolean;
    session?: any;
    state?: any;
    block?: any;
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
  const stageStoryText = String(stage?.session?.story_text ?? selectedSession?.story_text ?? "");

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
          onJoinClick={() => setJoinOpen(true)}
          onLeaveClick={handleLeaveFromHeader}
        />

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
          <aside className="lg:col-span-3 space-y-4">
            <AbilitiesCard stat={stat} />
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
                <StagePanel block={stageBlock} />

                {rollOpen ? <RollRequestPanel prompt={rollPrompt} /> : null}

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
                  <RollPanel stat={stat} disabled={isLiveMode} disabledReason="Rolls are handled in Live Mode." />
                </div>
              )}
            </div>
          </section>

          <aside className="lg:col-span-3 space-y-4">
            <div className="lg:sticky lg:top-4">
              <SkillsCard stat={stat} />
            </div>
          </aside>
        </div>
      </div>

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

function StagePanel({ block }: { block: any }) {
  const markers = Array.isArray(block?.meta?.markers) ? block.meta.markers : [];
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-semibold">Stage</div>

      {block ? (
        <div className="mt-3 space-y-3">
          <div className="text-lg font-extrabold">{block.title ?? block.block_type ?? "Presented"}</div>

          {block.image_url ? (
            <StageImagePreview src={block.image_url} alt={block.title ?? "Presented"} markers={markers} />
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

function StageImagePreview({
  src,
  alt,
  markers,
}: {
  src: string;
  alt: string;
  markers?: Array<{ x?: number; y?: number; label?: string }>;
}) {
  const [hover, setHover] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [pos, setPos] = useState({ x: 50, y: 50 });

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
  }

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-neutral-800"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={onMove}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full" />

        {Array.isArray(markers)
          ? markers.map((m, i) => {
              const x = Number(m?.x ?? 0);
              const y = Number(m?.y ?? 0);
              if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
              return (
                <div
                  key={`${i}-${x}-${y}`}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white"
                  style={{
                    left: `${Math.max(0, Math.min(100, x))}%`,
                    top: `${Math.max(0, Math.min(100, y))}%`,
                  }}
                  title={String(m?.label ?? `Marker ${i + 1}`)}
                >
                  {i + 1}
                </div>
              );
            })
          : null}

        {hover ? (
          <div
            className="pointer-events-none absolute h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-lg"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              backgroundImage: `url(${src})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${zoom * 100}%`,
              backgroundPosition: `${pos.x}% ${pos.y}%`,
            }}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-300">
        <div className="flex items-center gap-2">
          <span>Zoom</span>
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900"
            onClick={() => setZoom((z) => Math.max(1.5, Number((z - 0.5).toFixed(1))))}
          >
            -
          </button>
          <span>{zoom.toFixed(1)}x</span>
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900"
            onClick={() => setZoom((z) => Math.min(5, Number((z + 0.5).toFixed(1))))}
          >
            +
          </button>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900"
        >
          Open full image
        </a>
      </div>
      <div className="text-[11px] text-neutral-400">Hover to preview details. Move the mouse to pan the zoom lens.</div>
    </div>
  );
}

function RollRequestPanel({ prompt }: { prompt: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-4">
      <div className="text-sm font-semibold">Roll Request</div>
      <div className="mt-3 text-sm text-neutral-200">{prompt || "Follow the storyteller's roll instruction."}</div>
      <div className="mt-2 text-xs text-neutral-400">
        Example: Click <span className="text-neutral-200">Perception</span> in your Skills panel, then report your result.
      </div>
    </div>
  );
}

