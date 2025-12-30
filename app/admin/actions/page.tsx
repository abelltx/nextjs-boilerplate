import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { openActionEditAction } from "./edit/actions";

type ActionRow = {
  id: string | null;
  name: string;
  type: string;
  summary: string | null;
  tags: string[] | null;
  is_active: boolean;
  updated_at: string;
};

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function typePill(t: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";
  switch (t) {
    case "melee":
      return `${base} border-red-200 bg-red-50 text-red-800`;
    case "ranged":
      return `${base} border-blue-200 bg-blue-50 text-blue-800`;
    default:
      return `${base} border-amber-200 bg-amber-50 text-amber-800`;
  }
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams?: { q?: string; type?: string; saved?: string; deleted?: string; err?: string };
}) {
  const supabase = await createClient();

  const q = (searchParams?.q ?? "").trim();
  const type = (searchParams?.type ?? "").trim();
  const saved = (searchParams?.saved ?? "").trim();
  const deleted = (searchParams?.deleted ?? "").trim();
  const err = (searchParams?.err ?? "").trim();

  let query = supabase
    .from("actions")
    .select("id,name,type,summary,tags,is_active,updated_at")
    .order("updated_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);
  if (type) query = query.eq("type", type);

  const [{ data }, { count }] = await Promise.all([
    query,
    supabase.from("actions").select("*", { count: "exact", head: true }),
  ]);

  const rows = (data ?? []) as ActionRow[];

  return (
    <div className="mx-auto w-full max-w-6xl p-6 space-y-4">
      {/* Header (slimmer like Traits) */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Actions Designer</h1>
          <p className="text-sm text-muted-foreground">
            Global action library used across NPCs and encounters.
          </p>
        </div>
        <Link
          href="/admin/actions/new"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          + New Action
        </Link>
      </div>

      {/* Alerts */}
      {saved ? (
        <div className="rounded-lg border p-3 text-sm">✅ Saved.</div>
      ) : null}
      {deleted ? (
        <div className="rounded-lg border p-3 text-sm">🗑️ Deleted.</div>
      ) : null}
      {err ? (
        <div className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      {/* Slim filter bar */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Search</span>
          <input
            name="q"
            defaultValue={q}
            className="w-[260px] rounded-lg border px-3 py-2 text-sm"
            placeholder="Action name…"
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Type</span>
          <select
            name="type"
            defaultValue={type}
            className="w-[160px] rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="melee">melee</option>
            <option value="ranged">ranged</option>
            <option value="other">other</option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Apply
        </button>

        <Link
          href="/admin/actions"
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Reset
        </Link>

        <div className="ml-auto text-sm text-muted-foreground">
          Total actions: <span className="font-medium">{count ?? 0}</span>
        </div>
      </form>

      {/* Compact library grid (like Traits) */}
      {rows.length === 0 ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">
          No actions yet. Create your first one.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((a) => {
            const idStr = typeof a.id === "string" ? a.id : "";
            const valid = isUuid(idStr);

            const card = (
              <div className="rounded-xl border bg-card p-3 shadow-sm hover:bg-muted/30 transition">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">
                      {a.name || "Unnamed Action"}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={typePill(a.type || "other")}>
                        {a.type || "other"}
                      </span>
                      {!a.is_active ? (
                        <span className="text-xs text-muted-foreground">inactive</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {valid ? "Edit →" : "Invalid ID"}
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground line-clamp-2">
                  {a.summary || "No summary yet."}
                </p>

                {/* optional tiny tags (kept minimal) */}
                {Array.isArray(a.tags) && a.tags.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                    {a.tags.length > 2 ? (
                      <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                        +{a.tags.length - 2}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );

            if (!valid) return <div key={a.name}>{card}</div>;

            // ✅ POST FORM: sets cookie then redirects to /admin/actions/edit
            return (
              <form key={idStr} action={openActionEditAction}>
                <input type="hidden" name="id" value={idStr} />
                <button type="submit" className="block w-full text-left">
                  {card}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}
