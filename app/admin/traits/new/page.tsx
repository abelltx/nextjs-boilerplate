import Link from "next/link";
import { createTraitAction } from "@/app/actions/traitsAdmin";

export default function NewTraitPage() {
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Trait</h1>
          <p className="text-slate-700">Create a reusable trait for your library.</p>
        </div>
        <Link
          href="/admin/traits"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
        >
          ← Back
        </Link>
      </div>

      <form
        action={createTraitAction}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Name</span>
            <input
              name="name"
              required
              placeholder="Fear of Fire"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Type</span>
            <select
              name="type"
              defaultValue="nature"
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
            placeholder="Short one-liner describing what this trait means."
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">Trigger</span>
            <textarea
              name="trigger"
              rows={3}
              placeholder="When an open flame is within 10 ft…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">
              Mechanical Effect
            </span>
            <textarea
              name="mechanical_effect"
              rows={3}
              placeholder="Disadvantage on WIS checks; cannot take reaction if panicked…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">
              Narrative Signal
            </span>
            <textarea
              name="narrative_signal"
              rows={3}
              placeholder="Avoids firelight, hesitates, goes quiet…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate-900">
              Growth Condition
            </span>
            <textarea
              name="growth_condition"
              rows={3}
              placeholder="Removed after confronting fire in a meaningful scene…"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
            />
          </label>
        </div>

        <label className="mt-4 flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate-900">
            Tags (comma separated)
          </span>
          <input
            name="tags"
            placeholder="fear, courage, trauma"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none focus:ring-2 focus:ring-slate-300"
          />
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked
            className="h-4 w-4 rounded border-slate-300"
          />
          Active
        </label>

        <div className="mt-5 flex items-center justify-end">
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
            Create Trait
          </button>
        </div>
      </form>
    </div>
  );
}
