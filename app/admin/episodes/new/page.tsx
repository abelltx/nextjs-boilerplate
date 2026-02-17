import Link from "next/link";
import { redirect } from "next/navigation";
import { createEpisodeAction } from "@/app/actions/episodesAdmin";
import { createClient } from "@/utils/supabase/server";

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

export default async function AdminEpisodeNewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminServer();

  const sp = (await Promise.resolve(searchParams ?? {})) as Record<
    string,
    string | string[] | undefined
  >;
  const one = (k: string, fallback = "") => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? fallback;
    return v ?? fallback;
  };

  const initialTitle = one("title", "");
  const initialCode = one("episode_code", "");
  const initialSummary = one("summary", "");
  const initialStory = one("story_text", "");
  const initialDurationMins = one("duration_mins", "45");
  const initialEncounters = one("encounters", "5");
  const errorCode = one("error", "");

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">New Episode</div>
        <Link href="/admin/episodes" className="px-4 py-2 rounded border">
          Back
        </Link>
      </div>

      <form
        className="border rounded-xl p-4 space-y-4"
        encType="multipart/form-data"
        action={async (fd) => {
          "use server";
          await createEpisodeAction(fd);
        }}
      >
        {errorCode === "duplicate_code" ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            Episode code already exists. Use a different code, or open the existing episode and edit it.
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Title</div>
            <input name="title" className="w-full border rounded-lg p-2" required defaultValue={initialTitle} />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Episode Code</div>
            <input
              name="episode_code"
              className="w-full border rounded-lg p-2"
              placeholder="GEN-007"
              defaultValue={initialCode}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Default Duration (minutes)</div>
            <input
              name="default_duration_minutes"
              type="number"
              className="w-full border rounded-lg p-2"
              defaultValue={initialDurationMins}
              min={0}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Default Encounters</div>
            <input
              name="default_encounter_total"
              type="number"
              className="w-full border rounded-lg p-2"
              defaultValue={initialEncounters}
              min={0}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Summary</div>
            <textarea name="summary" className="w-full border rounded-lg p-2 h-20" defaultValue={initialSummary} />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Tags (comma-separated)</div>
            <input name="tags" className="w-full border rounded-lg p-2" placeholder="genesis, jacob, bethel" />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Map Image File</div>
            <input name="map_file" type="file" accept="image/*" className="w-full border rounded-lg p-2" />
            <div className="text-[11px] text-gray-500">Upload from your PC, or paste a URL below.</div>
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">NPC Image File</div>
            <input name="npc_file" type="file" accept="image/*" className="w-full border rounded-lg p-2" />
            <div className="text-[11px] text-gray-500">Upload from your PC, or paste a URL below.</div>
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Map Image URL (optional)</div>
            <input name="map_image_url" className="w-full border rounded-lg p-2" placeholder="https://..." />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">NPC Image URL (optional)</div>
            <input name="npc_image_url" className="w-full border rounded-lg p-2" placeholder="https://..." />
          </label>
        </div>

        <label className="space-y-1 block">
          <div className="text-xs uppercase text-gray-500">Story Text (fallback)</div>
          <textarea name="story_text" className="w-full border rounded-lg p-3 h-56 font-serif" defaultValue={initialStory} />
        </label>

        <button className="px-4 py-2 rounded bg-black text-white">Create Episode</button>
      </form>

      <div className="text-xs text-gray-600">
        Next: scenes / storyteller notes / player-read text will live in <b>episode blocks</b>.
      </div>
    </div>
  );
}
