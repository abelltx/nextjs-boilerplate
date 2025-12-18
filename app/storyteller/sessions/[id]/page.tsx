export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateEpisodeAction, deleteEpisodeAction } from "@/app/actions/episodesAdmin";
import {
  addEpisodeBlockAction,
  updateEpisodeBlockAction,
  deleteEpisodeBlockAction,
  moveEpisodeBlockAction,
} from "@/app/actions/episodeBlocksAdmin";

async function requireAdminServer() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", authData.user.id)
    .single();

  if (error) throw new Error(error.message);
  if (!profile?.is_admin) redirect("/storyteller/sessions");

  return supabase;
}

// Strict UUID v1-v5 check (prevents "undefined" and other garbage reaching Postgres)
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

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "";
  }
}

export default async function AdminEpisodeEditPage({
  params,
}: {
  params: { id?: string } | Promise<{ id?: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const rawId = resolvedParams?.id;

  if (!rawId || rawId === "undefined" || !isUuid(rawId)) {
    redirect("/admin/episodes");
  }

  const id = rawId.trim();
  const supabase = await requireAdminServer();

  const { data: episode, error } = await supabase.from("episodes").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  if (!episode) redirect("/admin/episodes");

  const { data: blocksRaw, error: blocksErr } = await supabase
    .from("episode_blocks")
    .select("id,sort_order,block_type,audience,mode,title,body,image_url,meta")
    .eq("episode_id", id)
    .order("sort_order", { ascending: true });

  if (blocksErr) throw new Error(blocksErr.message);

  const blocks: Block[] = (blocksRaw ?? []) as any;
  const ordered = [...blocks].sort((a, b) => a.sort_order - b.sort_order);

  // --- Scene grouping (same approach as storyteller page) ---
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

  const mins = Math.round((episode.default_duration_seconds ?? 0) / 60);

  // Progression: count only NON-scene blocks
  const nonSceneBlocks = ordered.filter((b) => !isScene(b));
  const nonSceneIndexById = new Map<string, number>();
  nonSceneBlocks.forEach((b, idx) => nonSceneIndexById.set(b.id, idx + 1));
  const nonSceneTotal = nonSceneBlocks.length;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      {/* HEADER */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold">Edit Episode</div>
          <div className="text-sm text-gray-600">
            {episode.title} {episode.episode_code ? `(${episode.episode_code})` : ""}
          </div>
        </div>

        <div className="flex gap-2">
          <Link href="/admin/episodes" className="px-4 py-2 rounded border">
            Back
          </Link>

          <form
            action={async () => {
              "use server";
              await deleteEpisodeAction(episode.id);
              redirect("/admin/episodes");
            }}
          >
            <button className="px-4 py-2 rounded border text-red-600">Delete</button>
          </form>
        </div>
      </div>

      {/* TOP ROW: Episode edit (left) + Info (right) — same vibe as storyteller */}
      <div className="grid grid-cols-12 gap-3">
        {/* EDIT FORM */}
        <form
          className="col-span-8 border rounded-xl p-4 space-y-4"
          encType="multipart/form-data"
          action={async (fd) => {
            "use server";
            await updateEpisodeAction(episode.id, fd);
            redirect(`/admin/episodes/${episode.id}`);
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">Title</div>
              <input name="title" className="w-full border rounded-lg p-2" defaultValue={episode.title ?? ""} required />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">Episode Code</div>
              <input
                name="episode_code"
                className="w-full border rounded-lg p-2"
                defaultValue={episode.episode_code ?? ""}
                placeholder="GEN-007"
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">Duration (minutes)</div>
              <input
                name="default_duration_minutes"
                type="number"
                className="w-full border rounded-lg p-2"
                defaultValue={Number.isFinite(mins) ? mins : 0}
                min={0}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">Map Upload</div>
              <input name="map_file" type="file" accept="image/*" className="w-full border rounded-lg p-2" />
              <div className="text-[11px] text-gray-500">
                Upload replaces the current map. If you don’t pick a file, the map stays as-is.
              </div>
            </label>
          </div>

          <label className="space-y-1 block">
            <div className="text-xs uppercase text-gray-500">Announcement Board</div>
            <textarea
              name="story_text"
              className="w-full border rounded-lg p-3 h-40 font-serif"
              defaultValue={episode.story_text ?? ""}
              placeholder="Always-visible message for players (announcements, reminders, etc.)"
            />
          </label>

          <label className="space-y-1 block">
            <div className="text-xs uppercase text-gray-500">Summary</div>
            <textarea
              name="summary"
              className="w-full border rounded-lg p-2 h-20"
              defaultValue={episode.summary ?? ""}
              placeholder="Short summary (admin-only)"
            />
          </label>

          <button className="px-4 py-2 rounded bg-black text-white">Save Changes</button>
        </form>

        {/* INFO BOX */}
        <div className="col-span-4 space-y-3">
          <div className="border rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase text-gray-500">Episode</div>
            <div className="text-lg font-bold">{episode.title}</div>
            <div className="text-xs text-gray-600">
              {episode.episode_code ?? "No code"} • {mins} min • Scenes: <b>{scenes.length}</b> • Blocks:{" "}
              <b>{nonSceneTotal}</b>
            </div>
          </div>

          <div className="border rounded-xl p-4 space-y-2">
            <div className="text-xs uppercase text-gray-500">Map</div>
            {episode.map_image_url ? (
              <div className="rounded-lg border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={episode.map_image_url} alt="Map" className="w-full h-auto" />
              </div>
            ) : (
              <div className="text-sm text-gray-600">No map uploaded yet.</div>
            )}
          </div>

          {episode.summary ? (
            <div className="border rounded-xl p-4">
              <div className="text-xs uppercase text-gray-500">Summary</div>
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{episode.summary}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* STORYBOARD / TOC — align with storyteller: scenes -> nested blocks */}
      <div className="border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-gray-500">Episode Table of Contents</div>
            <div className="text-sm text-gray-700">
              {scenes.length ? (
                <>
                  Scenes: <b>{scenes.length}</b> • Non-scene blocks: <b>{nonSceneTotal}</b>
                </>
              ) : (
                "No scenes found (add block_type = scene)."
              )}
            </div>
          </div>

          <Link href={`/storyteller/sessions`} className="px-3 py-2 rounded border text-sm">
            Go to Sessions
          </Link>
        </div>

        {/* GLOBAL quick add (still useful) */}
        <details className="border rounded-lg p-2">
          <summary className="cursor-pointer text-sm font-semibold">Quick Add (global)</summary>
          <div className="mt-2">
            <form
              className="border rounded-lg p-3 space-y-2"
              action={async (fd) => {
                "use server";
                await addEpisodeBlockAction(episode.id, fd);
                redirect(`/admin/episodes/${episode.id}`);
              }}
            >
              <div className="grid grid-cols-4 gap-2">
                <label className="space-y-1">
                  <div className="text-xs uppercase text-gray-500">Type</div>
                  <select name="block_type" className="w-full border rounded p-2">
                    <option value="scene">scene</option>
                    <option value="objective">objective</option>
                    <option value="map">map</option>
                    <option value="narrative">narrative</option>
                    <option value="note">note</option>
                    <option value="hex_crawl">hex_crawl</option>
                    <option value="encounter">encounter</option>
                    <option value="loot">loot</option>
                    <option value="monster">monster</option>
                    <option value="npc">npc</option>
                    <option value="attire">attire</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-xs uppercase text-gray-500">Audience</div>
                  <select name="audience" className="w-full border rounded p-2">
                    <option value="both">both</option>
                    <option value="players">players</option>
                    <option value="storyteller">storyteller</option>
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-xs uppercase text-gray-500">Mode</div>
                  <select name="mode" className="w-full border rounded p-2">
                    <option value="display">display</option>
                    <option value="read">read</option>
                    <option value="prompt">prompt</option>
                    <option value="encounter">encounter</option>
                  </select>
                </label>

                <div className="flex items-end">
                  <button className="w-full px-3 py-2 rounded bg-black text-white">Add Block</button>
                </div>
              </div>

              <input name="title" placeholder="Block title (optional)" className="w-full border rounded p-2" />
              <textarea name="body" placeholder="Body text (optional)" className="w-full border rounded p-2 h-24" />
              <input name="image_url" placeholder="Image URL (optional)" className="w-full border rounded p-2" />
              <textarea
                name="meta_json"
                placeholder={`Meta JSON (optional)\nExample:\n{\n  "dc": 12,\n  "loot": ["Olives"]\n}`}
                className="w-full border rounded p-2 h-28 font-mono text-[12px]"
              />
            </form>
          </div>
        </details>

        {/* SCENES */}
        <div className="space-y-2">
          {scenes.map((s, si) => {
            const totalScenes = scenes.length;

            return (
              <details key={s.scene.id} className="border rounded-lg p-2">
                <summary className="cursor-pointer flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="text-gray-500 mr-2">
                      Scene {si + 1} of {totalScenes}
                    </span>
                    <span className="font-semibold">{s.scene.title ?? "Scene"}</span>
                  </div>
                  <div className="text-xs text-gray-500 font-mono">#{s.scene.sort_order}</div>
                </summary>

                <div className="mt-2 space-y-3">
                  {/* Scene body */}
                  {s.scene.body ? <div className="text-sm whitespace-pre-wrap">{s.scene.body}</div> : null}

                  {/* Scene header edit */}
                  <details className="border rounded-lg p-2">
                    <summary className="cursor-pointer text-sm font-semibold">Edit scene header</summary>

                    <div className="mt-2 space-y-2">
                      <form
                        className="space-y-2"
                        action={async (fd) => {
                          "use server";
                          await updateEpisodeBlockAction(s.scene.id, episode.id, fd);
                          redirect(`/admin/episodes/${episode.id}`);
                        }}
                      >
                        <div className="grid grid-cols-3 gap-2">
                          <input name="block_type" className="border rounded p-2" defaultValue={s.scene.block_type} />
                          <input name="audience" className="border rounded p-2" defaultValue={s.scene.audience} />
                          <input name="mode" className="border rounded p-2" defaultValue={s.scene.mode} />
                        </div>

                        <input
                          name="title"
                          className="w-full border rounded p-2"
                          defaultValue={s.scene.title ?? ""}
                          placeholder="Scene title"
                        />

                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-24"
                          defaultValue={s.scene.body ?? ""}
                          placeholder="Scene description (optional)"
                        />

                        <input
                          name="image_url"
                          className="w-full border rounded p-2"
                          defaultValue={s.scene.image_url ?? ""}
                          placeholder="Scene image URL (optional)"
                        />

                        <textarea
                          name="meta_json"
                          className="w-full border rounded p-2 h-28 font-mono text-[12px]"
                          defaultValue={s.scene.meta ? safeJsonStringify(s.scene.meta) : ""}
                          placeholder="Meta JSON (optional)"
                        />

                        <button className="px-3 py-2 rounded border">Save Scene</button>
                      </form>

                      <form
                        action={async () => {
                          "use server";
                          await deleteEpisodeBlockAction(s.scene.id, episode.id);
                          redirect(`/admin/episodes/${episode.id}`);
                        }}
                      >
                        <button className="px-3 py-2 rounded border text-red-600">Delete Scene</button>
                      </form>
                    </div>
                  </details>

                  {/* TREE: Add options under this scene */}
                  <details className="border rounded-lg p-2 bg-gray-50">
                    <summary className="cursor-pointer text-sm font-semibold">Add to this scene (tree)</summary>

                    <div className="mt-2 space-y-2">
                      {/* Helper: compact add form */}
                      {[
                        {
                          label: "Objective",
                          hint: "players can see",
                          block_type: "objective",
                          audience: "players",
                          mode: "display",
                          titleDefault: "Objective",
                          bodyPh: "What must players accomplish?",
                        },
                        {
                          label: "Map",
                          hint: "players can see",
                          block_type: "map",
                          audience: "players",
                          mode: "display",
                          titleDefault: "Map",
                          bodyPh: "Short map note (optional)",
                          wantsImage: true,
                        },
                        {
                          label: "Narrative",
                          hint: "storyteller only (read to players)",
                          block_type: "narrative",
                          audience: "storyteller",
                          mode: "read",
                          titleDefault: "Narrative",
                          bodyPh: "Write what the storyteller reads aloud.",
                        },
                        {
                          label: "Note",
                          hint: "storyteller awareness",
                          block_type: "note",
                          audience: "storyteller",
                          mode: "display",
                          titleDefault: "Note",
                          bodyPh: "Behind-the-screen reminders, triggers, timing…",
                        },
                        {
                          label: "Hex Crawl",
                          hint: "placeholder",
                          block_type: "hex_crawl",
                          audience: "storyteller",
                          mode: "prompt",
                          titleDefault: "Hex Crawl",
                          bodyPh: "Hex title / description / travel prompts…",
                          metaPh: `{\n  "hex_id": "A3",\n  "terrain": "forest",\n  "travel_dc": 12\n}`,
                        },
                        {
                          label: "Encounter",
                          hint: "placeholder (battle)",
                          block_type: "encounter",
                          audience: "both",
                          mode: "encounter",
                          titleDefault: "Encounter",
                          bodyPh: "Encounter setup / win conditions / battlefield notes…",
                          metaPh: `{\n  "difficulty": "medium",\n  "waves": 1\n}`,
                        },
                        {
                          label: "Loot",
                          hint: "placeholder (after encounter)",
                          block_type: "loot",
                          audience: "both",
                          mode: "display",
                          titleDefault: "Loot (after encounter)",
                          bodyPh: "What can be won? (placeholder)",
                        },
                        {
                          label: "Monsters",
                          hint: "placeholder (for encounter)",
                          block_type: "monster",
                          audience: "storyteller",
                          mode: "display",
                          titleDefault: "Monsters (placeholder)",
                          bodyPh: "List monsters / counts / notes (placeholder)",
                        },
                        {
                          label: "NPC",
                          hint: "placeholder “popup when important”",
                          block_type: "npc",
                          audience: "both",
                          mode: "prompt",
                          titleDefault: "NPC",
                          bodyPh: "NPC dialogue / role / what matters…",
                          metaPh: `{\n  "popup": true,\n  "trigger": "when players ask about X"\n}`,
                        },
                      ].map((cfg) => (
                        <details key={cfg.label} className="border rounded bg-white">
                          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                            {cfg.label}{" "}
                            <span className="text-xs font-normal text-gray-500">• {cfg.hint}</span>
                          </summary>

                          <div className="p-3 border-t space-y-2">
                            <form
                              className="space-y-2"
                              action={async (fd) => {
                                "use server";
                                await addEpisodeBlockAction(episode.id, fd);
                                redirect(`/admin/episodes/${episode.id}`);
                              }}
                            >
                              <input type="hidden" name="block_type" value={cfg.block_type} />
                              <input type="hidden" name="audience" value={cfg.audience} />
                              <input type="hidden" name="mode" value={cfg.mode} />

                              <input
                                name="title"
                                className="w-full border rounded p-2"
                                defaultValue={cfg.titleDefault}
                                placeholder="Title"
                              />

                              <textarea
                                name="body"
                                className="w-full border rounded p-2 h-24"
                                placeholder={cfg.bodyPh}
                              />

                              {cfg.wantsImage ? (
                                <input
                                  name="image_url"
                                  className="w-full border rounded p-2"
                                  placeholder="Image URL (required for now)"
                                />
                              ) : (
                                <input name="image_url" className="w-full border rounded p-2" placeholder="Image URL (optional)" />
                              )}

                              <textarea
                                name="meta_json"
                                className="w-full border rounded p-2 h-24 font-mono text-[12px]"
                                placeholder={cfg.metaPh ? `Meta JSON (optional)\n${cfg.metaPh}` : "Meta JSON (optional)"}
                              />

                              <button className="px-3 py-2 rounded bg-black text-white">Add {cfg.label}</button>
                            </form>
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>

                  {/* CHILD BLOCKS */}
                  <div className="space-y-2">
                    {s.children.length ? (
                      s.children.map((b) => {
                        const idx = nonSceneIndexById.get(b.id) ?? 0;

                        return (
                          <details key={b.id} className="border rounded-lg p-2">
                            <summary className="cursor-pointer flex items-center justify-between gap-3">
                              <div className="text-sm">
                                <span className="text-gray-500 mr-2">
                                  Block {idx || "?"} of {nonSceneTotal}
                                </span>
                                <span className="font-semibold">{b.block_type}</span>
                                {b.title ? ` — ${b.title}` : ""}
                                <span className="ml-2 text-xs text-gray-500">
                                  ({b.audience} • {b.mode})
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 font-mono">#{b.sort_order}</div>
                            </summary>

                            <div className="mt-2 space-y-3">
                              {b.body ? <div className="whitespace-pre-wrap text-sm">{b.body}</div> : null}

                              {b.image_url ? (
                                <div className="rounded border overflow-hidden">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={b.image_url} alt="Block" className="w-full h-auto" />
                                </div>
                              ) : null}

                              {/* Controls row */}
                              <div className="flex flex-wrap gap-2">
                                <form
                                  action={async () => {
                                    "use server";
                                    await moveEpisodeBlockAction(b.id, episode.id, "up");
                                    redirect(`/admin/episodes/${episode.id}`);
                                  }}
                                >
                                  <button className="px-3 py-2 rounded border text-sm">↑ Move Up</button>
                                </form>

                                <form
                                  action={async () => {
                                    "use server";
                                    await moveEpisodeBlockAction(b.id, episode.id, "down");
                                    redirect(`/admin/episodes/${episode.id}`);
                                  }}
                                >
                                  <button className="px-3 py-2 rounded border text-sm">↓ Move Down</button>
                                </form>

                                <form
                                  action={async () => {
                                    "use server";
                                    await deleteEpisodeBlockAction(b.id, episode.id);
                                    redirect(`/admin/episodes/${episode.id}`);
                                  }}
                                >
                                  <button className="px-3 py-2 rounded border text-sm text-red-600">Delete</button>
                                </form>
                              </div>

                              {/* Edit form */}
                              <form
                                className="space-y-2"
                                action={async (fd) => {
                                  "use server";
                                  await updateEpisodeBlockAction(b.id, episode.id, fd);
                                  redirect(`/admin/episodes/${episode.id}`);
                                }}
                              >
                                <div className="grid grid-cols-3 gap-2">
                                  <input name="block_type" className="border rounded p-2" defaultValue={b.block_type} />
                                  <input name="audience" className="border rounded p-2" defaultValue={b.audience} />
                                  <input name="mode" className="border rounded p-2" defaultValue={b.mode} />
                                </div>

                                <input
                                  name="title"
                                  className="w-full border rounded p-2"
                                  defaultValue={b.title ?? ""}
                                  placeholder="Title"
                                />

                                <textarea
                                  name="body"
                                  className="w-full border rounded p-2 h-28"
                                  defaultValue={b.body ?? ""}
                                  placeholder="Body"
                                />

                                <input
                                  name="image_url"
                                  className="w-full border rounded p-2"
                                  defaultValue={b.image_url ?? ""}
                                  placeholder="Image URL"
                                />

                                <textarea
                                  name="meta_json"
                                  className="w-full border rounded p-2 h-28 font-mono text-[12px]"
                                  defaultValue={b.meta ? safeJsonStringify(b.meta) : ""}
                                  placeholder="Meta JSON (optional)"
                                />

                                <button className="px-3 py-2 rounded bg-black text-white">Save Block</button>
                              </form>
                            </div>
                          </details>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-600">
                        No blocks inside this scene yet. Use “Add to this scene (tree)” above.
                      </div>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>

        {!scenes.length ? (
          <div className="text-sm text-gray-500 italic">
            No scenes yet. Add a <b>scene</b> first using “Quick Add (global)”.
          </div>
        ) : null}
      </div>
    </div>
  );
}
