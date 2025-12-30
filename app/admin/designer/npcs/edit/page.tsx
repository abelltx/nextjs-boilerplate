import Link from "next/link";
import { notFound } from "next/navigation";
import { getNpcById } from "@/lib/designer/npcs";
import { updateNpcAction, archiveNpcAction } from "@/app/actions/npcs";
import NpcImageUploader from "@/components/designer/npcs/NpcImageUploader";
import StatBlockEditor from "@/components/designer/npcs/StatBlockEditor";
import DeleteNpcButton from "@/components/designer/npcs/DeleteNpcButton";
import { deleteNpcAction } from "@/app/actions/npcs";
import SaveBar from "@/components/ui/SaveBar";
import { listTraits, getNpcTraitIds, getNpcPassives } from "@/lib/designer/traits";
import { listActions, getNpcActionIds, getNpcEffectiveActions } from "@/lib/designer/actions";
import NpcTraitActionPicker from "@/components/designer/npcs/NpcTraitActionPicker";


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

// Safe defaults so the page still renders if something fails
let allTraits: any[] = [];
let allActions: any[] = [];
let selectedTraitIds: string[] = [];
let selectedActionIds: string[] = [];
let passives: any[] = [];
let effectiveActions: any[] = [];

try {
  [
    allTraits,
    allActions,
    selectedTraitIds,
    selectedActionIds,
    passives,
    effectiveActions,
  ] = await Promise.all([
    listTraits({ includeArchived: false }),
    listActions({ includeArchived: false }),
    getNpcTraitIds(npcId),
    getNpcActionIds(npcId),
    getNpcPassives(npcId),
    getNpcEffectiveActions(npcId),
  ]);
} catch (err) {
  console.error("Failed to load traits/actions for NPC", err);
}


    async function del() {
  "use server";
  await deleteNpcAction(npcId);
    }

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
         <DeleteNpcButton npcName={npc.name} onDelete={del} />
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

        <SaveBar />
      </form>

<div className="border rounded-xl p-4 space-y-6">
  <div>
    <h2 className="font-semibold">Traits & Actions</h2>
    <p className="text-sm text-muted-foreground">
      Choose from the library. “Effective” results come from your views.
    </p>
  </div>
  
{(!allTraits.length && !allActions.length) ? (
  <div className="text-sm text-muted-foreground">
    Traits/actions library not loaded (check RLS policies or view permissions).
  </div>
) : null}

  <NpcTraitActionPicker
    npcId={npcId}
    allTraits={allTraits}
    allActions={allActions}
    selectedTraitIds={selectedTraitIds}
    selectedActionIds={selectedActionIds}
  />

  <div className="grid gap-4 md:grid-cols-2">
    {/* Effective Passives */}
    <div className="border rounded-lg p-3">
      <div className="font-medium mb-2">Effective Passives</div>

      {passives.length ? (
        <div className="space-y-2">
          {passives.map((p: any) => (
            <div key={p.trait_id} className="border rounded-lg p-2">
              <div className="font-medium text-sm">{p.trait_name}</div>

              {Array.isArray(p.passives) ? (
                p.passives.length ? (
                  <ul className="mt-1 text-xs text-muted-foreground list-disc pl-5 space-y-1">
                    {p.passives.map((item: any, idx: number) => (
                      <li key={idx}>
                        {typeof item === "string" ? item : JSON.stringify(item)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">No passives</div>
                )
              ) : p.passives && typeof p.passives === "object" ? (
                <details className="mt-2 opacity-70">
                  <summary className="cursor-pointer text-xs">Details</summary>
                  <pre className="mt-2 text-[11px] border rounded-lg p-2 overflow-auto">
{JSON.stringify(p.passives, null, 2)}
                  </pre>
                </details>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">No passives</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">None</div>
      )}
    </div>

    {/* Effective Actions */}
    <div className="border rounded-lg p-3">
      <div className="font-medium mb-2">Effective Actions</div>

      {effectiveActions.length ? (
        <div className="space-y-2">
          {effectiveActions.map((a: any) => (
            <div key={a.action_id} className="border rounded-lg p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-sm">{a.name}</div>
                <div className="text-xs text-muted-foreground">
                  {String(a.activation ?? "").replaceAll("_", " ")}
                </div>
              </div>

              {a.description ? (
                <div className="text-xs text-muted-foreground mt-1">{a.description}</div>
              ) : null}

              {Array.isArray(a.tags) && a.tags.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {a.tags.slice(0, 6).map((t: string) => (
                    <span key={t} className="text-[10px] px-2 py-0.5 rounded-full border opacity-80">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}

              <details className="mt-2 opacity-70">
                <summary className="cursor-pointer text-xs">Details</summary>
                <pre className="mt-2 text-[11px] border rounded-lg p-2 overflow-auto">
{JSON.stringify({ requirements: a.requirements, effect: a.effect }, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">None</div>
      )}
    </div>
  </div>
</div>


    </div>
  );
}
