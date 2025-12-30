import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { updateTraitAction, deleteTraitAction } from "@/app/actions/traitsAdmin";

function isUuid(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
  );
}

export default async function TraitEditPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const id = searchParams?.id ?? "";

  if (!isUuid(id)) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait not found</h1>
        <p className="mt-2 text-slate-700">
          Missing or invalid <code className="rounded bg-slate-100 px-1">?id=</code> in URL.
        </p>
        <pre className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          {JSON.stringify({ id }, null, 2)}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const supabase = await createClient();

  const { data: trait, error } = await supabase
    .from("traits")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !trait) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">Trait could not load</h1>
        <pre className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm overflow-auto">
          {JSON.stringify(
            {
              id,
              error: error?.message ?? null,
              hint: (error as any)?.hint ?? null,
              details: (error as any)?.details ?? null,
              returnedTrait: !!trait,
            },
            null,
            2
          )}
        </pre>
        <Link
          href="/admin/traits"
          className="mt-4 inline-block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          ← Back to Traits
        </Link>
      </div>
    );
  }

  const tagStr = Array.isArray(trait.tags) ? trait.tags.join(", ") : "";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Edit Trait</h1>
          <p className="text-slate-700">Update this trait in your global library.</p>
        </div>
        <Link
          href="/admin/traits"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          ← Back
        </Link>
      </div>

      <form
        action={updateTraitAction}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="id" value={trait.id} />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Name</span>
            <input
              name="name"
              required
              defaultValue={trait.name ?? ""}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Type</span>
            <select
              name="type"
              defaultValue={trait.type ?? "nature"}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="nature">Nature</option>
              <option value="training">Training</option>
              <option value="affliction">Affliction</option>
              <option value="calling">Calling</option>
              <option value="office">Office</option>
            </select>
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-900">Summary</span>
          <textarea
            name="summary"
            rows={2}
            defaultValue={trait.summary ?? ""}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Trigger</span>
            <textarea
              name="trigger"
              rows={3}
              defaultValue={trait.trigger ?? ""}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Mechanical Effect</span>
            <textarea
              name="mechanical_effect"
              rows={3}
              defaultValue={trait.mechanical_effect ?? ""}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Narrative Signal</span>
            <textarea
              name="narrative_signal"
              rows={3}
              defaultValue={trait.narrative_signal ?? ""}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Growth Condition</span>
            <textarea
              name="growth_condition"
              rows={3}
              defaultValue={trait.growth_condition ?? ""}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-900">Tags (comma separated)</span>
          <input
            name="tags"
            defaultValue={tagStr}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={!!trait.is_active}
            className="h-4 w-4 rounded border-slate-300"
          />
          Active
        </label>

        <div className="mt-5 flex items-center justify-end">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
            Save Changes
          </button>
        </div>
      </form>

      <form action={deleteTraitAction} className="mt-3">
        <input type="hidden" name="id" value={trait.id} />
        <button className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 shadow-sm hover:bg-red-100">
          Delete Trait
        </button>
      </form>
    </div>
  );
}
