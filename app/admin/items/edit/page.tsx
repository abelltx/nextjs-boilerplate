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

type SP = { saved?: string; img?: string; err?: string };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

// Guided effect keys
const EFFECT_KEYS: Record<string, string[]> = {
  ability: ["str", "dex", "con", "int", "wis", "cha"],
  ac: ["ac"],
  speed: ["speed"],
  skill: [
    "athletics",
    "acrobatics",
    "sleight_of_hand",
    "stealth",
    "arcana",
    "history",
    "investigation",
    "nature",
    "religion",
    "animal_handling",
    "insight",
    "medicine",
    "perception",
    "survival",
    "deception",
    "intimidation",
    "performance",
    "persuasion",
  ],
  save: ["str_save", "dex_save", "con_save", "int_save", "wis_save", "cha_save"],
  resistance: [
    "bludgeoning",
    "piercing",
    "slashing",
    "fire",
    "cold",
    "lightning",
    "thunder",
    "acid",
    "poison",
    "necrotic",
    "radiant",
    "psychic",
    "force",
  ],
  immunity: [
    "bludgeoning",
    "piercing",
    "slashing",
    "fire",
    "cold",
    "lightning",
    "thunder",
    "acid",
    "poison",
    "necrotic",
    "radiant",
    "psychic",
    "force",
  ],
  advantage: [
    "athletics",
    "acrobatics",
    "sleight_of_hand",
    "stealth",
    "arcana",
    "history",
    "investigation",
    "nature",
    "religion",
    "animal_handling",
    "insight",
    "medicine",
    "perception",
    "survival",
    "deception",
    "intimidation",
    "performance",
    "persuasion",
    "initiative",
  ],
  special: ["special"],
};

const EFFECT_MODES: Record<string, string[]> = {
  ability: ["add", "set"],
  ac: ["add", "set"],
  speed: ["add", "set"],
  skill: ["add", "set"],
  save: ["add", "set"],
  resistance: ["grant"],
  immunity: ["grant"],
  advantage: ["grant"],
  special: ["note"],
};

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
  const itemId = c.get(COOKIE_KEY)?.value ?? "";

  if (!isUuid(itemId)) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-xl font-semibold">Edit Item</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No item selected. Go back to the library and open an item.
          </p>
          <div className="mt-4">
            <Link
              className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              href="/admin/items"
            >
              ← Back to Items
            </Link>
          </div>
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
    console.error("Item load error:", itemErr.message);
    redirect("/admin/items");
  }
  if (!item) redirect("/admin/items");

  const { data: effects, error: effErr } = await supabase
    .from("item_effects")
    .select("*")
    .eq("item_id", itemId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (effErr) console.error("Effects load error:", effErr.message);

  const tagsCsv = Array.isArray(item.tags) ? item.tags.join(", ") : "";
  const slotsCsv = Array.isArray(item.equip_slots) ? item.equip_slots.join(", ") : "";

  const showValueHint = (t: string) =>
    ["ability", "ac", "speed", "skill", "save"].includes(t);

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Alerts */}
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

        {/* Header */}
        <div className="mt-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Edit Item</h1>
            <p className="text-sm text-muted-foreground">
              {item.name} • ID: <span className="font-mono">{itemId}</span>
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              href="/admin/items"
            >
              ← Back
            </Link>
            <DeleteItemButton itemId={itemId} deleteAction={deleteItemAction} />
          </div>
        </div>

        {/* Image uploader up top */}
        <div className="mt-4 rounded-2xl border p-4">
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

            <div className="flex-1">
              <div className="text-sm font-medium">Item Image</div>
              <p className="text-[11px] text-muted-foreground">
                Recommended: square 1:1 (512×512). Bucket:{" "}
                <span className="font-mono">item-images</span>
              </p>

              <form
                action={uploadItemImageAction}
                encType="multipart/form-data"
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="item_id" value={itemId} />
                <input name="file" type="file" accept="image/*" className="text-sm" />
                <button
                  type="submit"
                  className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                >
                  Upload Image
                </button>
              </form>

              <div className="mt-2">
                <label className="text-xs text-muted-foreground">
                  Or paste an Image URL (square recommended)
                </label>
                <input
                  form="item-core-form"
                  name="image_url"
                  defaultValue={item.image_url ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>
        </div>

        {/* Core item editor */}
        <form
          id="item-core-form"
          action={updateItemAction}
          className="mt-4 rounded-2xl border p-4 space-y-4"
        >
          <input type="hidden" name="id" value={itemId} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input
                name="name"
                defaultValue={item.name ?? ""}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                required
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select
                name="category"
                defaultValue={item.category ?? "loot"}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                required
              >
                {["loot", "gear", "consumable", "weapon", "armor", "tool", "quest", "misc"].map(
                  (c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Rarity</label>
              <select
                name="rarity"
                defaultValue={item.rarity ?? ""}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">(none)</option>
                {["common", "uncommon", "rare", "very_rare", "legendary", "artifact"].map(
                  (r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  )
                )}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Weight (lb)</label>
              <input
                name="weight_lb"
                type="number"
                step="0.01"
                defaultValue={item.weight_lb ?? ""}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Summary</label>
              <input
                name="summary"
                defaultValue={item.summary ?? ""}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                placeholder="1–2 line card summary"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Rules Text</label>
              <textarea
                name="rules_text"
                defaultValue={item.rules_text ?? ""}
                className="mt-1 min-h-[90px] w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Longer rules description"
              />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
              <input
                name="tags"
                defaultValue={tagsCsv}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                placeholder="stealth, ring, magic"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Carry behavior</label>
              <select
                name="carry_behavior"
                defaultValue={item.carry_behavior ?? "loose"}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {["loose", "container_only", "equipped_or_container"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="stackable"
                  defaultChecked={!!item.stackable}
                />
                Stackable
              </label>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Max stack</label>
              <input
                name="max_stack"
                type="number"
                step="1"
                defaultValue={item.max_stack ?? ""}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>

            <div className="md:col-span-3">
              <label className="text-xs text-muted-foreground">
                Equip slots (comma-separated)
              </label>
              <input
                name="equip_slots"
                defaultValue={slotsCsv}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                placeholder="ring, head, chest, mainhand, offhand"
              />
            </div>

            <div className="md:col-span-3 flex items-center gap-3 pt-1">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={!!item.is_active}
                />
                Active
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_weaponizable"
                  defaultChecked={!!item.is_weaponizable}
                />
                Weaponizable
              </label>
            </div>
          </div>

          {/* Weapon fields (always visible; harmless if not weaponizable) */}
          <div className="rounded-xl border p-3">
            <div className="text-sm font-medium">Combat (optional)</div>
            <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs text-muted-foreground">weapon_kind</label>
                <select
                  name="weapon_kind"
                  defaultValue={item.weapon_kind ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">(none)</option>
                  {["melee", "ranged", "thrown", "improvised"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="uses_attack_roll"
                    defaultChecked={item.uses_attack_roll !== false}
                  />
                  uses_attack_roll
                </label>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">attack_bonus_override</label>
                <input
                  name="attack_bonus_override"
                  type="number"
                  step="1"
                  defaultValue={item.attack_bonus_override ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">damage_dice</label>
                <input
                  name="damage_dice"
                  defaultValue={item.damage_dice ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  placeholder="1d8"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">damage_bonus</label>
                <input
                  name="damage_bonus"
                  type="number"
                  step="1"
                  defaultValue={item.damage_bonus ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">damage_type</label>
                <input
                  name="damage_type"
                  defaultValue={item.damage_type ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  placeholder="slashing"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">range_normal</label>
                <input
                  name="range_normal"
                  type="number"
                  step="1"
                  defaultValue={item.range_normal ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">range_max</label>
                <input
                  name="range_max"
                  type="number"
                  step="1"
                  defaultValue={item.range_max ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground">save_ability</label>
                <select
                  name="save_ability"
                  defaultValue={item.save_ability ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">(none)</option>
                  {["str", "dex", "con", "int", "wis", "cha"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">save_dc_override</label>
                <input
                  name="save_dc_override"
                  type="number"
                  step="1"
                  defaultValue={item.save_dc_override ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">on_fail</label>
                <input
                  name="on_fail"
                  defaultValue={item.on_fail ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs text-muted-foreground">on_success</label>
                <input
                  name="on_success"
                  defaultValue={item.on_success ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
            >
              Save Item
            </button>
          </div>
        </form>

        {/* Effects editor */}
        <div className="mt-4 rounded-2xl border p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Effects</div>
              <p className="text-xs text-muted-foreground">
                Structured effects shown on cards and used later when equipped.
              </p>
            </div>
          </div>

          {/* Add effect */}
          <form action={addItemEffectAction} className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-6">
            <input type="hidden" name="item_id" value={itemId} />

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">effect_type</label>
              <select
                name="effect_type"
                defaultValue="ability"
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {Object.keys(EFFECT_KEYS).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Tip: pick type, then choose key + mode.
              </p>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">effect_key</label>
              <select
                name="effect_key"
                defaultValue="str"
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {/* NOTE: server components can’t dynamically change this list without JS.
                    We provide the “ability” defaults; user can change type then key after submit/edit.
                    If you want true dependent dropdowns, we’ll add a tiny client widget. */}
                {EFFECT_KEYS.ability.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">mode</label>
              <select
                name="mode"
                defaultValue="add"
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {EFFECT_MODES.ability.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">value</label>
              <input
                name="value"
                type="number"
                step="1"
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                placeholder="+1"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">sort_order</label>
              <input
                name="sort_order"
                type="number"
                step="1"
                defaultValue={0}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>

            <div className="md:col-span-6">
              <label className="text-xs text-muted-foreground">notes (required for special)</label>
              <input
                name="notes"
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                placeholder="Optional note… (or required if effect_type=special)"
              />
            </div>

            <div className="md:col-span-6 flex justify-end">
              <button
                type="submit"
                className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
              >
                + Add Effect
              </button>
            </div>

            <div className="md:col-span-6 text-[11px] text-muted-foreground">
              Heads-up: truly “guided” dependent dropdowns (type → key/mode) needs a tiny client component.
              If you want it, I’ll drop in <span className="font-mono">EffectsEditor.tsx</span> that keeps your server actions.
            </div>
          </form>

          {/* Existing effects list */}
          <div className="mt-4 space-y-2">
            {(effects ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground italic">No effects yet.</div>
            ) : (
              (effects ?? []).map((e: any) => {
                const needsValue = ["ability", "ac", "speed", "skill", "save"].includes(e.effect_type);
                const valueText =
                  needsValue && e.value != null ? ` ${e.mode} ${e.value}` : ` ${e.mode}`;
                const keyText = `${e.effect_type}:${e.effect_key}${valueText}`;
                return (
                  <div
                    key={e.id}
                    className="flex items-start justify-between gap-3 rounded-xl border p-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{keyText}</div>
                      {e.notes ? (
                        <div className="mt-1 text-xs text-muted-foreground">{e.notes}</div>
                      ) : null}
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        sort_order: {e.sort_order ?? 0}
                      </div>
                    </div>

                    <form action={deleteItemEffectAction}>
                      <input type="hidden" name="effect_id" value={e.id} />
                      <input type="hidden" name="item_id" value={itemId} />
                      <button
                        type="submit"
                        className="rounded-lg border px-3 py-2 text-xs hover:bg-muted"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Footer helper */}
        <div className="mt-6 text-xs text-muted-foreground">
          If image uploads fail: confirm bucket <span className="font-mono">item-images</span> exists and Storage policies allow inserts.
        </div>
      </div>
    </div>
  );
}
