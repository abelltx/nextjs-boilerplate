import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { updateEpisodeAction, deleteEpisodeAction } from "@/app/actions/episodesAdmin";

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
  // Next sometimes passes params as a Promise in App Router. This handles both safely.
  const resolvedParams = await Promise.resolve(params);
  const rawId = resolvedParams?.id;

  // HARD GUARD: never let undefined/invalid ids hit Supabase
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

  const tagsString = (episode.tags ?? []).join(", ");
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
            <button className="px-4 py-2 rounded border text-red-600">
              Delete
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* EDIT FORM */}
        <form
          className="col-span-7 border rounded-xl p-4 space-y-4"
          action={async (fd) => {
            "use server";
            await updateEpisodeAction(episode.id, fd);
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
              <div className="text-xs uppercase text-gray-500">
                Default Duration (seconds)
              </div>
              <input
                name="default_duration_seconds"
                type="number"
                className="w-full border rounded-lg p-2"
                defaultValue={episode.default_duration_seconds ?? 2700}
                min={0}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">
                Default Encounters
              </div>
              <input
                name="default_encounter_total"
                type="number"
                className="w-full border rounded-lg p-2"
                defaultValue={episode.default_encounter_total ?? 5}
                min={0}
              />
            </label>
          </div>

          <label className="space-y-1 block">
            <div className="text-xs uppercase text-gray-500">
              Story Text (fallback)
            </div>
            <textarea
              name="story_text"
              className="w-full border rounded-lg p-3 h-56 font-serif"
              defaultValue={episode.story_text ?? ""}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">Summary</div>
              <textarea
                name="summary"
                className="w-full border rounded-lg p-2 h-20"
                defaultValue={episode.summary ?? ""}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">
                Tags (comma-separated)
              </div>
              <input
                name="tags"
                className="w-full border rounded-lg p-2"
                defaultValue={tagsString}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">
                Map Image URL
              </div>
              <input
                name="map_image_url"
                className="w-full border rounded-lg p-2"
                defaultValue={episode.map_image_url ?? ""}
              />
            </label>

            <label className="space-y-1">
              <div className="text-xs uppercase text-gray-500">
                NPC Image URL
              </div>
              <input
                name="npc_image_url"
                className="w-full border rounded-lg p-2"
                defaultValue={episode.npc_image_url ?? ""}
              />
            </label>
          </div>

          <button className="px-4 py-2 rounded bg-black text-white">
            Save Changes
          </button>
        </form>

        {/* PREVIEW */}
        <div className="col-span-5 border rounded-xl p-4 space-y-3">
          <div className="text-xs uppercase text-gray-500">Preview</div>

          <div className="rounded-lg border p-3">
            <div className="text-sm font-semibold">{episode.title}</div>
            <div className="text-xs text-gray-600">
              {episode.episode_code ?? "No code"} • {mins} min •{" "}
              {episode.default_encounter_total ?? 0} encounters
            </div>
            {episode.tags?.length ? (
              <div className="mt-2 text-xs text-gray-600">
                Tags: {episode.tags.join(", ")}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border p-3 whitespace-pre-wrap text-sm leading-relaxed max-h-[420px] overflow-auto">
            {episode.story_text ?? ""}
          </div>

          {episode.map_image_url && (
            <div className="rounded-lg border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={episode.map_image_url}
                alt="Map"
                className="w-full h-auto"
              />
            </div>
          )}

          {episode.npc_image_url && (
            <div className="rounded-lg border overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={episode.npc_image_url}
                alt="NPC"
                className="w-full h-auto"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
