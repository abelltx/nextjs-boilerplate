export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import TimerClient from "@/components/TimerClient";
import { getDmSession, updateStoryText, updateState } from "./actions";
import { createClient } from "@/utils/supabase/server";
import { EpisodePicker } from "@/components/EpisodePicker";
import { presentBlockToPlayersAction, clearPresentedAction } from "@/app/actions/present";

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

  // Load blocks for the currently loaded episode on this session
  let blocks: any[] = [];
  const { data: sessionRow, error: sesErr } = await supabase
    .from("sessions")
    .select("episode_id")
    .eq("id", sessionId)
    .single();

  if (sesErr) {
    console.error("Failed to load session episode_id:", sesErr.message);
  } else if (sessionRow?.episode_id) {
    const { data, error: blkErr } = await supabase
      .from("episode_blocks")
      .select("id,sort_order,block_type,audience,mode,title,body,image_url,meta")
      .eq("episode_id", sessionRow.episode_id)
      .order("sort_order", { ascending: true });

    if (blkErr) console.error("Failed to load episode_blocks:", blkErr.message);
    blocks = data ?? [];
  }
function EncounterPreview({ b }: { b: any }) {
  const monsters = b?.meta?.monsters ?? [];
  const notes = b?.meta?.notes;

  return (
    <div className="border rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="text-xs uppercase text-gray-500">Encounter (preview)</div>

      {notes ? <div className="text-sm whitespace-pre-wrap">{notes}</div> : null}

      {monsters.length ? (
        <div className="space-y-2">
          {monsters.map((m: any, i: number) => (
            <div key={m?.id ?? i} className="border rounded p-2 bg-white">
              <div className="font-semibold">{m?.name ?? `Monster ${i + 1}`}</div>
              <div className="text-xs text-gray-600">
                AC {m?.ac ?? "—"} • HP {m?.hp ?? "—"} • ATK {m?.attack ?? "—"} • DMG {m?.damage ?? "—"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-gray-600">No monsters in meta yet.</div>
      )}
    </div>
  );
}

  const { data: episodes, error: epErr } = await supabase
    .from("episodes")
    .select("id,title,episode_code,tags")
    .order("created_at", { ascending: false });

  if (epErr) console.error(epErr);

  // Presentable blocks = anything not storyteller-only
  const presentable = (blocks ?? []).filter((b: any) => b.audience !== "storyteller");
  const storytellerOnly = (blocks ?? []).filter((b: any) => b.audience === "storyteller");
  const encounters = storytellerOnly.filter((b: any) => String(b.block_type).toLowerCase() === "encounter");
  const totalPresentable = presentable.length;

  const currentIdx = presentable.findIndex((b: any) => b.id === state.presented_block_id);
  const currentHuman = currentIdx >= 0 ? currentIdx + 1 : 0;

  const canBack = currentIdx > 0;
  const canNext = totalPresentable > 0 && (currentIdx === -1 || currentIdx < totalPresentable - 1);

  const nextIdx = currentIdx === -1 ? 0 : currentIdx + 1;
  const backIdx = currentIdx - 1;

  const episodePct =
    totalPresentable > 0 ? Math.round(((currentHuman || 0) / totalPresentable) * 100) : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <EpisodePicker sessionId={sessionId} episodes={episodes ?? []} />

      {/* TOP BAR */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-8 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Session</div>
              <div className="text-xl font-bold">{session.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase text-gray-500">Join Code</div>
              <div className="font-mono text-xl font-bold">{session.join_code}</div>
            </div>
          </div>

          {/* PLAYER SLOTS (6 max) */}
          <div className="mt-4 grid grid-cols-6 gap-2">
            {Array.from({ length: 6 }).map((_, i) => {
              const p = joins[i];
              return (
                <div key={i} className="border rounded-lg p-2 text-center">
                  <div className="text-xs text-gray-500">Player {i + 1}</div>
                  <div className="text-[11px] font-mono break-all">
                    {p ? p.player_id.slice(0, 8) : "—"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* NPC/MONSTER SLOTS (placeholders) */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {["NPC A", "NPC B", "Monster A", "Monster B"].map((label) => (
              <div key={label} className="border rounded-lg p-2 text-center text-xs text-gray-600">
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-4 space-y-3">
          <TimerClient
            remainingSeconds={state.remaining_seconds}
            status={state.timer_status}
            updatedAt={state.updated_at}
          />

          {/* TIMER CONTROLS */}
          <div className="border rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase text-gray-500">Timer Controls</div>
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
                    timer_status: "stopped",
                    remaining_seconds: state.duration_seconds,
                  });
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded border text-sm">Reset</button>
              </form>

              <form
                action={async () => {
                  "use server";
                  await updateState(session.id, { remaining_seconds: state.remaining_seconds + 300 });
                  redirect(`/storyteller/sessions/${session.id}`);
                }}
              >
                <button className="px-3 py-2 rounded border text-sm">+5 min</button>
              </form>
            </div>
          </div>
        </div>
      </div>
 {/* PLAYER PROJECT */}
<div className="border rounded-xl p-4 space-y-4">
  {(() => {
    // Build one accordion list:
    // - presentable blocks (players/both) -> can be presented
    // - encounter blocks (even if storyteller-only) -> show encounter UI, but don't present
    const presentableBlocks = (blocks ?? []).filter((b: any) => b.audience !== "storyteller");
    const encounterBlocks = (blocks ?? []).filter(
      (b: any) => String(b.block_type).toLowerCase() === "encounter"
    );

    // Merge, de-dupe (if any encounter is also presentable), then sort
    const mergedMap = new Map<string, any>();
    [...presentableBlocks, ...encounterBlocks].forEach((b: any) => mergedMap.set(b.id, b));
    const merged = Array.from(mergedMap.values()).sort((a: any, b: any) => a.sort_order - b.sort_order);

    const totalPresentable = presentableBlocks.length;

    const currentIdx = presentableBlocks.findIndex((b: any) => b.id === state.presented_block_id);
    const currentHuman = currentIdx >= 0 ? currentIdx + 1 : 0;

    const canBack = currentIdx > 0;
    const canNext = totalPresentable > 0 && (currentIdx === -1 || currentIdx < totalPresentable - 1);

    const nextIdx = currentIdx === -1 ? 0 : currentIdx + 1;
    const backIdx = currentIdx - 1;

    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-gray-500">Player Project</div>
            <div className="text-sm text-gray-700">
              {totalPresentable ? (
                <>
                  Block <b>{currentHuman || 0}</b> of <b>{totalPresentable}</b>{" "}
                  <span className="text-xs text-gray-500">(player-visible progression)</span>
                </>
              ) : (
                "No presentable blocks (set audience = players or both)."
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <form
              action={async () => {
                "use server";
                await clearPresentedAction(session.id);
                redirect(`/storyteller/sessions/${session.id}`);
              }}
            >
              <button className="px-3 py-2 rounded border">Clear</button>
            </form>

            <form
              action={async () => {
                "use server";
                if (canBack) {
                  await presentBlockToPlayersAction(session.id, presentableBlocks[backIdx].id);
                }
                redirect(`/storyteller/sessions/${session.id}`);
              }}
            >
              <button className="px-3 py-2 rounded border" disabled={!canBack}>
                ◀ Back
              </button>
            </form>

            <form
              action={async () => {
                "use server";
                if (canNext) {
                  await presentBlockToPlayersAction(session.id, presentableBlocks[nextIdx].id);
                }
                redirect(`/storyteller/sessions/${session.id}`);
              }}
            >
              <button className="px-3 py-2 rounded bg-black text-white" disabled={!canNext}>
                Next ▶
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-2">
          {merged.map((b: any, i: number) => {
            const isLive = b.id === state.presented_block_id;
            const isEncounter = String(b.block_type).toLowerCase() === "encounter";
            const isPresentable = b.audience !== "storyteller"; // players or both

            return (
              <details key={b.id} className={`border rounded-lg p-2 ${isLive ? "bg-gray-50" : ""}`}>
                <summary className="cursor-pointer flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="text-gray-500 mr-2">#{b.sort_order}</span>
                    <span className="font-semibold">{b.block_type}</span>
                    {b.title ? ` — ${b.title}` : ""}

                    {isEncounter && !isPresentable ? (
                      <span className="ml-2 text-xs text-gray-500">(ST)</span>
                    ) : null}

                    {isLive ? <span className="ml-2 text-xs text-green-700">(LIVE)</span> : null}
                  </div>

                  <div className="text-xs text-gray-500">
                    {isPresentable ? "players/both" : "storyteller"}
                  </div>
                </summary>

                <div className="mt-2 space-y-2">
                  {b.body ? <div className="whitespace-pre-wrap text-sm">{b.body}</div> : null}

                  {b.image_url ? (
                    <div className="rounded border overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.image_url} alt="Block" className="w-full h-auto" />
                    </div>
                  ) : null}

                  {/* ✅ ENCOUNTER UI INSIDE THE ENCOUNTER BLOCK */}
                  {isEncounter ? (
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
                                AC {m.ac ?? "—"} • HP {m.hp ?? "—"} • ATK {m.attack ?? "—"} • DMG {m.damage ?? "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">No monsters defined in meta.</div>
                      )}
                    </div>
                  ) : null}

                  {/* Only present blocks that are player-visible */}
                  {isPresentable ? (
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
          })}
        </div>
      </>
    );
  })()}
</div>


      {/* EPISODE PROGRESS + ROLLS */}
      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-6 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase text-gray-500">Episode Progress</div>
              <div className="font-bold">
                {totalPresentable === 0 ? "No presentable blocks" : `Block ${currentHuman || 0} / ${totalPresentable}`}
              </div>
            </div>
            <div className="text-2xl font-bold">{episodePct}%</div>
          </div>

          <div className="mt-3 h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-2 bg-black" style={{ width: `${episodePct}%` }} />
          </div>

          <div className="mt-3 text-xs text-gray-600">
            This meter follows what you present to players (blocks with audience = players/both).
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

          <div className="mt-3 text-xs text-gray-600">
            Result entry grid comes next (ST types what players rolled).
          </div>
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

      {/* LOOT / OLIVES */}
      <div className="border rounded-xl p-4">
        <div className="text-xs uppercase text-gray-500">Loot / Olives</div>
        <div className="mt-2 text-gray-600 text-sm">
          Framework panel now. Later: olive bank, drops, assignment, time-travel inventory.
        </div>
      </div>
    </div>
  );
}
