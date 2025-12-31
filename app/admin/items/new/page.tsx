import Link from "next/link";
import { createItemAction } from "@/app/admin/items/new/actions";

export default async function NewItemPage() {
  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">New Item</h1>
            <p className="text-sm text-muted-foreground">Create an item, then you’ll be redirected to edit.</p>
          </div>
          <Link className="rounded-lg border px-3 py-2 text-sm hover:bg-muted" href="/admin/items">
            ← Back
          </Link>
        </div>

        <form action={createItemAction} className="mt-4 rounded-2xl border p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Name</label>
              <input name="name" className="mt-1 h-9 w-full rounded-md border px-3 text-sm" placeholder="Ring of Quiet Steps" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Category</label>
              <select name="category" defaultValue="gear" className="mt-1 h-9 w-full rounded-md border px-2 text-sm">
                {["loot","gear","consumable","weapon","armor","tool","quest","misc"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Rarity</label>
              <select name="rarity" defaultValue="" className="mt-1 h-9 w-full rounded-md border px-2 text-sm">
                <option value="">—</option>
                {["common","uncommon","rare","very_rare","legendary","artifact"].map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Summary</label>
              <input name="summary" className="mt-1 h-9 w-full rounded-md border px-3 text-sm" placeholder="A simple item description shown on cards." />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button className="rounded-lg border px-4 py-2 text-sm hover:bg-muted" type="submit">
              Create Item
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
