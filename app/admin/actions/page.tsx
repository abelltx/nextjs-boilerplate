import { createClient } from "@/utils/supabase/server";
import { openActionEditAction } from "./edit/actions";

function typePill(type: string) {
  const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs";
  if (type === "melee") return `${base}`;
  if (type === "ranged") return `${base}`;
  return `${base}`;
}

function isUuid(v: unknown) {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
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

  let query = supabase.from("actions").select("*", { count: "exact" }).order("updated_at", { ascending: false });

  if (q) {
    // simple search: name/summary/rules_text
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Actions</h1>
          <p className="text-sm text-muted-foreground">
            Global library. Total: <span className="font-medium">{count ?? 0}</span>
          </p>
        </div>
        <a className="rounded-md border px-4 py-2 text-sm font-medium" href="/admin/actions/new">
          + New Action
        </a>
      </div>

      {saved ? (
        <div className="rounded-lg border p-3 text-sm">
          ✅ Saved.
        </div>
      ) : null}

      {err ? (
        <div className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border p-4">
        <label className="grid gap-1">
          <span className="text-xs font-medium">Search</span>
          <input
            name="q"
            defaultValue={q}
            className="w-[260px] rounded-md border px-3 py-2 text-sm"
            placeholder="name, summary, rules..."
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs font-medium">Type</span>
          <select name="type" defaultValue={type} className="w-[160px] rounded-md border px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="melee">melee</option>
            <option value="ranged">ranged</option>
            <option value="other">other</option>
          </select>
        </label>

        <button type="submit" className="rounded-md border px-4 py-2 text-sm font-medium">
          Filter
        </button>

        {(q || type) && (
          <a className="text-sm underline" href="/admin/actions">
            Clear
          </a>
        )}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(actions ?? []).map((a: any) => {
          const id = String(a.id ?? "");
          const valid = isUuid(id);
          return (
            <div key={id || a.name} className="rounded-2xl border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{a.name}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={typePill(String(a.type ?? "other"))}>{String(a.type ?? "other")}</span>
                    {!a.is_active ? <span className="text-xs text-muted-foreground">inactive</span> : null}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">Edit →</div>
              </div>

              <p className="mt-3 text-sm text-muted-foreground line-clamp-3">
                {a.summary || a.rules_text || "No description yet."}
              </p>

              <div className="mt-4">
                {valid ? (
                  <form action={openActionEditAction}>
                    <input type="hidden" name="id" value={id} />
                    <button type="submit" className="w-full rounded-md border px-4 py-2 text-sm font-medium">
                      Open
                    </button>
                  </form>
                ) : (
                  <div className="text-xs text-muted-foreground">Invalid ID — cannot open.</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
