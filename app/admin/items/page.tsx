import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { openItemEditAction } from "@/app/admin/items/edit/actions";

type SP = {
  q?: string;
  category?: string;
  rarity?: string;
  weaponizable?: string;
  active?: string;
};

export default async function ItemsLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = (sp.category ?? "").trim();
  const rarity = (sp.rarity ?? "").trim();
  const weaponizable = (sp.weaponizable ?? "").trim(); // "1" | "0" | ""
  const active = (sp.active ?? "").trim(); // "1" | "0" | ""

  const supabase = await createClient();

  let query = supabase
    .from("items_with_effects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (q) {
    query = query.or(`name.ilike.%${q}%,summary.ilike.%${q}%,rules_text.ilike.%${q}%`);
  }
  if (category) query = query.eq("category", category);
  if (rarity) query = query.eq("rarity", rarity);
  if (weaponizable === "1") query = query.eq("is_weaponizable", true);
  if (weaponizable === "0") query = query.eq("is_weaponizable", false);
  if (active === "1") query = query.eq("is_active", true);
  if (active === "0") query = query.eq("is_active", false);

  const { data: items, error } = await query;

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Items Library</h1>
        <p className="mt-3 text-sm text-red-600">Error loading items: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Items Library</h1>
          <p className="text-sm text-muted-foreground">
            Global loot/gear library. Cards show an effects preview.
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href="/admin/items/new"
            className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted"
          >
            + New Item
          </Link>
        </div>
      </div>

      {/* Filters */}
      <form className="mt-4 grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-5">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name/summary/rules..."
          className="h-9 rounded-md border px-3 text-sm"
        />

        <select name="category" defaultValue={category} className="h-9 rounded-md border px-2 text-sm">
          <option value="">All categories</option>
          {["loot", "gear", "consumable", "weapon", "armor", "tool", "quest", "misc"].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select name="rarity" defaultValue={rarity} className="h-9 rounded-md border px-2 text-sm">
          <option value="">All rarities</option>
          {["common", "uncommon", "rare", "very_rare", "legendary", "artifact"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <select name="weaponizable" defaultValue={weaponizable} className="h-9 rounded-md border px-2 text-sm">
          <option value="">Weaponizable: Any</option>
          <option value="1">Weaponizable: Yes</option>
          <option value="0">Weaponizable: No</option>
        </select>

        <select name="active" defaultValue={active} className="h-9 rounded-md border px-2 text-sm">
          <option value="">Active: Any</option>
          <option value="1">Active: Yes</option>
          <option value="0">Active: No</option>
        </select>

        <div className="sm:col-span-5 flex gap-2 pt-1">
          <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">
            Apply
          </button>
          <Link className="h-9 rounded-md border px-3 text-sm inline-flex items-center hover:bg-muted" href="/admin/items">
            Reset
          </Link>
        </div>
      </form>

      {/* Grid */}
      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(items ?? []).map((it: any) => {
          const pills = [
            it.category ? String(it.category) : null,
            it.rarity ? String(it.rarity) : null,
            it.is_weaponizable ? "weaponizable" : null,
            it.is_active ? "active" : "inactive",
          ].filter(Boolean);

          const weight = it.weight_lb != null ? `${Number(it.weight_lb).toFixed(2)} lb` : "—";
          const slots = Array.isArray(it.equip_slots) && it.equip_slots.length ? it.equip_slots.join(", ") : "—";

          return (
            <form key={it.id} action={openItemEditAction} className="contents">
              <input type="hidden" name="item_id" value={it.id} />
              <button
                type="submit"
                className="group text-left rounded-2xl border p-3 shadow-sm hover:bg-muted/40 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold leading-tight truncate">{it.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {pills.map((p: any, idx: number) => (
                        <span
                          key={idx}
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground group-hover:text-foreground">
                    Edit →
                  </div>
                </div>

                {it.summary ? (
                  <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {it.summary}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-muted-foreground italic">No summary</div>
                )}

                <div className="mt-2 text-xs text-muted-foreground">
                  Weight: {weight} • Carry: {it.carry_behavior} • Slots: {slots}
                </div>

                <div className="mt-2 text-xs">
                  <span className="text-muted-foreground">Effects:</span>{" "}
                  {it.effects_count ? (
                    <span className="text-foreground">{it.effects_preview}</span>
                  ) : (
                    <span className="text-muted-foreground italic">none</span>
                  )}
                </div>
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
