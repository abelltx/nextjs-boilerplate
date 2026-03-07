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
import NpcTabsEditorClient from "@/app/admin/episodes/[id]/NpcTabsEditorClient";
import { createClient } from "@/utils/supabase/server";
import { saveNpcRuntimeConfigAction } from "@/app/actions/npcRuntime";


export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

function toQuestId(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function extractQuestOptionsFromMeta(meta: any, npcName: string) {
  const out: Array<{ questId: string; title: string; npcName: string }> = [];
  const defs = meta?.npc_tabs?.quests?.quest_defs;
  if (!Array.isArray(defs)) return out;
  for (let i = 0; i < defs.length; i += 1) {
    const q = defs[i] ?? {};
    const title = String(q?.title ?? "").trim() || `Quest ${i + 1}`;
    const questId = toQuestId(q?.id) || toQuestId(title) || `quest_${i + 1}`;
    if (!questId) continue;
    out.push({ questId, title, npcName });
  }
  return out;
}

export default async function EditNpcByQueryPage({
  searchParams,
}: {
  // IMPORTANT: in some Next 16 setups, searchParams is a Promise
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const sp = await Promise.resolve(searchParams);
  const raw = sp?.id;
  const id = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  const returnToRaw = sp?.return_to;
  const returnTo = (Array.isArray(returnToRaw) ? returnToRaw[0] : returnToRaw ?? "").trim();
  const episodeScopeRaw = sp?.episode_scope;
  const episodeScopeId = (Array.isArray(episodeScopeRaw) ? episodeScopeRaw[0] : episodeScopeRaw ?? "").trim();

  // Helpful debug instead of mystery 404 while you validate
  if (!id) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Missing id in querystring</h1>
        <p className="text-sm opacity-80">
          Expected /admin/designer/npcs/edit?id=&lt;uuid&gt;
        </p>
        <Link className="underline" href="/admin/designer/">
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
        <Link className="underline" href="/admin/designer/">
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
let itemOptions: any[] = [];
let runtimeMeta: any = { npc_tabs: {} };
let runtimeMetaRaw: any = {};
let episodeOptions: Array<{ id: string; title: string; episode_code?: string | null }> = [];
let scopedRuntimeMeta: any = { npc_tabs: {} };
let episodeQuestOptions: Array<{ questId: string; title: string; npcName?: string | null }> = [];

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
  const supabase = await createClient();
  const [{ data: items }, { data: runtime }, { data: episodes }] = await Promise.all([
    supabase.from("items").select("id,name,faith_required,is_active").eq("is_active", true).order("name", { ascending: true }),
    supabase.from("npc_runtime_configs").select("meta_json").eq("npc_id", npcId).maybeSingle(),
    supabase.from("episodes").select("id,title,episode_code").order("created_at", { ascending: false }).limit(200),
  ]);
  itemOptions = items ?? [];
  runtimeMetaRaw = (runtime as any)?.meta_json ?? {};
  runtimeMeta = runtimeMetaRaw;
  episodeOptions = (episodes ?? []) as any[];
  const scopedTabs =
    episodeScopeId &&
    runtimeMetaRaw?.npc_tabs_by_episode &&
    typeof runtimeMetaRaw.npc_tabs_by_episode === "object"
      ? runtimeMetaRaw.npc_tabs_by_episode[episodeScopeId]
      : null;
  scopedRuntimeMeta = {
    npc_tabs:
      scopedTabs && typeof scopedTabs === "object"
        ? scopedTabs
        : runtimeMetaRaw?.npc_tabs && typeof runtimeMetaRaw.npc_tabs === "object"
          ? runtimeMetaRaw.npc_tabs
          : {},
  };
  if (episodeScopeId && /^[0-9a-f-]{36}$/i.test(episodeScopeId)) {
    const [{ data: bindings }, { data: npcs }, { data: episodeNpcBlocks }] = await Promise.all([
      supabase
        .from("episode_npc_bindings")
        .select("npc_id")
        .eq("episode_id", episodeScopeId),
      supabase
        .from("npcs")
        .select("id,name")
        .eq("is_archived", false),
      supabase
        .from("episode_blocks")
        .select("id,title,meta,block_type")
        .eq("episode_id", episodeScopeId)
        .eq("block_type", "npc"),
    ]);
    const npcNameById = new Map<string, string>();
    for (const n of npcs ?? []) {
      const id = String((n as any)?.id ?? "").trim();
      if (!id) continue;
      npcNameById.set(id, String((n as any)?.name ?? "").trim() || "NPC");
    }
    const boundNpcIds = Array.from(
      new Set((bindings ?? []).map((r: any) => String(r?.npc_id ?? "").trim()).filter(Boolean))
    );
    if (boundNpcIds.length > 0) {
      const { data: cfgRows } = await supabase
        .from("npc_runtime_configs")
        .select("npc_id,meta_json")
        .in("npc_id", boundNpcIds);
      const rows = Array.isArray(cfgRows) ? cfgRows : [];
      const collected: Array<{ questId: string; title: string; npcName?: string | null }> = [];
      for (const row of rows as any[]) {
        const npcId = String(row?.npc_id ?? "").trim();
        if (!npcId) continue;
        const npcName = npcNameById.get(npcId) ?? "NPC";
        const rawMeta = (row?.meta_json ?? {}) as any;
        const scopedMeta =
          rawMeta?.npc_tabs_by_episode &&
          typeof rawMeta.npc_tabs_by_episode === "object" &&
          rawMeta.npc_tabs_by_episode[episodeScopeId]
            ? { npc_tabs: rawMeta.npc_tabs_by_episode[episodeScopeId] }
            : rawMeta;
        collected.push(...extractQuestOptionsFromMeta(scopedMeta, npcName));
      }
      episodeQuestOptions = Array.from(new Map(collected.map((q) => [q.questId, q] as const)).values());
    }

    // Legacy fallback: quests authored directly on episode NPC blocks meta
    const legacyCollected: Array<{ questId: string; title: string; npcName?: string | null }> = [];
    for (const b of episodeNpcBlocks ?? []) {
      const row: any = b ?? {};
      const meta = row?.meta ?? {};
      const npcName =
        String(meta?.npc_library?.name ?? "").trim() ||
        String(row?.title ?? "").trim() ||
        "NPC";
      legacyCollected.push(...extractQuestOptionsFromMeta(meta, npcName));
    }
    if (legacyCollected.length) {
      episodeQuestOptions = Array.from(
        new Map([...episodeQuestOptions, ...legacyCollected].map((q) => [q.questId, q] as const)).values()
      );
    }
  }
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
  async function saveRuntime(formData: FormData) {
    "use server";
    await saveNpcRuntimeConfigAction(npcId, formData);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{npc.name}</h1>
          <p className="text-sm text-muted-foreground">Edit NPC details, image, and stats.</p>
        </div>

        <div className="flex items-center gap-2">
          {returnTo ? (
            <Link href={returnTo} className="px-3 py-2 rounded-lg border hover:bg-muted/40">
              Back to Episode
            </Link>
          ) : null}
          <Link href="/admin/designer/" className="px-3 py-2 rounded-lg border hover:bg-muted/40">
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
      Choose from the library. Effective results come from your views.
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

<div className="border rounded-xl p-4 space-y-4">
  <div>
    <h2 className="font-semibold">Player Runtime (Tabs, Quests, Gear, Training)</h2>
    <p className="text-sm text-muted-foreground">
      Configure global runtime, or scope settings to one episode.
    </p>
  </div>
  <form method="get" className="rounded-lg border p-3 space-y-2">
    <input type="hidden" name="id" value={npcId} />
    {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
    <label className="text-xs uppercase text-muted-foreground">Episode Scope</label>
    <select
      name="episode_scope"
      defaultValue={episodeScopeId}
      className="w-full border rounded-lg p-2 text-sm"
    >
      <option value="">Global (all episodes)</option>
      {episodeOptions.map((ep) => (
        <option key={ep.id} value={ep.id}>
          {ep.title}
          {ep.episode_code ? ` (${ep.episode_code})` : ""}
        </option>
      ))}
    </select>
    <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted/40" type="submit">
      Load Scope
    </button>
  </form>
  <form action={saveRuntime} className="space-y-3">
    <input type="hidden" name="episode_scope_id" value={episodeScopeId} />
    <NpcTabsEditorClient
      initialMeta={scopedRuntimeMeta}
      fallbackInfo={npc.description ?? ""}
      itemOptions={itemOptions}
      traitOptions={allTraits.map((t: any) => ({ id: t.id, name: t.name, is_active: !t.is_archived }))}
      actionOptions={allActions.map((a: any) => ({ id: a.id, name: a.name, is_active: !a.is_archived }))}
      episodeQuestOptions={episodeQuestOptions}
      showLibraryLink={false}
      showAdvancedMeta={false}
    />
    <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted/40" type="submit">
      Save Runtime Config
    </button>
  </form>
</div>


    </div>
  );
}

