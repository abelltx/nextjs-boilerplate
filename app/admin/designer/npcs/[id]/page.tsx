import Link from "next/link";
import { getNpcById } from "@/lib/designer/npcs";
import { updateNpcAction, archiveNpcAction } from "@/app/actions/npcs";
import NpcImageUploader from "@/components/designer/npcs/NpcImageUploader";
import StatBlockEditor from "@/components/designer/npcs/StatBlockEditor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuidLoose(v: string) {
  // Accept any canonical UUID (v1–v8, etc). We just need "looks like a uuid".
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function normalizeId(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return null;
}

function ErrorPanel({
  title,
  message,
  details,
}: {
  title: string;
  message: string;
  details?: any;
}) {
  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      {details ? (
        <pre className="text-xs border rounded-lg p-3 overflow-auto bg-muted/30">
          {JSON.stringify(details, null, 2)}
        </pre>
      ) : null}

      <Link className="underline text-sm" href="/admin/designer/npcs">
        ← Back to NPCs
      </Link>
    </div>
  );
}

export default async function EditNpcPage({ params }: { params: any }) {
  const id = normalizeId(params?.id);

  // Show what params actually are if this fails again
  if (!id || id === "undefined" || !isUuidLoose(id)) {
    return (
      <ErrorPanel
        title="Invalid NPC id"
        message="This NPC link is invalid."
        details={{ params, normalizedId: id }}
      />
    );
  }

  let npc: any = null;
  try {
    npc = await getNpcById(id);
  } catch (e: any) {
    return <ErrorPanel title="Failed to load NPC" message={e?.message ?? "Unknown error"} />;
  }

  if (!npc) {
    return <ErrorPanel title="NPC not found" message="This NPC does not exist (or is not accessible)." />;
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
            <select name="default_role" className="w-full border rounded-lg p-2" defaultValue={npc.default_role}>
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

        <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">
          Save Changes
        </button>
      </form>

      <div className="border rounded-xl p-4 opacity-70">
        <h2 className="font-semibold">Traits & Actions</h2>
        <p className="text-sm text-muted-foreground">Next step: multi-select traits and actions.</p>
      </div>
    </div>
  );
}
