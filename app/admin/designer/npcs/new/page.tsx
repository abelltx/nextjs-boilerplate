import Link from "next/link";
import { redirect } from "next/navigation";
import { createNpcAction } from "@/app/actions/npcs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function NewNpcPage() {
  async function create(formData: FormData) {
    "use server";
    const id = await createNpcAction(formData);
    redirect(`/admin/designer/npcs/edit?id=${id}`);
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Create NPC</h1>
          <p className="text-sm text-muted-foreground">
            After you create it, you’ll add image + stat block on the next screen.
          </p>
        </div>

        <Link
          href="/admin/designer/npcs"
          className="px-3 py-2 rounded-lg border hover:bg-muted/40"
        >
          Back
        </Link>
      </div>

      <form action={create} className="border rounded-xl p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <input
            name="name"
            required
            className="w-full border rounded-lg p-2"
            placeholder="e.g., Boy 4"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Type</label>
            <select name="npc_type" className="w-full border rounded-lg p-2" defaultValue="human">
              <option value="human">human</option>
              <option value="beast">beast</option>
              <option value="angel">angel</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Default Role</label>
            <select
              name="default_role"
              className="w-full border rounded-lg p-2"
              defaultValue="neutral"
            >
              <option value="enemy">enemy</option>
              <option value="ally">ally</option>
              <option value="neutral">neutral</option>
              <option value="guide">guide</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Description (optional)</label>
          <textarea
            name="description"
            className="w-full border rounded-lg p-2"
            rows={4}
            placeholder="Short description for storytellers/players."
          />
        </div>

        <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">
          Create NPC
        </button>
      </form>
    </div>
  );
}
