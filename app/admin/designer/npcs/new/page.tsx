import { redirect } from "next/navigation";
import { createNpcAction } from "@/app/actions/npcs";

export default function NewNpcPage() {
  async function action(formData: FormData) {
    "use server";
    const id = await createNpcAction(formData);
    redirect(`/admin/designer/npcs/edit?id=${id}`);

  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">New NPC</h1>
        <p className="text-sm text-muted-foreground">Create the NPC shell, then add image, traits, and actions.</p>
      </div>

      <form action={action} className="space-y-4 border rounded-xl p-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Name</label>
          <input name="name" required className="w-full border rounded-lg p-2" placeholder="Temple Guard" />
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
            <select name="default_role" className="w-full border rounded-lg p-2" defaultValue="neutral">
              <option value="enemy">enemy</option>
              <option value="ally">ally</option>
              <option value="neutral">neutral</option>
              <option value="guide">guide</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <textarea name="description" className="w-full border rounded-lg p-2" rows={4} />
        </div>

        <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">
          Create NPC
        </button>
      </form>
    </div>
  );
}
