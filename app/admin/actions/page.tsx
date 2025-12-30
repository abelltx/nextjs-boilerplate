import { createClient } from "@/utils/supabase/server";
import { openActionEditAction } from "./edit/actions";

function typeStyles(type: string) {
  switch (type) {
    case "melee":
      return {
        pill: "border-red-200 bg-red-50 text-red-700",
        bar: "bg-red-200",
      };
    case "ranged":
      return {
        pill: "border-blue-200 bg-blue-50 text-blue-700",
        bar: "bg-blue-200",
      };
    default:
      return {
        pill: "border-amber-200 bg-amber-50 text-amber-700",
        bar: "bg-amber-200",
      };
  }
}

function TypePill({ type }: { type: string }) {
  const s = typeStyles(type);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.pill}`}
    >
      {type}
    </span>
  );
}

function isUuid(v: unknown) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export default async function ActionsListPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const type = typeof sp.type === "string" ? sp.type.trim() : "";
  const saved = typeof sp.saved === "string" ? sp.saved : "";
  const err = typeof sp.err === "string" ? sp.err : "";

  const supabase = await createClient();

  let query = supabase
    .from("actions")
    .select("*", { count: "exact" })
    .order("updated_at", { ascending: false });

  if (q) {
    query = query.or(`name.ilike.%${q}%,summary.ilike.%${q}%,rules_text.ilike.%${q}%`);
  }
  if (type && ["melee", "ranged", "other"].includes(type)) {
    query = query.eq("type", type);
  }

  const { data: actions, count, error } = await query;

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Actions</h1>
        <div className="mt-4 rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {error.message}
        </div>
      </div>
    );
  }

  const meleeCount = (actions ?? []).filter((a: any) => a.type === "melee").length;
  const rangedCount = (actions ?? []).filter((a: any) => a.type === "ranged").length;
  const otherCount = (actions ?? []).filter((a: any) => a.type === "other").length;

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Actions Library</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border px-2 py-1">
              Total: <span className="font-medium">{count ?? 0}</span>
            </span>
            <span className="rounded-full border px-2 py-1">
              Melee: <span className="font-medium">{meleeCount}</span>
            </span>
            <span className="rounded-full border px-2 py-1">
              Ranged: <span className="font-medium">{rangedCount}</span>
            </span>
            <span className="rounded-full border px-2 py-1">
              Other: <span className="font-medium">{otherCount}</span>
            </span>
          </div>
        </div>

        <a
          className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted"
          href="/admin/actions/new"
        >
          + New Action
        </a>
      </div>

      {saved ? (
        <div className="rounded-lg border p-3 text-sm">✅ Saved.</div>
      ) : null}

      {err ? (
        <div className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      <form
        method="get"
        className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center"
      >
        <div className="flex flex-1 items-center gap-2">
          <div className="flex-1">
            <input
              name="q"
              defaultValue={q}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Search actions…"
            />
          </div>

          <select
            name="type"
            defaultValue={type}
            className="w-full rounded-lg border px-3 py-2 text-sm sm:w-[160px]"
          >
            <option value="">All types</option>
            <option value="melee">melee</option>
            <option value="ranged">ranged</option>
            <option value="other">other</option>
          </select>

          <button
            type="submit"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Filter
          </button>
        </div>

        {(q || type) && (
          <a
            className="text-sm underline text-muted-foreground hover:text-foreground"
            href="/admin/actions"
          >
            Clear
          </a>
        )}
      </form>

      {/* Library-style grid wrapper */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {(actions ?? []).map((a: any) => {
          const id = String(a.id ?? "");
          const valid = isUuid(id);

          const t = String(a.type ?? "other");
          const s = typeStyles(t);

          return (
            <div
              key={id || a.name}
              className="group relative overflow-hidden rounded-2xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {/* top accent bar */}
              <div className={`h-1 w-full ${s.bar}`} />

              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold truncate">{a.name}</div>
                      <TypePill type={t} />
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      {a.is_active ? "Active" : "Inactive"}
                      {" · "}
                      Updated{" "}
                      {a.updated_at ? new Date(a.updated_at).toLocaleDateString() : "—"}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground opacity-0 transition group-hover:opacity-100">
                    Edit →
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground line-clamp-3">
                  {a.summary || a.rules_text || "No description yet."}
                </p>

                <div className="mt-4 flex items-center justify-between gap-3">
                  {Array.isArray(a.tags) && a.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {a.tags.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      {a.tags.length > 3 ? (
                        <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                          +{a.tags.length - 3}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No tags</span>
                  )}

                  {valid ? (
                    <form action={openActionEditAction}>
                      <input type="hidden" name="id" value={id} />
                      <button
                        type="submit"
                        className="inline-flex items-center rounded-lg border px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted"
                      >
                        Open
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-muted-foreground">Invalid ID</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
