export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import TimerClient from "@/components/TimerClient";
import { getDmSession, updateStoryText, updateState } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { EpisodePicker } from "@/components/EpisodePicker";
import { presentBlockToPlayersAction, clearPresentedAction } from "@/app/actions/present";
import DmRollResultsRealtime from "@/components/DmRollResultsRealtime";
import DmPlayerRollLineRealtime from "@/components/DmPlayerRollLineRealtime";
import { randomUUID } from "crypto";
import crypto from "crypto";




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

  // roll mode map
  const rollModes = ((state as any).roll_modes ?? {}) as Record<string, string>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* TOP ROW */}
      <div className="grid grid-cols-12 gap-3">
        {/* Session box */}
        <div className="col-span-7 border rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase text-gray-500">Session</div>
              <div className="text-xl font-bold">{session.name}</div>
              <div className="mt-1 text-xs text-gray-500">
                Session ID: <span className="font-mono">{session.id}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs uppercase text-gray-500">Join Code</div>
              <div className="font-mono text-2xl font-bold">{session.join_code}</div>
            </div>
          </div>

          {/* Players + Roll Mode settings */}
          <div className="mt-4 grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => {
              const pRow = (joins ?? [])[i];
              const playerId = pRow?.player_id ?? null;

              const currentMode = playerId ? rollModes[playerId] ?? "dm" : "dm";

              return (
                <div key={i} className="border rounded-lg p-2 text-center space-y-2">
                  <div>
                    <div className="text-xs text-gray-500">Player {i + 1}</div>
                    <div className="text-[11px] font-mono break-all">
                      {playerId ? playerId.slice(0, 8) : "—"}
                    </div>
                    {/* ✅ LIVE roll result line */}
    <DmPlayerRollLineRealtime sessionId={sessionId} playerId={playerId} initialState={state as any} />
  
                  </div>

                  <div className="text-left">
                    <div className="text-[10px] uppercase text-gray-500">Roll Input</div>

                    <form
                      className="space-y-1"
                      action={async (fd) => {
                        "use server";
                        if (!playerId) return;

                        const nextMode = String(fd.get("mode") ?? "dm");
                        const prev = (((state as any).roll_modes ?? {}) as Record<string, string>) || {};
                        const next = { ...prev, [playerId]: nextMode };

                        await updateState(session.id, { roll_modes: next });
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <select
                        name="mode"
                        defaultValue={currentMode}
                        className="w-full border rounded p-1 text-xs"
                        disabled={!playerId}
                      >
                        <option value="dm">1) DM enters roll</option>
                        <option value="player">2) Player enters roll</option>
                        <option value="digital">3) Digital dice</option>
                      </select>

                      <button
                        type="submit"
                        className="w-full px-2 py-1 rounded bg-black text-white text-xs"
                        disabled={!playerId}
                      >
                        Save
                      </button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right side */}
        <div className="col-span-5 space-y-3">
          <div className="border rounded-xl p-4 space-y-3">
            <div>
              <div className="text-xs uppercase text-gray-500">Episode</div>
              <div className="text-sm text-gray-700">
                Load / switch which episode is attached to this session
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Current episode_id: <span className="font-mono">{episodeId ?? "—"}</span>
              </div>
            </div>
            <EpisodePicker sessionId={sessionId} episodes={episodes ?? []} />
          </div>

          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase text-gray-500">Session Timer</div>
              <form
                action={async () => {
                  "use server";
                  await updateState(session.id, {
                    timer_status: "stopped",
                    remaining_seconds: (state as any).duration_seconds,
                  });
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded border text-sm">Reset</button>
              </form>
            </div>

            <TimerClient
              remainingSeconds={(state as any).remaining_seconds}
              status={(state as any).timer_status}
              updatedAt={(state as any).updated_at}
            />

            <div className="flex flex-wrap gap-2">
              <form
                action={async () => {
                  "use server";
                  await updateState(session.id, { timer_status: "running" });
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded bg-black text-white text-sm">Start</button>
              </form>

              <form
                action={async () => {
                  "use server";
                  await updateState(session.id, { timer_status: "paused" });
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded border text-sm">Pause</button>
              </form>

              <form
                action={async () => {
                  "use server";
                  await updateState(session.id, {
                    remaining_seconds: (state as any).remaining_seconds + 300,
                  });
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded border text-sm">+5 min</button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* EPISODE TABLE OF CONTENTS */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-gray-500">Episode Table of Contents</div>
            <div className="text-sm text-gray-700">
              {totalScenes ? (
                <>
                  Current: <b>{currentSceneHuman || 0}</b> of <b>{totalScenes}</b> • Completed: <b>{completedCount}</b> of{" "}
                  <b>{totalScenes}</b>
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
                          Next in Scene ▶
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
                          Next Scene ⇢
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

                        return (
                          <details key={b.id} className={`border rounded-lg p-2 ${live ? "bg-gray-50" : ""}`}>
                            <summary className="cursor-pointer flex items-center justify-between gap-3">
                              <div className="text-sm">
                                <span className="font-semibold">{b.block_type}</span>
                                {b.title ? ` — ${b.title}` : ""}
                                {!presentable ? <span className="ml-2 text-xs text-gray-500">(ST)</span> : null}
                                {live ? <span className="ml-2 text-xs text-green-700">(LIVE)</span> : null}
                              </div>
                              <div className="text-xs text-gray-500 font-mono">#{b.sort_order}</div>
                            </summary>

                            <div className="mt-2 space-y-2">
                              {b.body ? <div className="whitespace-pre-wrap text-sm">{b.body}</div> : null}

                              {b.image_url ? (
                                <div className="rounded border overflow-hidden">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={b.image_url} alt="Block" className="w-full h-auto" />
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
                                            AC {m.ac ?? "—"} • HP {m.hp ?? "—"} • ATK {m.attack ?? "—"} • DMG{" "}
                                            {m.damage ?? "—"}
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
      </div>

      {/* EPISODE PROGRESS + ROLLS */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Episode Progress</div>
              <div className="font-bold">
                {totalScenes === 0 ? "No scenes" : `Scene ${Math.max(1, currentSceneHuman || 1)} / ${totalScenes}`}
              </div>
              <div className="text-xs text-gray-600 mt-1">Completion is driven by “Mark Scene Complete”.</div>
            </div>
            <div className="text-2xl font-bold">{episodePct}%</div>
          </div>

          <div className="mt-3 h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-2 bg-black" style={{ width: `${episodePct}%` }} />
          </div>
        </div>

        <div className="col-span-6 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Roll Requests (physical dice)</div>

          <div className="mt-2 flex flex-wrap gap-2">
            {["d20", "d12", "d10", "d8", "d6", "d4"].map((die) => (
              <form
                key={die}
                action={async () => {
                  "use server";
                  await updateState(session.id, {
                    roll_open: true,
                    roll_die: die,
                    roll_prompt: `Roll your ${die.toUpperCase()} now`,
                    roll_target: "all",

                    // NEW — one-roll-per-round enforcement
                    roll_round_id: crypto.randomUUID(),
                    roll_results: {},
                  });

                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded bg-black text-white text-sm">Roll {die}</button>
              </form>
            ))}

            <form
              action={async () => {
                "use server";
                await updateState(session.id, { roll_open: false, roll_die: null, roll_prompt: null });
                redirect(`/storyteller/sessions/${session.id}`);
              }}
            >
              <button className="px-3 py-2 rounded border text-sm">Close Roll</button>
            </form>
          </div>

          {(state as any).roll_open ? (
            <div className="mt-3 space-y-2">
              <div className="text-xs uppercase text-gray-500">Enter Results (DM mode only)</div>

              <div className="grid grid-cols-3 gap-2">
                {(joins ?? []).slice(0, 6).map((j: any, idx: number) => {
                  const playerId = j?.player_id;
                  if (!playerId) return null;

                  const mode = rollModes[playerId] ?? "dm";
                  if (mode !== "dm") return null;

                  return (
                    <form
                      key={playerId}
                      className="border rounded-lg p-2 space-y-2"
                      action={async (fd) => {
                        "use server";
                        const val = Number(fd.get("roll_value"));
                        if (!Number.isFinite(val)) return;

                        const prev = (((state as any).roll_results ?? {}) as Record<string, any>) || {};
                        const next = {
                          ...prev,
                          [playerId]: { value: val, source: "dm", submitted_at: new Date().toISOString() },
                        };

                        await updateState(session.id, { roll_results: next });
                        redirect(`/storyteller/sessions/${session.id}`);
                      }}
                    >
                      <div className="text-xs text-gray-500">Player {idx + 1}</div>
                      <div className="text-[11px] font-mono text-gray-700">{playerId.slice(0, 8)}</div>

                      <input
                        name="roll_value"
                        type="number"
                        className="w-full border rounded p-1 text-sm"
                        placeholder="Enter roll"
                      />

                      <button className="w-full px-2 py-1 rounded bg-black text-white text-sm">Submit</button>
                    </form>
                  );
                })}
              </div>

              <div className="text-xs text-gray-500">
                Players set to “Player enters roll” or “Digital dice” submit from their device.
              </div>
            </div>
          ) : (
            <div className="mt-3 text-xs text-gray-600">Open a roll to collect results.</div>
          )}
        </div>
      </div>

      {/* MAIN BOARD */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Map / City</div>
          <div className="mt-2 h-64 rounded bg-gray-100 flex items-center justify-center text-gray-500">
            Map image placeholder
          </div>
        </div>

        <div className="col-span-6 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">Story Text</div>

          <form
            action={async (fd) => {
              "use server";
              await updateStoryText(session.id, fd);
              redirect(`/storyteller/sessions/${session.id}`);
            }}
            className="mt-2 space-y-2"
          >
            <textarea
              name="story_text"
              defaultValue={session.story_text || ""}
              className="w-full h-64 border rounded p-3 font-serif"
              placeholder="Write the scene/story here..."
            />
            <button className="px-4 py-2 rounded bg-black text-white">Save Story</button>
          </form>
        </div>

        <div className="col-span-3 border rounded-xl p-4">
          <div className="text-xs uppercase text-gray-500">NPC Portrait</div>
          <div className="mt-2 h-64 rounded bg-gray-100 flex items-center justify-center text-gray-500">
            NPC image placeholder
          </div>
        </div>
      </div>

      <div className="border rounded-xl p-4">
        <div className="text-xs uppercase text-gray-500">Loot / Olives</div>
        <div className="mt-2 text-gray-600 text-sm">
          Framework panel now. Later: olive bank, drops, assignment, time-travel inventory.
        </div>
      </div>
    </div>
  );
}
