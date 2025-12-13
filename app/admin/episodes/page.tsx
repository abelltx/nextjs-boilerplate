import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { deleteEpisodeAction } from "@/app/actions/episodesAdmin";
import { redirect } from "next/navigation";

async function requireAdminServer() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", authData.user.id)
    .single();

  if (!profile?.is_admin) redirect("/storyteller/sessions");
  return supabase;
}

export default async function EpisodesAdminPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const supabase = await requireAdminServer();
  const q = (searchParams?.q ?? "").trim();

  let query = supabase
    .from("episodes")
    .select("id,title,episode_code,default_duration_seconds,default_encounter_total,created_at,tags")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`title.ilike.%${q}%,episode_code.ilike.%${q}%`);
  }

  const { data: episodes, error } = await query;
  if (error) throw new Error(error.message);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold">Episodes</div>
          <div className="text-sm text-gray-600">Admin library (create, edit, delete)</div>
        </div>
        <Link className="px-4 py-2 rounded bg-black text-white" href="/admin/episodes/new">
          New Episode
        </Link>
      </div>

      <form className="flex gap-2" action="/admin/episodes" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title or code…"
          className="flex-1 border rounded-lg p-2"
        />
        <button className="px-4 py-2 rounded border">Search</button>
      </form>

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 bg-gray-50 p-3 text-xs uppercase text-gray-600">
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Code</div>
          <div className="col-span-2">Defaults</div>
          <div className="col-span-2">Tags</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {(episodes ?? []).map((e) => (
          <div key={e.id} className="grid grid-cols-12 p-3 border-t items-center">
            <div className="col-span-5">
              <Link className="font-semibold hover:underline" href={`/admin/episodes/${e.id}`}>
                {e.title}
              </Link>
              <div className="text-xs text-gray-500">{new Date(e.created_at).toLocaleString()}</div>
            </div>
            <div className="col-span-2 font-mono text-sm">{e.episode_code ?? "—"}</div>
            <div className="col-span-2 text-sm text-gray-700">
              {Math.round((e.default_duration_seconds ?? 0) / 60)}m / {e.default_encounter_total ?? 0} enc
            </div>
            <div className="col-span-2 text-xs text-gray-600">
              {(e.tags ?? []).slice(0, 3).join(", ")}
              {(e.tags?.length ?? 0) > 3 ? "…" : ""}
            </div>
            <div className="col-span-1 flex justify-end">
              <form
                action={async () => {
                  "use server";
                  await deleteEpisodeAction(e.id);
                }}
              >
                <button className="text-sm px-3 py-1 rounded border hover:bg-gray-50">
                  Delete
                </button>
              </form>
            </div>
          </div>
        ))}

        {episodes.length === 0 ? (
          <div className="p-6 text-gray-600">No episodes found.</div>
        ) : null}
      </div>
    </div>
  );
}
