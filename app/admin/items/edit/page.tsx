import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  updateItemAction,
  addItemEffectAction,
  deleteItemEffectAction,
  deleteItemAction,
  uploadItemImageAction,
} from "@/app/admin/items/edit/actions";
import DeleteItemButton from "@/app/admin/items/edit/DeleteItemButton";


const COOKIE_KEY = "item_edit_id";

const EFFECT_KEYS: Record<string, { label: string; value: string }[]> = {
  ability: ["str","dex","con","int","wis","cha"].map((k) => ({ label: k.toUpperCase(), value: k })),
  ac: [{ label: "AC", value: "ac" }],
  speed: [{ label: "Speed", value: "speed" }],
  skill: [
    "athletics","acrobatics","sleight_of_hand","stealth",
    "arcana","history","investigation","nature","religion",
    "animal_handling","insight","medicine","perception","survival",
    "deception","intimidation","performance","persuasion",
  ].map((k) => ({ label: k, value: k })),
  save: ["str_save","dex_save","con_save","int_save","wis_save","cha_save"].map((k) => ({ label: k, value: k })),
  resistance: [
    "bludgeoning","piercing","slashing","fire","cold","lightning","thunder","acid","poison","necrotic","radiant","psychic","force",
  ].map((k) => ({ label: k, value: k })),
  immunity: [
    "bludgeoning","piercing","slashing","fire","cold","lightning","thunder","acid","poison","necrotic","radiant","psychic","force",
  ].map((k) => ({ label: k, value: k })),
  advantage: [
    "athletics","acrobatics","sleight_of_hand","stealth",
    "arcana","history","investigation","nature","religion",
    "animal_handling","insight","medicine","perception","survival",
    "deception","intimidation","performance","persuasion",
    "initiative",
  ].map((k) => ({ label: k, value: k })),
  special: [{ label: "Special", value: "special" }],
};

const EFFECT_MODES: Record<string, { label: string; value: string }[]> = {
  ability: [{ label: "add", value: "add" }, { label: "set", value: "set" }],
  ac: [{ label: "add", value: "add" }, { label: "set", value: "set" }],
  speed: [{ label: "add", value: "add" }, { label: "set", value: "set" }],
  skill: [{ label: "add", value: "add" }, { label: "set", value: "set" }],
  save: [{ label: "add", value: "add" }, { label: "set", value: "set" }],
  resistance: [{ label: "grant", value: "grant" }],
  immunity: [{ label: "grant", value: "grant" }],
  advantage: [{ label: "grant", value: "grant" }],
  special: [{ label: "note", value: "note" }],
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// --- Small client widget for guided effect adds ---
function EffectsAddForm({ itemId }: { itemId: string }) {
  // Inline client component via dynamic import isn’t needed; Next supports client components only in separate files.
  // So we’ll render a simple server form + a tiny progressive enhancement by using <select> + name defaults.
  // (Guided keys/modes still happen because we constrain options per type with multiple forms.)
  //
  // If you want fully dynamic dependent dropdowns on one form, move this into a separate client component file.
  return (
    <div className="rounded-2xl border p-3">
      <div className="font-semibold">Add Effect</div>
      <p className="text-xs text-muted-foreground">
        Choose an effect type. Use the matching row to ensure the correct key/mode/value rules.
      </p>

      <div className="mt-3 grid gap-3">
        {Object.keys(EFFECT_KEYS).map((type) => {
          const keys = EFFECT_KEYS[type];
          const modes = EFFECT_MODES[type];
          const needsValue = ["ability", "ac", "speed", "skill", "save"].includes(type);
          const needsNotes = type === "special";
          const valueDisabled = !needsValue;

          return (
            <form key={type} action={addItemEffectAction} className="rounded-xl border p-3">
              <input type="hidden" name="item_id" value={itemId} />
              <input type="hidden" name="effect_type" value={type} />

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground">type</label>
                  <div className="mt-1 h-9 rounded-md border px-3 text-sm flex items-center">
                    {type}
                  </div>
                </div>

                <div className="min-w-[180px]">
                  <label className="text-xs text-muted-foreground">key</label>
                  <select name="effect_key" className="mt-1 h-9 w-full rounded-md border px-2 text-sm" defaultValue={keys[0]?.value}>
                    {keys.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">mode</label>
                  <select name="mode" className="mt-1 h-9 w-full rounded-md border px-2 text-sm" defaultValue={modes[0]?.value}>
                    {modes.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">value</label>
                  <input
                    name="value"
                    type="number"
                    step="1"
                    disabled={valueDisabled}
                    placeholder={needsValue ? "required" : "—"}
                    className="mt-1 h-9 w-full rounded-md border px-3 text-sm disabled:bg-muted"
                  />
                </div>

                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">sort</label>
                  <input
                    name="sort_order"
                    type="number"
                    step="1"
                    defaultValue={0}
                    className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  />
                </div>

                <div className="flex-1 min-w-[220px]">
                  <label className="text-xs text-muted-foreground">notes</label>
                  <input
                    name="notes"
                    placeholder={needsNotes ? "required for special" : "optional"}
                    className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  />
                </div>

                <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">
                  Add
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

type SP = { saved?: string; img?: string; err?: string };

export default async function ItemEditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const saved = (sp.saved ?? "").trim();
  const img = (sp.img ?? "").trim();
  const err = (sp.err ?? "").trim();

  const c = await cookies();
  const itemId = c.get("item_edit_id")?.value ?? "";

  const isUuid = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

  if (!isUuid(itemId)) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Edit Item</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No item selected. Go back to the library and open an item.
        </p>
        <div className="mt-4">
          <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/admin/items">
            ← Back to Items
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();

  if (itemErr) {
    console.error("item load error:", itemErr.message);
    redirect("/admin/items");
  }
  if (!item) redirect("/admin/items");

  const { data: effects } = await supabase
    .from("item_effects")
    .select("*")
    .eq("item_id", itemId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Alerts (with simple “pulse” animation) */}
        <div className="space-y-2">
          {saved ? (
            <div className="rounded-xl border bg-emerald-50 px-3 py-2 text-sm text-emerald-900 animate-pulse">
              ✅ Saved.
            </div>
          ) : null}
          {img ? (
            <div className="rounded-xl border bg-blue-50 px-3 py-2 text-sm text-blue-900 animate-pulse">
              🖼️ Image updated.
            </div>
          ) : null}
          {err ? (
            <div className="rounded-xl border bg-red-50 px-3 py-2 text-sm text-red-900">
              Error: {err}
            </div>
          ) : null}
        </div>

        {/* Header + Image Uploader (UP TOP) */}
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border bg-muted">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  No Image
                </div>
              )}
            </div>

            <div>
              <h1 className="text-xl font-semibold">Edit Item</h1>
              <p className="text-sm text-muted-foreground">
                {item.name} • ID: {itemId}
              </p>

              <form action={uploadItemImageAction} className="mt-2 flex items-center gap-2">
                <input type="hidden" name="item_id" value={itemId} />
                <input
                  name="file"
                  type="file"
                  accept="image/*"
                  className="text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                >
                  Upload Image
                </button>
              </form>

              <p className="mt-1 text-[11px] text-muted-foreground">
                Recommended: square 1:1 (512×512). Stored in Supabase bucket: <span className="font-mono">item-images</span>.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/admin/items">
              ← Back
            </Link>
            <DeleteItemButton itemId={itemId} deleteAction={deleteItemAction} />
          </div>
        </div>

        {/* ---- Keep your existing editor form below this line ---- */}
        {/* Your existing <form action={updateItemAction}> ... etc */}
        {/* Make sure the Save button still submits updateItemAction */}
      </div>
    </div>
  );
}

