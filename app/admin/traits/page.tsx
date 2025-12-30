import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { openTraitEditAction } from "./edit/actions";

type TraitRow = {
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
    case "affliction":
      return `${base} border-red-200 bg-red-50 text-red-800`;
    case "training":
      return `${base} border-blue-200 bg-blue-50 text-blue-800`;
    case "calling":
      return `${base} border-green-200 bg-green-50 text-green-800`;
    case "office":
      return `${base} border-amber-200 bg-amber-50 text-amber-800`;
    default:
      return `${base} border-slate-200 bg-slate-50 text-slate-800`;
  }
}

export default async function TraitsPage({
  searchParams,
}: {
  searchParams?: { q?: string; type?: string };
}) {
  const supabase = await createClient();
  const q = (searchParams?.q ?? "").trim();
  const type = (searchParams?.type ?? "").trim();

  let query = supabase
    .from("traits")
    .select("id,name,type,summary,tags,is_active,updated_at")
    .order("updated_at", { ascending: false });

  if (q) query = query.ilike("name", `%${q}%`);
  if (type) query = query.eq("type", type);

  const [{ data }, { count }] = await Promise.all([
    query,
    supabase.from("traits").select("*", { count: "exact", head: true }),
  ]);

  const rows = (data ?? []) as TraitRow[];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-5 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Traits Designer</h1>
            <p className="text-slate-700">
              Global trait library used across NPCs, players, and episodes.
            </p>
          </div>
          <Link
            href="/admin/traits/new"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            + New Trait
          </Link>
        </div>

        <div className="text-sm text-slate-600">
          Total traits: <b className="text-slate-900">{count ?? 0}</b>
        </div>

        <form className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search traits by name…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300 md:max-w-sm"
          />
          <select
            name="type"
            defaultValue={type}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300 md:max-w-xs"
          >
            <option value="">All types</option>
            <option value="nature">Nature</option>
            <option value="training">Training</option>
            <option value="affliction">Affliction</option>
            <option value="calling">Calling</option>
            <option value="office">Office</option>
          </select>

          <button className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50">
            Apply
          </button>

          <Link
            href="/admin/traits"
            className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            Reset
          </Link>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-slate-700">No traits yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((t, idx) => {
            const idStr = typeof t.id === "string" ? t.id : "";
            const valid = isUuid(idStr);

            const card = (
              <div className="group flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-slate-900">
                      {t.name || "Unnamed Trait"}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={typePill(t.type)}>{t.type}</span>
                    </div>
                  </div>

                  <span
                    className={`text-sm font-semibold ${
                      valid
                        ? "text-slate-400 group-hover:text-slate-600"
                        : "text-red-600"
                    }`}
                  >
                    {valid ? "Edit →" : "Invalid ID"}
                  </span>
                </div>

                <p className="line-clamp-3 text-sm text-slate-700">
                  {t.summary || "No summary yet."}
                </p>
              </div>
            );

            if (!valid) {
              return (
                <div
                  key={`invalid-${t.name}-${t.updated_at}-${idx}`}
                  className="block"
                >
                  {card}
                </div>
              );
            }

            // ✅ POST FORM: sets cookie then redirects to /admin/traits/edit
            return (
              <form
                key={idStr}
                action={openTraitEditAction}
                className="block"
              >
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
