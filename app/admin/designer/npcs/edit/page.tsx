import Link from "next/link";
import { notFound } from "next/navigation";
import { getNpcById } from "@/lib/designer/npcs";
import { updateNpcAction, archiveNpcAction } from "@/app/actions/npcs";
import NpcImageUploader from "@/components/designer/npcs/NpcImageUploader";
import StatBlockEditor from "@/components/designer/npcs/StatBlockEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

export default async function EditNpcByQueryPage({
  searchParams,
}: {
  // IMPORTANT: in some Next 16 setups, searchParams is a Promise
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const sp = await Promise.resolve(searchParams);
  const raw = sp?.id;
  const id = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();

  // Helpful debug instead of mystery 404 while you validate
  if (!id) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Missing id in querystring</h1>
        <p className="text-sm opacity-80">
          Expected /admin/designer/npcs/edit?id=&lt;uuid&gt;
        </p>
        <Link className="underline" href="/admin/designer/npcs">
          Back
        </Link>
      </div>
    );
  }

  if (id === "undefined" || !isUuid(id)) notFound();

  const npc = await getNpcById(id);

  if (!npc) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">NPC not found (or access denied)</h1>
        <pre className="mt-4 text-sm opacity-80">id={id}</pre>
        <Link className="underline" href="/admin/designer/npcs">
          Back
        </Link>
      </div>
    );
  }

  const npcId = npc.id;

  async function update(formData: FormData) {
    "use server";
    await updateNpcAction(npcId, formData);
  }

  async function archive() {
    "use server";
    await archiveNpcAction(npcId);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{npc.name}</h1>
          <p className="text-sm text-muted-foreground">Edit NPC details, image, and stats.</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/admin/designer/npcs" className="px-3 py-2 rounded-lg border hover:bg-muted/40">
            Back
          </Link>
          <form action={archive}>
            <button className="px-3 py-2 rounded-lg border hover:bg-muted/40" type="submit">
              Archive
            </button>
          </form>
        </div>
      </div>

      <div className="border rounded-xl p-4">
        <h2 className="font-semibold mb-3">Image</h2>
        <NpcImageUploader npc={npc} />
      </div>

      <form action={update} className="border rounded-xl p-4 space-y-4">
        <h2 className="font-semibold">Basics</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input name="name" defaultValue={npc.name} className="w-full border rounded-lg p-2" />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Default Role</label>
            <select
              name="default_role"
              className="w-full border rounded-lg p-2"
              defaultValue={npc.default_role}
            >
              <option value="enemy">enemy</option>
              <option value="ally">ally</option>
              <option value="neutral">neutral</option>
              <option value="guide">guide</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">Type</label>
            <select name="npc_type" className="w-full border rounded-lg p-2" defaultValue={npc.npc_type}>
              <option value="human">human</option>
              <option value="beast">beast</option>
              <option value="angel">angel</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Image Alt (optional)</label>
            <input name="image_alt" defaultValue={npc.image_alt ?? ""} className="w-full border rounded-lg p-2" />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <textarea
            name="description"
            defaultValue={npc.description ?? ""}
            className="w-full border rounded-lg p-2"
            rows={4}
          />
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">Stat Block</h2>
          <StatBlockEditor initial={npc.stat_block ?? {}} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Storyteller Notes</label>
          <textarea
            name="notes_storyteller"
            defaultValue={npc.notes_storyteller ?? ""}
            className="w-full border rounded-lg p-2"
            rows={4}
          />
        </div>

        <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">Save Changes</button>
      </form>

      <div className="border rounded-xl p-4 opacity-70">
        <h2 className="font-semibold">Traits & Actions</h2>
        <p className="text-sm text-muted-foreground">Next step: multi-select traits and actions.</p>
      </div>
    </div>
  );
}
