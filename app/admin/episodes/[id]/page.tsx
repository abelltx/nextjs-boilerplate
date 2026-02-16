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
import MapMarkerEditorClient from "./MapMarkerEditorClient";

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

  const { data: episode, error } = await supabase
    .from("episodes")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  if (!episode) redirect("/admin/episodes");

  // Load blocks
  const { data: blocks, error: blocksErr } = await supabase
    .from("episode_blocks")
    .select("*")
    .eq("episode_id", id)
    .order("sort_order", { ascending: true });

  if (blocksErr) throw new Error(blocksErr.message);

  // Group blocks into scenes (scene blocks become headers)
  const sceneGroups: Array<{ scene: any | null; items: any[] }> = [];
  let current = { scene: null as any | null, items: [] as any[] };

  for (const b of blocks ?? []) {
    if (b.block_type === "scene") {
      if (current.scene || current.items.length) sceneGroups.push(current);
      current = { scene: b, items: [] };
    } else {
      current.items.push(b);
    }
  }
  if (current.scene || current.items.length) sceneGroups.push(current);

  const mins = Math.round((episode.default_duration_seconds ?? 0) / 60);

  // Progression: count only NON-scene blocks for "Block X of Y"
  const nonSceneBlocks = (blocks ?? []).filter((b: any) => b.block_type !== "scene");
  const nonSceneIndexById = new Map<string, number>();
  nonSceneBlocks.forEach((b: any, idx: number) => nonSceneIndexById.set(b.id, idx + 1));
  const nonSceneTotal = nonSceneBlocks.length;

  // Optional: generated player-facing preview (no DB changes)
  const playerScript = (blocks ?? [])
    .filter((b: any) => b.audience === "players" || b.audience === "both")
    .map((b: any) => {
      const isScene = b.block_type === "scene";
      const title = (b.title ?? "").trim();
      const body = (b.body ?? "").trim();
      if (isScene) {
        return `\n## ${title || "Scene"}\n${body ? `${body}\n` : ""}`;
      }
      const head = title ? `### ${title}\n` : "";
      return `${head}${body ? `${body}\n` : ""}`;
    })
    .join("\n")
    .trim();

  const storytellerFlow =
    sceneGroups.length > 0 ? sceneGroups : [{ scene: null as any, items: (blocks ?? []) as any[] }];
  const playerFlow = storytellerFlow
    .map((g) => {
      const sceneAudience = String(g.scene?.audience ?? "both");
      const sceneVisible = sceneAudience === "players" || sceneAudience === "both";
      const playerItems = (g.items ?? []).filter((b: any) => {
        const a = String(b.audience ?? "both");
        return a === "players" || a === "both";
      });
      if (!sceneVisible && playerItems.length === 0) return null;
      return {
        scene: sceneVisible ? g.scene : null,
        items: playerItems,
      };
    })
    .filter(Boolean) as Array<{ scene: any | null; items: any[] }>;

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
          <a href="#storyteller-preview" className="px-4 py-2 rounded border">
            Preview Storyteller View
          </a>
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

      <div className="grid grid-cols-12 gap-4">
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
              <input
                name="title"
                className="w-full border rounded-lg p-2"
                defaultValue={episode.title ?? ""}
                required
              />
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
              <input
                name="map_file"
                type="file"
                accept="image/*"
                className="w-full border rounded-lg p-2"
              />
              <div className="text-[11px] text-gray-500">
                Upload replaces the current map. If you don’t pick a file, the map stays as-is.
              </div>
            </label>
          </div>

          <label className="space-y-1 block">
            <div className="text-xs uppercase text-gray-500">Announcement Board</div>
            <textarea
              name="story_text"
              className="w-full border rounded-lg p-3 h-56 font-serif"
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
        <div className="col-span-4 border rounded-xl p-4 space-y-3">
          <div className="text-xs uppercase text-gray-500">Episode Info</div>

          <div className="rounded-lg border p-3">
            <div className="text-sm font-semibold">{episode.title}</div>
            <div className="text-xs text-gray-600">
              {episode.episode_code ?? "No code"} • {mins} min
            </div>
          </div>

          {episode.map_image_url ? (
            <div className="rounded-lg border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={episode.map_image_url} alt="Map" className="w-full h-auto" />
            </div>
          ) : (
            <div className="text-sm text-gray-600">No map uploaded yet.</div>
          )}

          {episode.summary ? (
            <div className="rounded-lg border p-3 text-sm text-gray-700 whitespace-pre-wrap">
              {episode.summary}
            </div>
          ) : null}

          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase text-gray-500">Player Script Preview (generated)</div>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 border rounded-lg p-3">
              {playerScript || "No player-facing blocks yet."}
            </pre>
          </div>
        </div>
      </div>

      <details id="storyteller-preview" className="border rounded-xl p-4 space-y-3">
        <summary className="cursor-pointer text-sm font-semibold">Open Previews (Storyteller + Player)</summary>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Storyteller Preview</div>
            <div className="text-xs text-gray-600">
              This is a read-through preview of what the storyteller flow will look like during play.
            </div>
          </div>
          <a href="#storyboard" className="px-3 py-2 rounded border text-xs">
            Jump to Storyboard Editor
          </a>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="space-y-4">
            <div className="text-sm font-semibold">Storyteller View</div>
            {storytellerFlow.map((g, gi) => (
              <div key={g.scene?.id ?? `preview-${gi}`} className="rounded-xl border">
                <div className="border-b bg-gray-50 px-3 py-2">
                  <div className="text-xs uppercase text-gray-500">Scene {gi + 1}</div>
                  <div className="font-semibold">
                    {g.scene?.title?.trim() ? g.scene.title : "Unscoped Scene"}
                  </div>
                  {g.scene?.body ? (
                    <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{g.scene.body}</div>
                  ) : (
                    <div className="mt-1 text-sm text-amber-700">Add scene narration text here.</div>
                  )}
                </div>

                <div className="space-y-2 p-3">
                  {g.items.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-3 text-sm text-gray-600">
                      No blocks in this scene yet. Add objectives, narrative, map, or encounter blocks.
                    </div>
                  ) : (
                    g.items.map((b: any, idx: number) => (
                      <div key={b.id ?? `${gi}-${idx}`} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded border bg-gray-50 px-2 py-0.5">{b.block_type}</span>
                          <span className="rounded border bg-gray-50 px-2 py-0.5">{b.audience}</span>
                          <span className="rounded border bg-gray-50 px-2 py-0.5">{b.mode}</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold">{b.title || "(Untitled block)"}</div>
                        {b.body ? (
                          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{b.body}</div>
                        ) : (
                          <div className="mt-1 text-sm text-amber-700">Add block text.</div>
                        )}
                        {b.image_url ? (
                          <div className="mt-2 overflow-hidden rounded border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.image_url} alt={b.title ?? "Block image"} className="max-h-64 w-full object-cover" />
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4">
            <div className="text-sm font-semibold">Player Stage Preview</div>
            {playerFlow.length === 0 ? (
              <div className="rounded-xl border border-dashed p-3 text-sm text-gray-600">
                No player-visible blocks yet. Set block audience to <b>players</b> or <b>both</b>.
              </div>
            ) : (
              playerFlow.map((g, gi) => (
                <div key={g.scene?.id ?? `player-preview-${gi}`} className="rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-100">
                  <div className="border-b border-neutral-800 bg-neutral-900/50 px-3 py-2">
                    <div className="text-xs uppercase tracking-wide text-neutral-400">Stage Scene {gi + 1}</div>
                    <div className="font-semibold">{g.scene?.title?.trim() ? g.scene.title : "Current Stage"}</div>
                    {g.scene?.body ? (
                      <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{g.scene.body}</div>
                    ) : null}
                  </div>

                  <div className="space-y-2 p-3">
                    {g.items.length === 0 ? (
                      <div className="rounded-lg border border-neutral-800 p-3 text-sm text-neutral-400">
                        No player-visible blocks in this scene.
                      </div>
                    ) : (
                      g.items.map((b: any, idx: number) => (
                        <div key={b.id ?? `${gi}-${idx}`} className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3">
                          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                            <span className="rounded border border-neutral-700 px-2 py-0.5">{b.block_type}</span>
                            <span className="rounded border border-neutral-700 px-2 py-0.5">{b.mode}</span>
                          </div>
                          <div className="text-sm font-semibold text-neutral-100">{b.title || "(Untitled block)"}</div>
                          {b.body ? (
                            <div className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{b.body}</div>
                          ) : (
                            <div className="mt-1 text-sm text-amber-300">Add player-facing text.</div>
                          )}
                          {b.image_url ? (
                            <div className="mt-2 overflow-hidden rounded border border-neutral-800">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={b.image_url} alt={b.title ?? "Stage image"} className="max-h-64 w-full object-cover" />
                            </div>
                          ) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </details>

      {/* STORYBOARD */}
      <div id="storyboard" className="border rounded-xl p-4 space-y-3">
        <div>
          <div className="text-lg font-semibold">Storyboard</div>
          <div className="text-xs text-gray-600">
            Add <b>scene</b> blocks to create headers. Everything after a scene belongs to it until the next scene.
          </div>
        </div>

        <form
          className="rounded-lg border border-amber-300 bg-amber-50 p-3"
          action={async () => {
            "use server";
            const supabase = await requireAdminServer();

            const { data: last } = await supabase
              .from("episode_blocks")
              .select("sort_order")
              .eq("episode_id", episode.id)
              .order("sort_order", { ascending: false })
              .limit(1)
              .maybeSingle();

            const start = (last?.sort_order ?? 0) + 10;
            const seed = [
              {
                block_type: "scene",
                audience: "both",
                mode: "display",
                title: "Scene 1: Discovering Your Class",
                body:
                  "[FILL: Opening narration for The Upper Room Church yard sale]\n\n" +
                  "Storyteller goals:\n" +
                  "- Introduce Gabriel\n" +
                  "- Let players meet class mentors\n" +
                  "- End with each player choosing a class",
                image_url: null,
              },
              {
                block_type: "objective",
                audience: "players",
                mode: "display",
                title: "Objective - Choose Your Class",
                body:
                  "Player objective:\n" +
                  "- Speak with the mentors\n" +
                  "- Choose your class\n\n" +
                  "[FILL: 1-2 sentence player-facing prompt]",
                image_url: null,
              },
              {
                block_type: "scene",
                audience: "both",
                mode: "display",
                title: "Scene 2: Entering The Upper Room Church",
                body:
                  "[FILL: Door setup narration]\n\n" +
                  "Challenge options:\n" +
                  "- Wisdom (Prayer) DC [FILL]\n" +
                  "- Dexterity (Tools) DC [FILL]\n" +
                  "- Strength DC [FILL]\n\n" +
                  "Fail-forward note:\n" +
                  "[FILL: what happens on a failed attempt]",
                image_url: null,
              },
              {
                block_type: "map",
                audience: "players",
                mode: "display",
                title: "Church Entry",
                body:
                  "[FILL: what players should notice in this image]\n\n" +
                  "Checklist:\n" +
                  "- Upload image file or add image URL\n" +
                  "- Present to players on Stage",
                image_url: null,
              },
              {
                block_type: "scene",
                audience: "both",
                mode: "display",
                title: "Scene 3: The Call to Restore the Torah",
                body:
                  "[FILL: Gabriel return speech]\n\n" +
                  "Closeout:\n" +
                  "- Players return relics\n" +
                  "- Hand out class gear\n" +
                  "- Explain next mission hook\n" +
                  "- Mark Episode Zero complete",
                image_url: null,
              },
            ];

            const rows = seed.map((b, i) => ({
              episode_id: episode.id,
              sort_order: start + i * 10,
              block_type: b.block_type,
              audience: b.audience,
              mode: b.mode,
              title: b.title,
              body: b.body,
              image_url: b.image_url,
              meta: {},
            }));

            const { error } = await supabase.from("episode_blocks").insert(rows);
            if (error) throw new Error(error.message);

            redirect(`/admin/episodes/${episode.id}`);
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Episode Zero Starter Blocks</div>
              <div className="text-xs text-gray-700">
                Generates Scene 1-3 scaffolding for The Upper Room Church with [FILL] prompts in each block body.
              </div>
            </div>
            <button className="rounded bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800">
              Add Starter Blocks
            </button>
          </div>
        </form>

        {/* GLOBAL Add Block (still useful) */}
        <form
          className="border rounded-lg p-3 space-y-2"
          encType="multipart/form-data"
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
                <option value="npc">npc</option>
                <option value="loot">loot</option>
                <option value="attire">attire</option>
                <option value="narrative">narrative</option>
                <option value="note">note</option>
                <option value="encounter">encounter</option>
                <option value="hex_crawl">hex_crawl</option>
                <option value="monster">monster</option>
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
          <input name="image_file" type="file" accept="image/*" className="w-full border rounded p-2" />
          <textarea
            name="meta_json"
            placeholder={`Meta JSON (optional)\nExample:\n{\n  "attire_required": ["Shepherd cloak"],\n  "loot_potential": ["Olives"]\n}`}
            className="w-full border rounded p-2 h-28 font-mono text-[12px]"
          />
        </form>

        {/* Blocks List (Grouped by Scene) */}
        <div className="space-y-4">
          {sceneGroups.map((g, gi) => (
            <div key={g.scene?.id ?? `no-scene-${gi}`} className="rounded-xl border">
              {/* Scene Header */}
              <div className="p-3 border-b bg-gray-50 rounded-t-xl space-y-1">
                <div className="text-xs uppercase text-gray-500">
                  Scene {gi + 1} of {sceneGroups.length}
                </div>
                <div className="font-semibold">
                  {g.scene?.title?.trim() ? g.scene.title : "(Untitled Scene)"}
                </div>
                {g.scene?.body ? (
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">{g.scene.body}</div>
                ) : null}

                {/* Scene edit (NO nested forms) */}
                {g.scene ? (
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-gray-600">Edit scene header</summary>

                    {/* Save Scene form */}
                    <form
                      className="mt-2 space-y-2"
                      encType="multipart/form-data"
                      action={async (fd) => {
                        "use server";
                        await updateEpisodeBlockAction(g.scene.id, episode.id, fd);
                        redirect(`/admin/episodes/${episode.id}`);
                      }}
                    >
                      <div className="grid grid-cols-3 gap-2">
                        <input name="block_type" className="border rounded p-2" defaultValue={g.scene.block_type} />
                        <input name="audience" className="border rounded p-2" defaultValue={g.scene.audience} />
                        <input name="mode" className="border rounded p-2" defaultValue={g.scene.mode} />
                      </div>

                      <input
                        name="title"
                        className="w-full border rounded p-2"
                        defaultValue={g.scene.title ?? ""}
                        placeholder="Scene title"
                      />

                      <textarea
                        name="body"
                        className="w-full border rounded p-2 h-24"
                        defaultValue={g.scene.body ?? ""}
                        placeholder="Scene description (optional)"
                      />

                      <input
                        name="image_url"
                        className="w-full border rounded p-2"
                        defaultValue={g.scene.image_url ?? ""}
                        placeholder="Scene image URL (optional)"
                      />
                      <input name="image_file" type="file" accept="image/*" className="w-full border rounded p-2" />

                      <textarea
                        name="meta_json"
                        className="w-full border rounded p-2 h-28 font-mono text-[12px]"
                        defaultValue={g.scene.meta ? safeJsonStringify(g.scene.meta) : ""}
                        placeholder="Meta JSON (optional)"
                      />

                      <div className="flex gap-2">
                        <button className="px-3 py-2 rounded border">Save Scene</button>
                      </div>
                    </form>

                    {/* Delete Scene (separate sibling form) */}
                    <form
                      className="mt-2"
                      action={async () => {
                        "use server";
                        await deleteEpisodeBlockAction(g.scene.id, episode.id);
                        redirect(`/admin/episodes/${episode.id}`);
                      }}
                    >
                      <button className="px-3 py-2 rounded border text-red-600">Delete Scene</button>
                    </form>
                  </details>
                ) : null}
              </div>

              {/* Scene Content */}
              <div className="p-3 space-y-4">
                {/* Quick add (sequence-first) */}
                <form
                  className="rounded-xl border bg-slate-50 p-3 space-y-2"
                  encType="multipart/form-data"
                  action={async (fd) => {
                    "use server";
                    await addEpisodeBlockAction(episode.id, fd);
                    redirect(`/admin/episodes/${episode.id}`);
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold">Quick Add Step</div>
                    <div className="text-xs text-gray-600">Use this for sequence building, then refine in block edit.</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <select name="block_type" className="border rounded p-2 text-sm" defaultValue="objective">
                      <option value="objective">Objective (players can see)</option>
                      <option value="map">Map (players can see)</option>
                      <option value="narrative">Narrative (storyteller read)</option>
                      <option value="note">Note (storyteller awareness)</option>
                      <option value="hex_crawl">Hex Crawl (placeholder)</option>
                      <option value="encounter">Encounter (battle/loot/monsters)</option>
                      <option value="npc">NPC (important popup)</option>
                    </select>
                    <select name="audience" className="border rounded p-2 text-sm" defaultValue="players">
                      <option value="players">players</option>
                      <option value="both">both</option>
                      <option value="storyteller">storyteller</option>
                    </select>
                    <select name="mode" className="border rounded p-2 text-sm" defaultValue="display">
                      <option value="display">display</option>
                      <option value="read">read</option>
                      <option value="prompt">prompt</option>
                      <option value="encounter">encounter</option>
                    </select>
                    <button className="rounded bg-black px-3 py-2 text-sm font-semibold text-white">Add Step</button>
                  </div>
                  <input name="title" className="w-full border rounded p-2 text-sm" placeholder="Step title" />
                  <textarea name="body" className="w-full border rounded p-2 h-20 text-sm" placeholder="Step text (what happens here)" />
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input name="image_url" className="w-full border rounded p-2 text-sm" placeholder="Image URL (optional)" />
                    <input name="image_file" type="file" accept="image/*" className="w-full border rounded p-2 text-sm" />
                  </div>
                </form>

                {/* Advanced templates */}
                <details className="rounded-xl border bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">Advanced block templates</summary>
                  <div className="p-3 space-y-2">
                  <div className="text-xs uppercase text-gray-500">Add to this scene</div>

                  {/* Objective */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Objective <span className="text-xs font-normal text-gray-500">• players can see</span>
                    </summary>
                    <div className="p-3 border-t space-y-2">
                      <form
                        className="space-y-2"
                        encType="multipart/form-data"
                        action={async (fd) => {
                          "use server";
                          await addEpisodeBlockAction(episode.id, fd);
                          redirect(`/admin/episodes/${episode.id}`);
                        }}
                      >
                        <input type="hidden" name="block_type" value="objective" />
                        <input type="hidden" name="audience" value="players" />
                        <input type="hidden" name="mode" value="display" />
                        <input
                          name="title"
                          className="w-full border rounded p-2"
                          placeholder="Objective title (optional)"
                          defaultValue="Objective"
                        />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-24"
                          placeholder="What must players accomplish?"
                        />
                        <input
                          name="meta_json"
                          className="w-full border rounded p-2 font-mono text-[12px]"
                          placeholder={`Meta JSON (optional) e.g.\n{\n  "dc": 12,\n  "success": "…",\n  "fail": "…"\n}`}
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add Objective</button>
                      </form>
                    </div>
                  </details>

                  {/* Map */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Map <span className="text-xs font-normal text-gray-500">• players can see</span>
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
                        <input type="hidden" name="block_type" value="map" />
                        <input type="hidden" name="audience" value="players" />
                        <input type="hidden" name="mode" value="display" />
                        <input
                          name="title"
                          className="w-full border rounded p-2"
                          placeholder="Map title (optional)"
                          defaultValue="Map"
                        />
                        <input name="image_url" className="w-full border rounded p-2" placeholder="Image URL (optional)" />
                        <input name="image_file" type="file" accept="image/*" className="w-full border rounded p-2" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-20"
                          placeholder="Short map note (optional)"
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add Map</button>
                      </form>
                    </div>
                  </details>

                  {/* Narrative */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Narrative <span className="text-xs font-normal text-gray-500">• storyteller only (read to players)</span>
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
                        <input type="hidden" name="block_type" value="narrative" />
                        <input type="hidden" name="audience" value="storyteller" />
                        <input type="hidden" name="mode" value="read" />
                        <input
                          name="title"
                          className="w-full border rounded p-2"
                          placeholder="Narrative title (optional)"
                          defaultValue="Narrative"
                        />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-32"
                          placeholder="Write exactly what the storyteller will read aloud."
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add Narrative</button>
                      </form>
                    </div>
                  </details>

                  {/* Note */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Note <span className="text-xs font-normal text-gray-500">• storyteller awareness</span>
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
                        <input type="hidden" name="block_type" value="note" />
                        <input type="hidden" name="audience" value="storyteller" />
                        <input type="hidden" name="mode" value="display" />
                        <input name="title" className="w-full border rounded p-2" defaultValue="Note" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-24"
                          placeholder="Reminders, timing, hidden triggers, behind-the-screen info…"
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add Note</button>
                      </form>
                    </div>
                  </details>

                  {/* Hex Crawl (placeholder) */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Hex Crawl <span className="text-xs font-normal text-gray-500">• placeholder fields</span>
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
                        <input type="hidden" name="block_type" value="hex_crawl" />
                        <input type="hidden" name="audience" value="storyteller" />
                        <input type="hidden" name="mode" value="prompt" />
                        <input name="title" className="w-full border rounded p-2" placeholder="Hex title" defaultValue="Hex Crawl" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-24"
                          placeholder="Hex description / travel prompts / discovery notes…"
                        />
                        <textarea
                          name="meta_json"
                          className="w-full border rounded p-2 h-24 font-mono text-[12px]"
                          placeholder={`Meta JSON (placeholder)\n{\n  "hex_id": "A3",\n  "terrain": "forest",\n  "travel_dc": 12\n}`}
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add Hex Crawl</button>
                      </form>
                    </div>
                  </details>

                  {/* Encounter (placeholder) */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      Encounter <span className="text-xs font-normal text-gray-500">• placeholder (battle + loot + monsters)</span>
                    </summary>
                    <div className="p-3 border-t space-y-3">
                      <div className="text-sm text-gray-700">
                        Placeholder: later this becomes a structured encounter builder. For now it saves blocks.
                      </div>

                      {/* Encounter block */}
                      <form
                        className="space-y-2"
                        action={async (fd) => {
                          "use server";
                          await addEpisodeBlockAction(episode.id, fd);
                          redirect(`/admin/episodes/${episode.id}`);
                        }}
                      >
                        <input type="hidden" name="block_type" value="encounter" />
                        <input type="hidden" name="audience" value="both" />
                        <input type="hidden" name="mode" value="encounter" />
                        <input name="title" className="w-full border rounded p-2" defaultValue="Encounter" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-28"
                          placeholder="Encounter setup / win conditions / battlefield notes…"
                        />
                        <textarea
                          name="meta_json"
                          className="w-full border rounded p-2 h-24 font-mono text-[12px]"
                          placeholder={`Meta JSON (placeholder)\n{\n  "difficulty": "medium",\n  "waves": 1\n}`}
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add Encounter</button>
                      </form>

                      {/* Loot placeholder block */}
                      <form
                        className="space-y-2"
                        action={async (fd) => {
                          "use server";
                          await addEpisodeBlockAction(episode.id, fd);
                          redirect(`/admin/episodes/${episode.id}`);
                        }}
                      >
                        <input type="hidden" name="block_type" value="loot" />
                        <input type="hidden" name="audience" value="both" />
                        <input type="hidden" name="mode" value="display" />
                        <input name="title" className="w-full border rounded p-2" defaultValue="Loot (after encounter)" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-20"
                          placeholder="What can be won? (placeholder)"
                        />
                        <button className="px-3 py-2 rounded border">Add Loot Placeholder</button>
                      </form>

                      {/* Monsters placeholder block */}
                      <form
                        className="space-y-2"
                        action={async (fd) => {
                          "use server";
                          await addEpisodeBlockAction(episode.id, fd);
                          redirect(`/admin/episodes/${episode.id}`);
                        }}
                      >
                        <input type="hidden" name="block_type" value="monster" />
                        <input type="hidden" name="audience" value="storyteller" />
                        <input type="hidden" name="mode" value="display" />
                        <input name="title" className="w-full border rounded p-2" defaultValue="Monsters (placeholder)" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-20"
                          placeholder="List monsters / counts / notes (placeholder)"
                        />
                        <button className="px-3 py-2 rounded border">Add Monsters Placeholder</button>
                      </form>
                    </div>
                  </details>

                  {/* NPC (placeholder popup behavior) */}
                  <details className="rounded-lg border">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                      NPC <span className="text-xs font-normal text-gray-500">• placeholder “popup when important”</span>
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
                        <input type="hidden" name="block_type" value="npc" />
                        <input type="hidden" name="audience" value="both" />
                        <input type="hidden" name="mode" value="prompt" />
                        <input name="title" className="w-full border rounded p-2" placeholder="NPC name" defaultValue="NPC" />
                        <textarea
                          name="body"
                          className="w-full border rounded p-2 h-24"
                          placeholder="NPC dialogue / role / what matters…"
                        />
                        <textarea
                          name="meta_json"
                          className="w-full border rounded p-2 h-24 font-mono text-[12px]"
                          placeholder={`Meta JSON (placeholder)\n{\n  "popup": true,\n  "trigger": "when players ask about X"\n}`}
                        />
                        <button className="px-3 py-2 rounded bg-black text-white">Add NPC</button>
                      </form>
                    </div>
                  </details>
                  </div>
                </details>

                {/* Existing blocks under scene */}
                <div className="space-y-3">
                  {g.items.length === 0 ? (
                    <div className="text-sm text-gray-500 italic">No blocks under this scene yet.</div>
                  ) : null}

                  {g.items.map((b: any) => {
                    const idx = nonSceneIndexById.get(b.id) ?? 0;

                    return (
                      <div key={b.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-xs text-gray-600">
                            <span className="font-semibold">
                              Block {idx || "?"} of {nonSceneTotal}
                            </span>{" "}
                            <span className="text-gray-400">•</span>{" "}
                            <span className="font-mono">#{b.sort_order}</span>{" "}
                            <span className="text-gray-400">•</span>{" "}
                            <span className="font-semibold">{b.block_type}</span> • {b.audience} • {b.mode}
                          </div>

                          <div className="flex gap-2">
                            <form
                              action={async () => {
                                "use server";
                                await moveEpisodeBlockAction(b.id, episode.id, "up");
                                redirect(`/admin/episodes/${episode.id}`);
                              }}
                            >
                              <button className="px-2 py-1 border rounded">↑</button>
                            </form>

                            <form
                              action={async () => {
                                "use server";
                                await moveEpisodeBlockAction(b.id, episode.id, "down");
                                redirect(`/admin/episodes/${episode.id}`);
                              }}
                            >
                              <button className="px-2 py-1 border rounded">↓</button>
                            </form>

                            <form
                              action={async () => {
                                "use server";
                                await deleteEpisodeBlockAction(b.id, episode.id);
                                redirect(`/admin/episodes/${episode.id}`);
                              }}
                            >
                              <button className="px-2 py-1 border rounded text-red-600">Delete</button>
                            </form>
                          </div>
                        </div>

                        <form
                          className="mt-3 space-y-2"
                          encType="multipart/form-data"
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
                          <input name="image_file" type="file" accept="image/*" className="w-full border rounded p-2" />
                          {String(b.block_type).toLowerCase() === "map" && (b.image_url ?? "").trim() ? (
                            <MapMarkerEditorClient
                              imageUrl={b.image_url as string}
                              initialMeta={b.meta ?? {}}
                              revealCandidates={(blocks ?? [])
                                .filter((x: any) => x.id !== b.id && x.block_type !== "scene")
                                .map((x: any) => ({
                                  id: x.id,
                                  title: `${x.block_type}${x.title ? ` - ${x.title}` : ""}`,
                                }))}
                            />
                          ) : (
                            <textarea
                              name="meta_json"
                              className="w-full border rounded p-2 h-28 font-mono text-[12px]"
                              defaultValue={b.meta ? safeJsonStringify(b.meta) : ""}
                              placeholder="Meta JSON (optional)"
                            />
                          )}

                          <button className="px-3 py-2 rounded border">Save Block</button>
                        </form>

                        {b.image_url ? (
                          <div className="mt-3 rounded border overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={b.image_url} alt="Block" className="w-full h-auto" />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {!sceneGroups.length ? (
          <div className="text-sm text-gray-500 italic">
            No blocks yet. Add a <b>scene</b> first, then objective/narrative/note/encounter blocks under it.
          </div>
        ) : null}
      </div>
    </div>
  );
}
