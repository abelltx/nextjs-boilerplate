import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { deleteEpisodeAction } from "@/app/actions/episodesAdmin";

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

export default async function AdminEpisodesListPage() {
  const supabase = await requireAdminServer();

  const { data: episodes, error } = await supabase
    .from("episodes")
    .select("id,title,episode_code,default_duration_seconds,default_encounter_total,created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold">Episodes</div>
          <div className="text-sm text-gray-600">Admin management</div>
        </div>

        <Link href="/admin/episodes/new" className="px-4 py-2 rounded bg-black text-white">
          + New Episode
        </Link>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase text-gray-500 bg-gray-50">
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Code</div>
          <div className="col-span-2">Duration</div>
          <div className="col-span-1">Enc</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {(episodes ?? []).map((e) => (
          <div key={e.id} className="grid grid-cols-12 gap-2 px-4 py-3 border-t items-center">
            <div className="col-span-5 font-semibold">
              <Link className="underline" href={`/admin/episodes/${e.id}`}>
                {e.title}
              </Link>
            </div>
            <div className="col-span-2 font-mono text-sm">{e.episode_code ?? "—"}</div>
            <div className="col-span-2 text-sm">{Math.round((e.default_duration_seconds ?? 0) / 60)} min</div>
            <div className="col-span-1 text-sm">{e.default_encounter_total ?? 0}</div>
            <div className="col-span-2 flex justify-end gap-2">
              <Link href={`/admin/episodes/${e.id}`} className="px-3 py-2 rounded border text-sm">
                Edit
              </Link>
              <form action={async () => { "use server"; await deleteEpisodeAction(e.id); }}>
                <button className="px-3 py-2 rounded border text-sm">Delete</button>
              </form>
            </div>
          </div>
        ))}

        {(!episodes || episodes.length === 0) && (
          <div className="p-4 text-sm text-gray-600">No episodes yet. Click “New Episode”.</div>
        )}
      </div>
    </div>
  );
}
