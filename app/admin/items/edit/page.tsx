import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import {
  updateItemAction,
  addItemEffectAction,
  deleteItemEffectAction,
  deleteItemAction,
} from "@/app/admin/items/edit/actions";
import DeleteItemButton from "@/app/admin/items/edit/DeleteItemButton";
import ItemImageUploader from "@/app/admin/items/edit/ItemImageUploader";
import EffectsComposer from "@/app/admin/items/edit/EffectsComposer";
import { parsePassiveEffectNotes } from "@/lib/passiveEffectNotes";

const COOKIE_KEY = "item_edit_id";

type SP = { saved?: string; img?: string; err?: string; id?: string };

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function joinBasePath(basePath: string, filename: string) {
  const b = String(basePath || "");
  if (!b) return "";
  return b.endsWith("/") ? `${b}${filename}` : `${b}/${filename}`;
}

async function signedUrlFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  objectPath: string,
  expiresInSeconds = 60 * 60
) {
  if (!objectPath) return null;
  const { data, error } = await supabase.storage.from("item-images").createSignedUrl(objectPath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export default async function ItemEditPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const saved = (sp.saved ?? "").trim();
  const img = (sp.img ?? "").trim();
  const err = (sp.err ?? "").trim();
  const idFromQuery = String(sp.id ?? "").trim();

  const c = await cookies();
  const itemIdFromCookie = c.get(COOKIE_KEY)?.value ?? "";
  const itemId = isUuid(idFromQuery) ? idFromQuery : itemIdFromCookie;

  if (!isUuid(itemId)) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Edit Item</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No item selected. Open from the library, or use /admin/items/edit?id=&lt;item_uuid&gt;.
        </p>
        <div className="mt-4">
          <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/admin/items">
            Back to Items
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

  const base = (item.image_base_path ?? "") as string;
  const thumbPath = base ? joinBasePath(base, "thumb.webp") : "";
  const mediumPath = base ? joinBasePath(base, "medium.webp") : "";

  const [thumbUrl, mediumUrl] = await Promise.all([
    base ? signedUrlFor(supabase, thumbPath) : Promise.resolve(null),
    base ? signedUrlFor(supabase, mediumPath) : Promise.resolve(null),
  ]);

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
    <div className="p-4">
      <div className="mx-auto max-w-4xl">
        <div className="space-y-2">
          {saved ? (
            <div className="animate-pulse rounded-xl border bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Saved.</div>
          ) : null}
          {img ? (
            <div className="animate-pulse rounded-xl border bg-blue-50 px-3 py-2 text-sm text-blue-900">Image updated.</div>
          ) : null}
          {err ? <div className="rounded-xl border bg-red-50 px-3 py-2 text-sm text-red-900">Error: {err}</div> : null}
        </div>

        <div className="sticky top-2 z-30 mt-3 rounded-xl border bg-white/95 p-2 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">Edit Item: {item.name ?? "Untitled Item"}</h1>
              <p className="truncate text-xs text-muted-foreground">Item ID: {itemId}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/admin/items">
                Back
              </Link>
              <DeleteItemButton itemId={itemId} deleteAction={deleteItemAction} />
              <button
                className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
                type="submit"
                form="item-edit-form"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <div className="font-semibold">Item Image</div>
              <p className="text-xs text-muted-foreground">
                Bucket <span className="font-mono">item-images</span> at{" "}
                <span className="font-mono">{item.image_base_path ?? "(no base path yet)"}</span>
              </p>
              <div className="mt-3">
                <ItemImageUploader
                  item={{
                    ...item,
                    _img: {
                      thumbUrl: thumbUrl ?? undefined,
                      mediumUrl: mediumUrl ?? undefined,
                      alt: (item.image_alt ?? item.name ?? "Item") as string,
                    },
                  }}
                />
              </div>
            </div>

            <div>
              <div className="font-semibold">Current Effects</div>
              <p className="text-xs text-muted-foreground">Shown in item previews.</p>
              <div className="mt-3 space-y-2">
                {(effects ?? []).length ? (
                  (effects ?? []).map((e: any) => (
                    <div key={e.id} className="flex items-start justify-between gap-3 rounded-xl border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {e.effect_type} | {e.effect_key} | {e.mode}
                          {e.value != null ? ` | ${e.value}` : ""}
                        </div>
                        {e.effect_type === "passive" ? (
                          (() => {
                            const parsed = parsePassiveEffectNotes(e.notes);
                            return (
                              <div className="mt-1 space-y-1">
                                {parsed.playerText ? (
                                  <div className="text-xs text-muted-foreground">Player: {parsed.playerText}</div>
                                ) : null}
                                {parsed.storytellerText ? (
                                  <div className="rounded border bg-amber-50 px-2 py-1 text-xs text-amber-900">
                                    ST: {parsed.storytellerText}
                                  </div>
                                ) : null}
                                {parsed.saveTriggerEnabled ? (
                                  <div className="text-[11px] font-semibold text-emerald-700">Save trigger enabled</div>
                                ) : null}
                              </div>
                            );
                          })()
                        ) : e.notes ? (
                          <div className="mt-1 text-xs text-muted-foreground">{e.notes}</div>
                        ) : null}
                        <div className="mt-1 text-[11px] text-muted-foreground">sort: {e.sort_order}</div>
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
                  <div className="text-sm italic text-muted-foreground">No effects yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <form id="item-edit-form" action={updateItemAction} className="mt-3 rounded-2xl border p-3">
          <input type="hidden" name="id" value={itemId} />
          <input type="hidden" name="image_url" value={item.image_url ?? ""} />

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
                  {["loot", "gear", "consumable", "weapon", "armor", "tool", "quest", "misc"].map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Rarity</label>
                <select name="rarity" defaultValue={item.rarity ?? ""} className="mt-1 h-9 w-full rounded-md border px-2 text-sm">
                  <option value="">-</option>
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
              <div>
                <label className="text-xs text-muted-foreground">Faith Required</label>
                <input
                  name="faith_required"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue={item.faith_required ?? 0}
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
              <label className="text-xs text-muted-foreground">Summary (short)</label>
              <input name="summary" defaultValue={item.summary ?? ""} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Description (long)</label>
              <textarea
                name="description"
                defaultValue={item.rules_text ?? ""}
                className="mt-1 min-h-[90px] w-full rounded-md border p-3 text-sm"
              />
            </div>
          </div>

          <details className="mt-3 rounded-xl border p-3">
            <summary className="cursor-pointer font-semibold">Weaponizable (optional)</summary>
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Optional combat fields for items that can act like weapons.</div>
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
                    <option value="">-</option>
                    {["melee", "ranged", "thrown", "improvised"].map((kind) => (
                      <option key={kind} value={kind}>
                        {kind}
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
                  <select name="save_ability" defaultValue={item.save_ability ?? ""} className="mt-1 h-9 w-full rounded-md border px-2 text-sm">
                    <option value="">-</option>
                    {["str", "dex", "con", "int", "wis", "cha"].map((ability) => (
                      <option key={ability} value={ability}>
                        {ability}
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
                  <input name="on_success" defaultValue={item.on_success ?? ""} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
                </div>
              </div>
            </div>
          </details>

          <div className="mt-3 flex justify-end">
            <button className="rounded-lg border px-4 py-2 text-sm hover:bg-muted" type="submit">
              Save Changes
            </button>
          </div>
        </form>

        <div className="mt-3">
          <EffectsComposer itemId={itemId} addEffectAction={addItemEffectAction} />
        </div>

        <div className="mt-4 text-xs text-muted-foreground">
          Note: cookie selection is required by design. Open items from the library grid (POST action) to set the edit cookie.
        </div>
      </div>
    </div>
  );
}
