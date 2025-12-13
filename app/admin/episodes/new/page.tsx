import Link from "next/link";
import { createEpisodeAction } from "@/app/actions/episodesAdmin";

export default function NewEpisodePage() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xl font-bold">New Episode</div>
          <div className="text-sm text-gray-600">Create episode defaults for storyteller loading.</div>
        </div>
        <Link href="/admin/episodes" className="px-4 py-2 rounded border">
          Back
        </Link>
      </div>

      <form action={createEpisodeAction} className="border rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Title</div>
            <input name="title" className="w-full border rounded-lg p-2" required />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Episode Code</div>
            <input name="episode_code" className="w-full border rounded-lg p-2" placeholder="GEN-004" />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Default Duration (seconds)</div>
            <input
              name="default_duration_seconds"
              type="number"
              className="w-full border rounded-lg p-2"
              defaultValue={2700}
              min={0}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Default Encounters</div>
            <input
              name="default_encounter_total"
              type="number"
              className="w-full border rounded-lg p-2"
              defaultValue={5}
              min={0}
            />
          </label>
        </div>

        <label className="space-y-1 block">
          <div className="text-xs uppercase text-gray-500">Story Text</div>
          <textarea name="story_text" className="w-full border rounded-lg p-3 h-64 font-serif" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Summary</div>
            <textarea name="summary" className="w-full border rounded-lg p-2 h-20" />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Tags (comma-separated)</div>
            <input name="tags" className="w-full border rounded-lg p-2" placeholder="genesis, youth, 3-scenes" />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">Map Image URL</div>
            <input name="map_image_url" className="w-full border rounded-lg p-2" />
          </label>

          <label className="space-y-1">
            <div className="text-xs uppercase text-gray-500">NPC Image URL</div>
            <input name="npc_image_url" className="w-full border rounded-lg p-2" />
          </label>
        </div>

        <button className="px-4 py-2 rounded bg-black text-white">Create Episode</button>
      </form>
    </div>
  );
}
