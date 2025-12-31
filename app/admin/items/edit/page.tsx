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
  ability: ["str", "dex", "con", "int", "wis", "cha"].map((k) => ({
    label: k.toUpperCase(),
    value: k,
  })),
  ac: [{ label: "AC", value: "ac" }],
  speed: [{ label: "Speed", value: "speed" }],
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
  ].map((k) => ({ label: k, value: k })),
  save: ["str_save", "dex_save", "con_save", "int_save", "wis_save", "cha_save"].map((k) => ({
    label: k,
    value: k,
  })),
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
  ].map((k) => ({ label: k, value: k })),
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
  ].map((k) => ({ label: k, value: k })),
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
  ].map((k) => ({ label: k, value: k })),
  special: [{ label: "Special", value: "special" }],
};

const EFFECT_MODES: Record<string, { label: string; value: string }[]> = {
  ability: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  ac: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  speed: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  skill: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  save: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
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
                  <select
                    name="effect_key"
                    className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                    defaultValue={keys[0]?.value}
                  >
                    {keys.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-[120px]">
                  <label className="text-xs text-muted-foreground">mode</label>
                  <select
                    name="mode"
                    className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                    defaultValue={modes[0]?.value}
                  >
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
  const itemId = c.get(COOKIE_KEY)?.value ?? "";

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

  const { data: item, error: itemErr } = await supabase.from("items").select("*").eq("id", itemId).maybeSingle();

  if (itemErr) {
    console.error("item load error:", itemErr.message);
    redirect("/admin/items");
  }
  if (!item) redirect("/admin/items");

  const { data: effects, error: effErr } = await supabase
    .from("item_effects")
    .select("*")
    .eq("item_id", itemId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (effErr) console.error("effects load error:", effErr.message);

  const equipSlots = Array.isArray(item.equip_slots) ? item.equip_slots.join(", ") : "";
  const tags = Array.isArray(item.tags) ? item.tags.join(", ") : "";

  return (
    <div className="p-6">
      <div className="mx-auto max-w-5xl">
        {/* Save / Upload banners */}
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

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Edit Item</h1>
            <p className="text-sm text-muted-foreground">Item ID: {itemId}</p>
          </div>

          <div className="flex gap-2">
            <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/admin/items">
              ← Back
            </Link>
            <DeleteItemButton itemId={itemId} deleteAction={deleteItemAction} />
          </div>
        </div>

        {/* Image upload (file picker) - replaces URL-only workflow */}
        <div className="mt-4 rounded-2xl border p-4">
          <div className="flex items-start gap-4">
            <div className="h-24 w-24 overflow-hidden rounded-2xl border bg-muted">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  No Image
                </div>
              )}
            </div>

            <div className="flex-1">
              <div className="font-semibold">Item Image</div>
              <p className="text-xs text-muted-foreground">
                Click Choose File, then Upload. Recommended square 1:1 (512×512).
              </p>

              <form
                action={uploadItemImageAction}
                encType="multipart/form-data"
                className="mt-2 flex flex-wrap items-center gap-2"
              >
                <input type="hidden" name="item_id" value={itemId} />
                <input name="file" type="file" accept="image/*" className="text-sm" />
                <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">
                  Upload Image
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* Core editor */}
        <form action={updateItemAction} className="mt-4 rounded-2xl border p-4">
          <input type="hidden" name="id" value={itemId} />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Name</label>
              <input name="name" defaultValue={item.name ?? ""} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Category</label>
                <select
                  name="category"
                  defaultValue={item.category ?? "loot"}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  {["loot", "gear", "consumable", "weapon", "armor", "tool", "quest", "misc"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Rarity</label>
                <select
                  name="rarity"
                  defaultValue={item.rarity ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">—</option>
                  {["common", "uncommon", "rare", "very_rare", "legendary", "artifact"].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
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

              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_active" defaultChecked={!!item.is_active} />
                  Active
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="stackable" defaultChecked={!!item.stackable} />
                  Stackable
                </label>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Max Stack</label>
              <input
                name="max_stack"
                type="number"
                step="1"
                defaultValue={item.max_stack ?? ""}
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Carry Behavior</label>
              <select
                name="carry_behavior"
                defaultValue={item.carry_behavior ?? "loose"}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                {["loose", "container_only", "equipped_or_container"].map((cb) => (
                  <option key={cb} value={cb}>
                    {cb}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Equip Slots (comma-separated)</label>
              <input
                name="equip_slots"
                defaultValue={equipSlots}
                placeholder="ring, head, chest, mainhand..."
                className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
              <input name="tags" defaultValue={tags} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Summary</label>
              <input name="summary" defaultValue={item.summary ?? ""} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Rules Text</label>
              <textarea
                name="rules_text"
                defaultValue={item.rules_text ?? ""}
                className="mt-1 min-h-[90px] w-full rounded-md border p-3 text-sm"
              />
            </div>

            {/* We keep image_url in the form so your DB update doesn't wipe it.
                Hidden because you don't want URL uploads. */}
            <input type="hidden" name="image_url" value={item.image_url ?? ""} />
          </div>

          {/* Weaponizable */}
          <div className="mt-4 rounded-xl border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Weaponizable</div>
                <div className="text-xs text-muted-foreground">
                  Optional combat fields for items that can act like weapons.
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_weaponizable" defaultChecked={!!item.is_weaponizable} />
                This item is weaponizable
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-muted-foreground">weapon_kind</label>
                <select
                  name="weapon_kind"
                  defaultValue={item.weapon_kind ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="">—</option>
                  {["melee", "ranged", "thrown", "improvised"].map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="uses_attack_roll" defaultChecked={item.uses_attack_roll !== false} />
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
                  placeholder="1d8"
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
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
                  placeholder="slashing"
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
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
                  <option value="">—</option>
                  {["str", "dex", "con", "int", "wis", "cha"].map((a) => (
                    <option key={a} value={a}>
                      {a}
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

              <div className="md:col-span-3">
                <label className="text-xs text-muted-foreground">on_fail</label>
                <input name="on_fail" defaultValue={item.on_fail ?? ""} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
              </div>

              <div className="md:col-span-3">
                <label className="text-xs text-muted-foreground">on_success</label>
                <input
                  name="on_success"
                  defaultValue={item.on_success ?? ""}
                  className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button className="rounded-lg border px-4 py-2 text-sm hover:bg-muted" type="submit">
              Save Changes
            </button>
          </div>
        </form>

        {/* Effects */}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <EffectsAddForm itemId={itemId} />

          <div className="rounded-2xl border p-3">
            <div className="font-semibold">Current Effects</div>
            <p className="text-xs text-muted-foreground">
              These are shown in the library card preview via the DB view.
            </p>

            <div className="mt-3 space-y-2">
              {(effects ?? []).length ? (
                (effects ?? []).map((e: any) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {e.effect_type} • {e.effect_key} • {e.mode}
                        {e.value != null ? ` • ${e.value}` : ""}
                      </div>
                      {e.notes ? <div className="text-xs text-muted-foreground mt-1">{e.notes}</div> : null}
                      <div className="text-[11px] text-muted-foreground mt-1">sort: {e.sort_order}</div>
                    </div>

                    <form action={deleteItemEffectAction}>
                      <input type="hidden" name="effect_id" value={e.id} />
                      <input type="hidden" name="item_id" value={itemId} />
                      <button className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" type="submit">
                        Delete
                      </button>
                    </form>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground italic">No effects yet.</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          Note: cookie selection is required by design. Open items from the library grid (POST action) to set the edit cookie.
        </div>
      </div>
    </div>
  );
}
