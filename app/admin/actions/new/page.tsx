import { createActionAction } from "./actions";
import ActionBehaviorComposer from "../ActionBehaviorComposer";
const DAMAGE_DICE_OPTIONS = [
  "",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "1d12",
  "2d4",
  "2d6",
  "2d8",
  "2d10",
  "2d12",
  "3d6",
  "4d6",
];
const DAMAGE_TYPE_OPTIONS = [
  "",
  "bludgeoning",
  "piercing",
  "slashing",
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
  "healing",
  "temporary_hp",
  "utility",
];

export default async function ActionNewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const err = typeof sp.err === "string" ? sp.err : undefined;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">New Action</h1>
          <p className="text-sm text-muted-foreground">Create a reusable action in the global library.</p>
        </div>
        <a className="text-sm underline" href="/admin/actions">
          ← Back
        </a>
      </div>

      {err ? (
        <div className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      <form action={createActionAction} className="space-y-4">
        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Core Details</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked />
              <span>Active</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Name</span>
              <input name="name" className="w-full rounded-md border px-3 py-2" required />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium">Type</span>
              <select name="type" defaultValue="other" className="w-full rounded-md border px-3 py-2">
                <option value="melee">melee</option>
                <option value="ranged">ranged</option>
                <option value="other">other</option>
              </select>
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Summary</span>
              <input name="summary" className="w-full rounded-md border px-3 py-2" />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Rules Text</span>
              <textarea name="rules_text" className="min-h-[120px] w-full rounded-md border px-3 py-2" />
            </label>

            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">Tags (comma separated)</span>
              <input name="tags" className="w-full rounded-md border px-3 py-2" placeholder="undead, grapple, fire" />
            </label>
          </div>
        </div>

        <ActionBehaviorComposer />

        <div className="rounded-2xl border bg-card p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Resolution (Damage / Healing / Utility)</h2>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="uses_attack_roll" defaultChecked />
              <span>Uses attack roll</span>
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-sm font-medium">Range normal (ft)</span>
              <input name="range_normal" className="w-full rounded-md border px-3 py-2" inputMode="numeric" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Range max (ft)</span>
              <input name="range_max" className="w-full rounded-md border px-3 py-2" inputMode="numeric" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Attack bonus override</span>
              <input name="attack_bonus_override" className="w-full rounded-md border px-3 py-2" inputMode="numeric" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Effect dice</span>
              <select name="damage_dice" defaultValue="" className="w-full rounded-md border px-3 py-2">
                <option value="">(none)</option>
                {DAMAGE_DICE_OPTIONS.filter(Boolean).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Effect bonus</span>
              <input name="damage_bonus" className="w-full rounded-md border px-3 py-2" inputMode="numeric" />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Effect type</span>
              <select name="damage_type" defaultValue="" className="w-full rounded-md border px-3 py-2">
                <option value="">(none)</option>
                {DAMAGE_TYPE_OPTIONS.filter(Boolean).map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Choose <code>healing</code> or <code>temporary_hp</code> for healing actions.
              </span>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Save ability</span>
              <select name="save_ability" defaultValue="" className="w-full rounded-md border px-3 py-2">
                <option value="">(none)</option>
                <option value="str">str</option>
                <option value="dex">dex</option>
                <option value="con">con</option>
                <option value="int">int</option>
                <option value="wis">wis</option>
                <option value="cha">cha</option>
              </select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium">Save DC override</span>
              <input name="save_dc_override" className="w-full rounded-md border px-3 py-2" inputMode="numeric" />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">On fail</span>
              <textarea name="on_fail" className="w-full rounded-md border px-3 py-2" />
            </label>
            <label className="grid gap-2 md:col-span-2">
              <span className="text-sm font-medium">On success</span>
              <textarea name="on_success" className="w-full rounded-md border px-3 py-2" />
            </label>
          </div>
        </div>

        <button type="submit" className="rounded-md border px-4 py-2 font-medium">
          Create Action
        </button>
      </form>
    </div>
  );
}
