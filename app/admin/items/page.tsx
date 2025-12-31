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

function categoryPill(cat: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  switch (cat) {
    case "weapon":
      return `${base} border-red-200 bg-red-50 text-red-800`;
    case "armor":
      return `${base} border-blue-200 bg-blue-50 text-blue-800`;
    case "consumable":
      return `${base} border-purple-200 bg-purple-50 text-purple-800`;
    case "gear":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
    case "tool":
      return `${base} border-amber-200 bg-amber-50 text-amber-800`;
    case "quest":
      return `${base} border-yellow-200 bg-yellow-50 text-yellow-800`;
    case "loot":
      return `${base} border-slate-200 bg-slate-50 text-slate-800`;
    default:
      return `${base} border-zinc-200 bg-zinc-50 text-zinc-800`;
  }
}

function rarityPill(r: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  switch (r) {
    case "common":
      return `${base} border-slate-200 bg-slate-50 text-slate-700`;
    case "uncommon":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-800`;
    case "rare":
      return `${base} border-blue-200 bg-blue-50 text-blue-800`;
    case "very_rare":
      return `${base} border-purple-200 bg-purple-50 text-purple-800`;
    case "legendary":
      return `${base} border-amber-200 bg-amber-50 text-amber-900`;
    case "artifact":
      return `${base} border-rose-200 bg-rose-50 text-rose-900`;
    default:
      return `${base} border-zinc-200 bg-zinc-50 text-zinc-800`;
  }
}

export default async function ItemsLibraryPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const category = (sp.category ?? "").trim();
  const rarity = (sp.rarity ?? "").trim();
  const weaponizable = (sp.weaponizable ?? "").trim();
  const active = (sp.active ?? "").trim();

  const supabase = await createClient();

  let dataQuery = supabase
    .from("items_with_effects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (q) {
    dataQuery = dataQuery.or(
      `name.ilike.%${q}%,summary.ilike.%${q}%,rules_text.ilike.%${q}%`
    );
  }
  if (category) dataQuery = dataQuery.eq("category", category);
  if (rarity) dataQuery = dataQuery.eq("rarity", rarity);
  if (weaponizable === "1") dataQuery = dataQuery.eq("is_weaponizable", true);
  if (weaponizable === "0") dataQuery = dataQuery.eq("is_weaponizable", false);
  if (active === "1") dataQuery = dataQuery.eq("is_active", true);
  if (active === "0") dataQuery = dataQuery.eq("is_active", false);

  const [{ data: items, error }, { count }] = await Promise.all([
    dataQuery,
    supabase.from("items").select("*", { count: "exact", head: true }),
  ]);

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Items Library</h1>
        <p className="mt-3 text-sm text-red-600">
          Error loading items: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* 👇 THIS is what removes “full screen” */}
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Items Designer</h1>
            <p className="text-sm text-muted-foreground">
              Global item library with structured effects.
            </p>
          </div>

          <Link
            href="/admin/items/new"
            className="inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-muted"
          >
            + New Item
          </Link>
        </div>

        {/* Filters */}
        <form className="mt-4 grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-5">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search..."
            className="h-9 rounded-md border px-3 text-sm"
          />

          <select name="category" defaultValue={category} className="h-9 rounded-md border px-2 text-sm">
            <option value="">All categories</option>
            {["loot", "gear", "consumable", "weapon", "armor", "tool", "quest", "misc"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select name="rarity" defaultValue={rarity} className="h-9 rounded-md border px-2 text-sm">
            <option value="">All rarities</option>
            {["common","uncommon","rare","very_rare","legendary","artifact"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>

          <select name="weaponizable" defaultValue={weaponizable} className="h-9 rounded-md border px-2 text-sm">
            <option value="">Weaponizable: Any</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>

          <select name="active" defaultValue={active} className="h-9 rounded-md border px-2 text-sm">
            <option value="">Active: Any</option>
            <option value="1">Yes</option>
            <option value="0">No</option>
          </select>

          <div className="sm:col-span-5 flex gap-2 pt-1">
            <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
              Apply
            </button>
            <Link href="/admin/items" className="h-9 rounded-md border px-3 text-sm inline-flex items-center hover:bg-muted">
              Reset
            </Link>
          </div>
        </form>

        <div className="mt-3 text-sm text-muted-foreground">
          Total items: {count ?? 0}
        </div>

        {/* Cards */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {(items ?? []).map((it: any) => {
            const weight =
              it.weight_lb != null ? `${Number(it.weight_lb).toFixed(2)} lb` : "—";

            return (
              <form key={it.id} action={openItemEditAction} className="contents">
                <input type="hidden" name="item_id" value={it.id} />
                <button className="group text-left">
                  <div className="rounded-2xl border p-3 hover:bg-muted/40 transition">
                    <div className="flex gap-3">
                      {/* Image */}
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
                        {it.image_url ? (
                          <img
                            src={it.image_url}
                            alt={it.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            No Image
                          </div>
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {it.name}
                          </div>

                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className={categoryPill(it.category)}>
                              {it.category}
                            </span>
                            {it.rarity && (
                              <span className={rarityPill(it.rarity)}>
                                {it.rarity}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground">
                          Edit →
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {it.summary || "No summary"}
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      Weight: {weight}
                    </div>

                    <div className="mt-2 text-xs">
                      <span className="text-muted-foreground">Effects:</span>{" "}
                      {it.effects_count ? (
                        <span>{it.effects_preview}</span>
                      ) : (
                        <span className="italic text-muted-foreground">none</span>
                      )}
                    </div>
                  </div>
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </div>
  );
}
