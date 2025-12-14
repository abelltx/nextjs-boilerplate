import Link from "next/link";
import { redirect } from "next/navigation";
import { createEpisodeAction } from "@/app/actions/episodesAdmin";
import { createClient } from "@/utils/supabase/server";

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

export default async function AdminEpisodeNewPage() {
  await requireAdminServer();

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-2xl font-bold">New Episode</div>
        <Link href="/admin/episodes" className="px-4 py-2 rounded border">
          Back
        </Link>
      </div>

      <form
        className="border rounded-xl p-4 space-y-3"
        action={async (fd) => {
          "use server";
          await createEpisodeAction(fd);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Title</div>
            <input name="title" className="w-full border rounded-lg p-2" required />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Episode Code</div>
            <input name="episode_code" className="w-full border rounded-lg p-2" placeholder="GEN-007" />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Default Duration (seconds)</div>
            <input name="default_duration_seconds" type="number" className="w-full border rounded-lg p-2" defaultValue={2700} />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Default Encounters</div>
            <input name="default_encounter_total" type="number" className="w-full border rounded-lg p-2" defaultValue={5} />
          </label>
        </div>

        <label className="space-y-1 block">
          <div className="text-xs uppercase text-gray-500">Story Text (fallback)</div>
          <textarea name="story_text" className="w-full border rounded-lg p-3 h-56 font-serif" />
        </label>

        <button className="px-4 py-2 rounded bg-black text-white">Create Episode</button>
      </form>
    </div>
  );
}
