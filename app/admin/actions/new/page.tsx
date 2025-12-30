import { createActionAction } from "./actions";

export default async function ActionNewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const err = typeof sp.err === "string" ? sp.err : undefined;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">New Action</h1>
          <p className="text-sm text-muted-foreground">Create a reusable action in the global library.</p>
        </div>
        <a className="text-sm underline" href="/admin/actions">
          ← Back
        </a>
      </div>

      {err ? (
        <div className="rounded-lg border p-3 text-sm">
          <span className="font-semibold">Error:</span> {err}
        </div>
      ) : null}

      <form action={createActionAction} className="space-y-4">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Name</span>
          <input name="name" className="w-full rounded-md border px-3 py-2" required />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Type</span>
          <select name="type" defaultValue="other" className="w-full rounded-md border px-3 py-2">
            <option value="melee">melee</option>
            <option value="ranged">ranged</option>
            <option value="other">other</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Summary</span>
          <input name="summary" className="w-full rounded-md border px-3 py-2" />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Rules Text</span>
          <textarea name="rules_text" className="min-h-[140px] w-full rounded-md border px-3 py-2" />
        </label>

        <button type="submit" className="rounded-md border px-4 py-2 font-medium">
          Create Action
        </button>
      </form>
    </div>
  );
}
