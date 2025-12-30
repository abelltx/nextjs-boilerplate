import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

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

export default async function EditTraitPage() {
  // ✅ Next 16: cookies() can be async in your setup
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

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Name
            </label>
            <input
              defaultValue={trait.name ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              readOnly
            />
            <p className="mt-1 text-xs text-slate-500">
              (Wiring save/update next — this page is currently read-only.)
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Type
            </label>
            <input
              defaultValue={trait.type ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              readOnly
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">
              Summary
            </label>
            <textarea
              defaultValue={trait.summary ?? ""}
              rows={4}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              readOnly
            />
          </div>

          <div className="text-xs text-slate-500">
            Updated: {trait.updated_at ?? "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
