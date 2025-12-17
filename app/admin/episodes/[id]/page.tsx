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

      <div className="grid grid-cols-12 gap-4">
        {/* EDIT FORM */}
        <form
          className="col-span-8 border rounded-xl p-4 space-y-4"
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

        {/* SMALL INFO BOX (no player preview here anymore) */}
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
        </div>
      </div>

      {/* STORYBOARD */}
      <div className="border rounded-xl p-4 space-y-3">
        <div>
          <div className="text-lg font-semibold">Storyboard</div>
          <div className="text-xs text-gray-600">
            Add <b>scene</b> blocks to create headers. Everything after a scene belongs to it until the next scene.
          </div>
        </div>

        {/* Add Block */}
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
                <option value="npc">npc</option>
                <option value="loot">loot</option>
                <option value="attire">attire</option>
                <option value="narrative">narrative</option>
                <option value="note">note</option>
                <option value="encounter">encounter</option>
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

          <input
            name="title"
            placeholder="Block title (optional)"
            className="w-full border rounded p-2"
          />
          <textarea
            name="body"
            placeholder="Body text (optional)"
            className="w-full border rounded p-2 h-24"
          />
          <input
            name="image_url"
            placeholder="Image URL (optional)"
            className="w-full border rounded p-2"
          />
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
              <div className="p-3 border-b bg-gray-50 rounded-t-xl">
                <div className="text-xs uppercase text-gray-500">Scene</div>
                <div className="font-semibold">
                  {g.scene?.title?.trim() ? g.scene.title : "(Untitled Scene)"}
                </div>
                {g.scene?.body ? (
                  <div className="text-sm text-gray-700 mt-1 whitespace-pre-wrap">
                    {g.scene.body}
                  </div>
                ) : null}

                {g.scene ? (
                  <details className="mt-2">
                    <summary className="text-xs cursor-pointer text-gray-600">Edit scene header</summary>

                    <form
                      className="mt-2 space-y-2"
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

                      <textarea
                        name="meta_json"
                        className="w-full border rounded p-2 h-28 font-mono text-[12px]"
                        defaultValue={g.scene.meta ? JSON.stringify(g.scene.meta, null, 2) : ""}
                        placeholder="Meta JSON (optional)"
                      />

                      <div className="flex gap-2">
                        <button className="px-3 py-2 rounded border">Save Scene</button>

                        <form
                          action={async () => {
                            "use server";
                            await deleteEpisodeBlockAction(g.scene.id, episode.id);
                            redirect(`/admin/episodes/${episode.id}`);
                          }}
                        >
                          <button className="px-3 py-2 rounded border text-red-600">Delete Scene</button>
                        </form>
                      </div>
                    </form>
                  </details>
                ) : null}
              </div>

              {/* Scene Blocks */}
              <div className="p-3 space-y-3">
                {g.items.length === 0 ? (
                  <div className="text-sm text-gray-500 italic">No blocks under this scene yet.</div>
                ) : null}

                {g.items.map((b: any) => (
                  <div key={b.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-gray-600">
                        <span className="font-mono">#{b.sort_order}</span> •{" "}
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
                        defaultValue={b.meta ? JSON.stringify(b.meta, null, 2) : ""}
                        placeholder="Meta JSON (optional)"
                      />

                      <button className="px-3 py-2 rounded border">Save Block</button>
                    </form>

                    {b.image_url ? (
                      <div className="mt-3 rounded border overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.image_url} alt="Block" className="w-full h-auto" />
                      </div>
                    ) : null}
                  </div>
                ))}
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
