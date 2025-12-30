import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { updateTraitAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

export default async function EditTraitPage({
  searchParams,
}: {
  searchParams?: { err?: string };
}) {
  const c = await cookies();
  const id = c.get("trait_edit_id")?.value ?? "";

  if (!isUuid(id)) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">
          Missing or invalid trait id (cookie not set).
        </p>
        <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
{JSON.stringify({ debug: { trait_edit_id: id || null } }, null, 2)}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: trait, error } = await supabase
    .from("traits")
    .select("id,name,type,summary,tags,is_active,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error || !trait) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">
          This trait does not exist or you don’t have access.
        </p>
        <pre className="mt-4 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
{JSON.stringify({ id, error: error?.message ?? null }, null, 2)}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block text-sm font-semibold text-slate-700 underline"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const err = (searchParams?.err ?? "").trim();
  const tagsCsv = Array.isArray(trait.tags) ? trait.tags.join(", ") : "";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Trait</h1>
          <p className="text-sm text-slate-600">Trait ID: {trait.id}</p>
        </div>
        <Link
          href="/admin/traits"
          className="text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          ← Back
        </Link>
      </div>

      {err ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <b>Save failed:</b> {err}
          <div className="mt-1 text-xs text-red-700">
            If this mentions permissions/RLS, your update policy is blocking writes.
          </div>
        </div>
      ) : null}

      <form
        action={updateTraitAction}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <input type="hidden" name="id" value={trait.id} />

        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Name
            </label>
            <input
              name="name"
              defaultValue={trait.name ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Type
            </label>
            <select
              name="type"
              defaultValue={trait.type ?? "nature"}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="nature">Nature</option>
              <option value="training">Training</option>
              <option value="affliction">Affliction</option>
              <option value="calling">Calling</option>
              <option value="office">Office</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Summary
            </label>
            <textarea
              name="summary"
              defaultValue={trait.summary ?? ""}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Tags (comma-separated)
            </label>
            <input
              name="tags"
              defaultValue={tagsCsv}
              placeholder="e.g. stealth, desert, priest"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={!!trait.is_active}
              className="h-4 w-4"
            />
            Active
          </label>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Updated: {trait.updated_at ?? "—"}
            </div>

            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Save Changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
