# ==============================
# Neweyes NPC Designer Scaffolder (PS-compatible)
# ==============================

$ErrorActionPreference = "Stop"

function Ensure-Dir($path) {
  if (!(Test-Path $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

function Write-File($path, $content) {
  $dir = Split-Path $path
  Ensure-Dir $dir

  if (Test-Path $path) {
    Write-Host "SKIP (exists): $path" -ForegroundColor Yellow
  } else {
    # Works across older PowerShell versions
    $content | Out-File -LiteralPath $path -Encoding utf8 -Force
    Write-Host "CREATE: $path" -ForegroundColor Green
  }
}

# --- Basic checks ---
if (!(Test-Path "package.json")) {
  throw "Run this from the repo root (package.json not found)."
}

# --- Paths ---
$paths = @(
  "app/admin/designer",
  "app/admin/designer/npcs",
  "app/admin/designer/npcs/new",
  "app/admin/designer/npcs/[id]",
  "app/actions",
  "lib/designer",
  "components/designer/npcs"
)

foreach ($p in $paths) { Ensure-Dir $p }

# =========================
# 1) Designer Pages
# =========================

Write-File "app/admin/designer/page.tsx" @'
import Link from "next/link";

export default function DesignerHomePage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Game Designer</h1>
        <p className="text-sm text-muted-foreground">
          Manage NPCs, Special Traits, and Actions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/admin/designer/npcs" className="border rounded-xl p-4 hover:bg-muted/40">
          <div className="font-semibold">NPCs</div>
          <div className="text-sm text-muted-foreground">Create and manage NPC cards</div>
        </Link>

        <div className="border rounded-xl p-4 opacity-60">
          <div className="font-semibold">Special Traits</div>
          <div className="text-sm text-muted-foreground">Coming next</div>
        </div>

        <div className="border rounded-xl p-4 opacity-60">
          <div className="font-semibold">Actions</div>
          <div className="text-sm text-muted-foreground">Coming next</div>
        </div>
      </div>
    </div>
  );
}
'@

Write-File "app/admin/designer/npcs/page.tsx" @'
import Link from "next/link";
import { listNpcs } from "@/lib/designer/npcs";

export default async function NpcsListPage() {
  const npcs = await listNpcs();

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">NPCs</h1>
          <p className="text-sm text-muted-foreground">Manage NPCs for encounters and scenes.</p>
        </div>
        <Link
          href="/admin/designer/npcs/new"
          className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90"
        >
          New NPC
        </Link>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="p-3">Thumb</th>
              <th className="p-3">Name</th>
              <th className="p-3">Type</th>
              <th className="p-3">Role</th>
              <th className="p-3">Updated</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {npcs.map((n) => (
              <tr key={n.id} className="border-t">
                <td className="p-3">
                  {n.thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.thumbUrl}
                      alt={n.image_alt ?? n.name}
                      width={56}
                      height={72}
                      className="rounded-md border object-cover"
                    />
                  ) : (
                    <div className="w-[56px] h-[72px] rounded-md border bg-muted/40" />
                  )}
                </td>
                <td className="p-3 font-medium">{n.name}</td>
                <td className="p-3">{n.npc_type}</td>
                <td className="p-3">{n.default_role}</td>
                <td className="p-3">{new Date(n.updated_at).toLocaleString()}</td>
                <td className="p-3 text-right">
                  <Link className="underline" href={`/admin/designer/npcs/${n.id}`}>
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {npcs.length === 0 && (
              <tr>
                <td className="p-6 text-muted-foreground" colSpan={6}>
                  No NPCs yet. Click “New NPC”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
'@

Write-File "app/admin/designer/npcs/new/page.tsx" @'
import { redirect } from "next/navigation";
import { createNpcAction } from "@/app/actions/npcs";

export default function NewNpcPage() {
  async function action(formData: FormData) {
    "use server";
    const id = await createNpcAction(formData);
    redirect(`/admin/designer/npcs/${id}`);
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
'@

# --- Continue scaffolding (remaining files) ---
Write-File "app/admin/designer/npcs/[id]/page.tsx" @'
import { notFound } from "next/navigation";
import { getNpcById } from "@/lib/designer/npcs";
import { updateNpcAction, archiveNpcAction } from "@/app/actions/npcs";
import NpcImageUploader from "@/components/designer/npcs/NpcImageUploader";
import StatBlockEditor from "@/components/designer/npcs/StatBlockEditor";

export default async function EditNpcPage({ params }: { params: { id: string } }) {
  const npc = await getNpcById(params.id);
  if (!npc) return notFound();

  async function update(formData: FormData) {
    "use server";
    await updateNpcAction(npc.id, formData);
  }

  async function archive() {
    "use server";
    await archiveNpcAction(npc.id);
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{npc.name}</h1>
          <p className="text-sm text-muted-foreground">Edit NPC details, image, and stats.</p>
        </div>

        <form action={archive}>
          <button className="px-3 py-2 rounded-lg border hover:bg-muted/40" type="submit">
            Archive
          </button>
        </form>
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
          <textarea name="description" defaultValue={npc.description ?? ""} className="w-full border rounded-lg p-2" rows={4} />
        </div>

        <div className="space-y-2">
          <h2 className="font-semibold">Stat Block</h2>
          <StatBlockEditor initial={npc.stat_block ?? {}} />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Storyteller Notes</label>
          <textarea name="notes_storyteller" defaultValue={npc.notes_storyteller ?? ""} className="w-full border rounded-lg p-2" rows={4} />
        </div>

        <button className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90">
          Save Changes
        </button>
      </form>

      <div className="border rounded-xl p-4 opacity-70">
        <h2 className="font-semibold">Traits & Actions</h2>
        <p className="text-sm text-muted-foreground">
          Next step: multi-select traits, direct actions, and live preview of effective actions.
        </p>
      </div>
    </div>
  );
}
'@

Write-File "app/actions/npcs.ts" @'
"use server";

import { createClient } from "@/utils/supabase/server";

function safeJsonParse(input: string | null) {
  if (!input) return {};
  try { return JSON.parse(input); } catch { return {}; }
}

export async function createNpcAction(formData: FormData): Promise<string> {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const npc_type = String(formData.get("npc_type") ?? "human");
  const default_role = String(formData.get("default_role") ?? "neutral");
  const description = String(formData.get("description") ?? "");

  const { data, error } = await supabase
    .from("npcs")
    .insert([{ name, npc_type, default_role, description }])
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function updateNpcAction(npcId: string, formData: FormData) {
  const supabase = await createClient();

  const name = String(formData.get("name") ?? "").trim();
  const npc_type = String(formData.get("npc_type") ?? "human");
  const default_role = String(formData.get("default_role") ?? "neutral");
  const description = String(formData.get("description") ?? "");
  const image_alt = String(formData.get("image_alt") ?? "") || null;
  const notes_storyteller = String(formData.get("notes_storyteller") ?? "") || null;

  const stat_block_json = String(formData.get("stat_block_json") ?? "");
  const stat_block = safeJsonParse(stat_block_json);

  const { error } = await supabase
    .from("npcs")
    .update({ name, npc_type, default_role, description, image_alt, notes_storyteller, stat_block })
    .eq("id", npcId);

  if (error) throw new Error(error.message);
}

export async function archiveNpcAction(npcId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("npcs").update({ is_archived: true }).eq("id", npcId);
  if (error) throw new Error(error.message);
}

export async function npcSetImageMetaAction(npcId: string, imageAlt: string | null) {
  const supabase = await createClient();
  const image_base_path = `${npcId}/`;

  const { error } = await supabase
    .from("npcs")
    .update({
      image_base_path,
      image_alt: imageAlt,
      image_updated_at: new Date().toISOString(),
    })
    .eq("id", npcId);

  if (error) throw new Error(error.message);
}

export async function npcClearImageMetaAction(npcId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from("npcs")
    .update({
      image_base_path: null,
      image_alt: null,
      image_updated_at: new Date().toISOString(),
    })
    .eq("id", npcId);

  if (error) throw new Error(error.message);
}
'@

Write-File "lib/designer/npcs.ts" @'
import { createClient } from "@/utils/supabase/server";

export type NpcRow = {
  id: string;
  name: string;
  npc_type: "human" | "beast" | "angel";
  default_role: "enemy" | "ally" | "neutral" | "guide";
  description: string | null;
  stat_block: any;
  image_base_path: string | null;
  image_alt: string | null;
  image_updated_at: string | null;
  notes_storyteller: string | null;
  is_archived: boolean;
  updated_at: string;
};

function buildNpcImageUrl(
  supabaseUrl: string,
  npcId: string,
  file: "thumb.webp" | "small.webp" | "medium.webp" | "portrait.webp",
  version?: string | null
) {
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${supabaseUrl}/storage/v1/object/public/npc-images/${npcId}/${file}${v}`;
}

export async function listNpcs() {
  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const { data, error } = await supabase
    .from("npcs")
    .select("id,name,npc_type,default_role,image_base_path,image_alt,image_updated_at,is_archived,updated_at")
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((n: any) => {
    const hasImg = !!n.image_base_path;
    const npcId = n.id as string;
    return {
      ...n,
      thumbUrl: hasImg ? buildNpcImageUrl(supabaseUrl, npcId, "thumb.webp", n.image_updated_at) : null,
    };
  });
}

export async function getNpcById(id: string): Promise<(NpcRow & { thumbUrl: string | null; mediumUrl: string | null; portraitUrl: string | null }) | null> {
  const supabase = await createClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const { data, error } = await supabase
    .from("npcs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const hasImg = !!data.image_base_path;
  return {
    ...(data as any),
    thumbUrl: hasImg ? buildNpcImageUrl(supabaseUrl, id, "thumb.webp", data.image_updated_at) : null,
    mediumUrl: hasImg ? buildNpcImageUrl(supabaseUrl, id, "medium.webp", data.image_updated_at) : null,
    portraitUrl: hasImg ? buildNpcImageUrl(supabaseUrl, id, "portrait.webp", data.image_updated_at) : null,
  };
}
'@

Write-File "components/designer/npcs/StatBlockEditor.tsx" @'
"use client";

import { useMemo, useState } from "react";

export default function StatBlockEditor({ initial }: { initial: any }) {
  const [jsonText, setJsonText] = useState<string>(() => JSON.stringify(initial ?? {}, null, 2));

  const isValid = useMemo(() => {
    try { JSON.parse(jsonText); return true; } catch { return false; }
  }, [jsonText]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        For now this is a JSON editor. Next we’ll add a friendly form + JSON toggle.
      </p>

      <textarea
        className="w-full border rounded-lg p-2 font-mono text-xs"
        rows={14}
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
      />

      <input type="hidden" name="stat_block_json" value={jsonText} />

      {!isValid && (
        <div className="text-sm text-red-600">
          Invalid JSON. Fix it before saving.
        </div>
      )}
    </div>
  );
}
'@

Write-File "components/designer/npcs/NpcImageUploader.tsx" @'
"use client";

import { useState } from "react";
import { npcClearImageMetaAction, npcSetImageMetaAction } from "@/app/actions/npcs";

export default function NpcImageUploader({ npc }: { npc: any }) {
  const [busy, setBusy] = useState(false);

  async function onRemove() {
    setBusy(true);
    try {
      // TODO: delete Storage folder files: npc-images/<id>/*
      await npcClearImageMetaAction(npc.id);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function onFakeSet() {
    setBusy(true);
    try {
      await npcSetImageMetaAction(npc.id, npc.image_alt ?? null);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div>
        {npc.mediumUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={npc.mediumUrl}
            alt={npc.image_alt ?? npc.name}
            width={167}
            height={215}
            className="rounded-lg border object-cover"
          />
        ) : (
          <div className="w-[167px] h-[215px] rounded-lg border bg-muted/40" />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Upload + auto-crop + thumbnail generation will go here next.
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onFakeSet}
            className="px-3 py-2 rounded-lg border hover:bg-muted/40"
          >
            Replace image (next)
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="px-3 py-2 rounded-lg border hover:bg-muted/40"
          >
            Remove image
          </button>
        </div>
      </div>
    </div>
  );
}
'@

Write-Host "`nOptional: installing react-easy-crop (for next step)..." -ForegroundColor Cyan
try {
  npm i react-easy-crop | Out-Host
} catch {
  Write-Host "npm install skipped/failed. You can run: npm i react-easy-crop" -ForegroundColor Yellow
}

Write-Host "`nDone. Start the dev server: npm run dev" -ForegroundColor Green
