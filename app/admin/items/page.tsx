import Link from "next/link";
import { createClient } from "@/utils/supabase/server";

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
  const { data, error } = await supabase.storage
    .from("item-images")
    .createSignedUrl(objectPath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
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
        <p className="mt-2 text-sm text-red-600">
          Error loading items: {error.message}
        </p>
      </div>
    );
  }

  // ✅ Derive signed URLs from image_base_path + filename
  const itemsWithImages = await Promise.all(
    (items ?? []).map(async (it: any) => {
      const base = it.image_base_path as string | null;
      const alt = (it.image_alt ?? it.name ?? "Item") as string;

      const thumbPath = base ? joinBasePath(base, "thumb.webp") : "";
      const mediumPath = base ? joinBasePath(base, "medium.webp") : "";

      const [thumbUrl, mediumUrl] = await Promise.all([
        base ? signedUrlFor(supabase, thumbPath) : Promise.resolve(null),
        base ? signedUrlFor(supabase, mediumPath) : Promise.resolve(null),
      ]);

      return {
        ...it,
        __img: {
          alt,
          thumbUrl: thumbUrl ?? null,
          mediumUrl: mediumUrl ?? null,
        },
      };
    })
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Items Designer</h1>
          <p className="text-sm text-muted-foreground">
            Global item library with structured effects.
          </p>
          <div className="mt-2 text-sm text-muted-foreground">
            Total items: {count ?? 0}
          </div>
        </div>

        <Link
          href="/admin/items/new"
          className="rounded-xl border px-4 py-2 text-sm hover:bg-muted"
        >
          + New Item
        </Link>
      </div>

      {/* Filters */}
      <form className="mt-4 rounded-2xl border p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, summary, rules..."
              className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <select
              name="category"
              defaultValue={category}
              className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">All categories</option>
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
              defaultValue={rarity}
              className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
            >
              <option value="">All rarities</option>
              {["common", "uncommon", "rare", "very_rare", "legendary", "artifact"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Weaponizable</label>
              <select
                name="weaponizable"
                defaultValue={weaponizable}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Any</option>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Active</label>
              <select
                name="active"
                defaultValue={active}
                className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">Any</option>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
            type="submit"
          >
            Apply
          </button>
          <Link
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
            href="/admin/items"
          >
            Reset
          </Link>
        </div>
      </form>

      {/* Cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {itemsWithImages.map((it: any) => {
          const weight =
            it.weight_lb != null ? `${Number(it.weight_lb).toFixed(2)} lb` : "—";

          const thumbSrc = it.__img?.thumbUrl ?? it.image_url ?? null;

          return (
            <div
              key={it.id}
              className="rounded-2xl border p-3 shadow-sm hover:shadow"
            >
              <div className="flex gap-3">
                {/* Image */}
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border bg-muted">
                  {thumbSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbSrc}
                      alt={it.__img?.alt ?? it.name ?? "Item"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No Image
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {it.name}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className={categoryPill(it.category || "misc")}>
                          {it.category || "misc"}
                        </span>
                        {it.rarity ? (
                          <span className={rarityPill(it.rarity)}>{it.rarity}</span>
                        ) : null}
                      </div>
                    </div>

                    {/* Existing cookie-based open action */}
                    <Link
                        href="/admin/items/edit"
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
                        aria-label={`Edit ${it.name}`}
                        >
                        Edit →
                    </Link>

                  </div>

                  <div className="mt-2 text-sm text-muted-foreground">
                    {it.summary || "No summary"}
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="mr-3">Weight: {weight}</span>
                    <span>
                      Effects:{" "}
                      {it.effects_count ? (
                        <span className="font-medium text-foreground">
                          {it.effects_preview}
                        </span>
                      ) : (
                        <span className="italic">none</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
