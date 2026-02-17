import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { addTraitEffectAction, deleteTraitEffectAction, updateTraitAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}
const EFFECT_KEYS: Record<string, { label: string; value: string }[]> = {
  ability: ["str", "dex", "con", "int", "wis", "cha"].map((k) => ({ label: k.toUpperCase(), value: k })),
  ac: [{ label: "AC", value: "ac" }],
  speed: [{ label: "Speed", value: "speed" }],
  skill: [
    "athletics", "acrobatics", "sleight_of_hand", "stealth", "arcana", "history", "investigation", "nature", "religion",
    "animal_handling", "insight", "medicine", "perception", "survival", "deception", "intimidation", "performance", "persuasion",
  ].map((k) => ({ label: k, value: k })),
  save: ["str_save", "dex_save", "con_save", "int_save", "wis_save", "cha_save"].map((k) => ({ label: k, value: k })),
  resistance: ["bludgeoning", "piercing", "slashing", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"].map((k) => ({ label: k, value: k })),
  immunity: ["bludgeoning", "piercing", "slashing", "fire", "cold", "lightning", "thunder", "acid", "poison", "necrotic", "radiant", "psychic", "force"].map((k) => ({ label: k, value: k })),
  advantage: ["athletics", "acrobatics", "sleight_of_hand", "stealth", "arcana", "history", "investigation", "nature", "religion", "animal_handling", "insight", "medicine", "perception", "survival", "deception", "intimidation", "performance", "persuasion", "initiative"].map((k) => ({ label: k, value: k })),
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

function EffectsAddForm({ traitId }: { traitId: string }) {
  return (
    <div className="rounded-2xl border p-3">
      <div className="font-semibold">Add Trait Effect</div>
      <p className="text-xs text-muted-foreground">These effects are applied to player stats when the trait is learned.</p>
      <div className="mt-3 grid gap-3">
        {Object.keys(EFFECT_KEYS).map((type) => {
          const keys = EFFECT_KEYS[type];
          const modes = EFFECT_MODES[type];
          const needsValue = ["ability", "ac", "speed", "skill", "save"].includes(type);
          const needsNotes = type === "special";
          return (
            <form key={type} action={addTraitEffectAction} className="rounded-xl border p-3">
              <input type="hidden" name="trait_id" value={traitId} />
              <input type="hidden" name="effect_type" value={type} />
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px]">
                  <label className="text-xs text-muted-foreground">type</label>
                  <div className="mt-1 flex h-9 items-center rounded-md border px-3 text-sm">{type}</div>
                </div>
                <div className="min-w-[180px]">
                  <label className="text-xs text-muted-foreground">key</label>
                  <select name="effect_key" className="mt-1 h-9 w-full rounded-md border px-2 text-sm" defaultValue={keys[0]?.value}>
                    {keys.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">mode</label>
                  <select name="mode" className="mt-1 h-9 w-full rounded-md border px-2 text-sm" defaultValue={modes[0]?.value}>
                    {modes.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">value</label>
                  <input name="value" type="number" step="1" disabled={!needsValue} className="mt-1 h-9 w-full rounded-md border px-3 text-sm disabled:bg-muted" />
                </div>
                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">sort</label>
                  <input name="sort_order" type="number" step="1" defaultValue={0} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs text-muted-foreground">notes</label>
                  <input name="notes" placeholder={needsNotes ? "required for special" : "optional"} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
                </div>
                <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">Add</button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}

export default async function EditTraitPage({
  searchParams,
}: {
  searchParams?: { err?: string };
}) {
  const c = await cookies();
  const id = c.get("trait_edit_id")?.value ?? "";

  if (!isUuid(id)) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">
          Missing or invalid trait id (cookie not set).
        </p>
        <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
{JSON.stringify({ debug: { trait_edit_id: id || null } }, null, 2)}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: trait, error } = await supabase
    .from("traits")
    .select("id,name,type,summary,trigger,mechanical_effect,narrative_signal,growth_condition,tags,is_active,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !trait) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">
          This trait does not exist or you don’t have access.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
{JSON.stringify({ id, error: error?.message ?? null }, null, 2)}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const err = (searchParams?.err ?? "").trim();
  const tagsCsv = Array.isArray(trait.tags) ? trait.tags.join(", ") : "";
  const { data: effects } = await supabase
    .from("trait_effects")
    .select("*")
    .eq("trait_id", trait.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Trait</h1>
          <p className="text-sm text-slate-600">Trait ID: {trait.id}</p>
        </div>
        <Link
          href="/admin/traits"
          className="text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          ← Back
        </Link>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <b>Save failed:</b> {err}
          <div className="mt-1 text-xs text-red-700">
            If this mentions permissions/RLS, your update policy is blocking writes.
          </div>
        </div>
      ) : null}

      <form
        action={updateTraitAction}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={trait.id} />

        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Name
            </label>
            <input
              name="name"
              defaultValue={trait.name ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Type
            </label>
            <select
              name="type"
              defaultValue={trait.type ?? "nature"}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="nature">Nature</option>
              <option value="training">Training</option>
              <option value="affliction">Affliction</option>
              <option value="calling">Calling</option>
              <option value="office">Office</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Summary
            </label>
            <textarea
              name="summary"
              defaultValue={trait.summary ?? ""}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Trigger
            </label>
            <textarea
              name="trigger"
              defaultValue={trait.trigger ?? ""}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Mechanical Effect
            </label>
            <textarea
              name="mechanical_effect"
              defaultValue={trait.mechanical_effect ?? ""}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Narrative Signal
            </label>
            <textarea
              name="narrative_signal"
              defaultValue={trait.narrative_signal ?? ""}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Growth Condition
            </label>
            <textarea
              name="growth_condition"
              defaultValue={trait.growth_condition ?? ""}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Tags (comma-separated)
            </label>
            <input
              name="tags"
              defaultValue={tagsCsv}
              placeholder="e.g. stealth, desert, priest"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={!!trait.is_active}
              className="h-4 w-4"
            />
            Active
          </label>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Updated: {trait.updated_at ?? "—"}
            </div>

            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Save Changes
            </button>
          </div>
        </div>
      </form>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <EffectsAddForm traitId={trait.id} />
        <div className="rounded-2xl border p-3">
          <div className="font-semibold">Current Effects</div>
          <div className="mt-3 space-y-2">
            {(effects ?? []).length ? (
              (effects ?? []).map((e: any) => (
                <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {e.effect_type} • {e.effect_key} • {e.mode}
                      {e.value != null ? ` • ${e.value}` : ""}
                    </div>
                    {e.notes ? <div className="mt-1 text-xs text-muted-foreground">{e.notes}</div> : null}
                    <div className="mt-1 text-[11px] text-muted-foreground">sort: {e.sort_order}</div>
                  </div>
                  <form action={deleteTraitEffectAction}>
                    <input type="hidden" name="effect_id" value={e.id} />
                    <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="submit">Delete</button>
                  </form>
                </div>
              ))
            ) : (
              <div className="text-sm italic text-muted-foreground">No effects yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
