"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type ItemRow = {
  id: string;
  character_id: string;
  item_id: string | null;
  quantity: number;
  equipped: boolean;
  equipped_slot: string | null;
  created_at: string;

  // Joined item (may be null if item_id is null or FK missing)
  item: null | {
    id: string;
    name: string;
    type: string | null;
    description: string | null;
    stackable: boolean;
  };

  // Fallback legacy column if you kept it (safe)
  name?: string | null;
};

function safeName(row: ItemRow) {
  return row.item?.name ?? row.name ?? "Unknown Item";
}
function safeType(row: ItemRow) {
  return row.item?.type ?? "Uncategorized";
}
function safeDesc(row: ItemRow) {
  return row.item?.description ?? "No description yet.";
}
function safeStackable(row: ItemRow) {
  return row.item?.stackable ?? true;
}

export default function PlayerInventoryPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("All");

  const [selected, setSelected] = useState<ItemRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("inventory_items")
      .select(
        `
        id,
        character_id,
        item_id,
        quantity,
        equipped,
        equipped_slot,
        created_at,
        name,
        item:items (
          id,
          name,
          type,
          description,
          stackable
        )
      `
      )
      .eq("character_id", characterId)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
    } else {
      setRows((data as any) ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!characterId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(safeType(r));
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return rows.filter((r) => {
      const name = safeName(r).toLowerCase();
      const t = safeType(r);
      const matchesQ = !query || name.includes(query);
      const matchesType = type === "All" || t === type;
      return matchesQ && matchesType;
    });
  }, [rows, q, type]);

    async function setEquipped(row: ItemRow, equipped: boolean) {
    setBusyId(row.id);
    setErr(null);

    const { error } = await supabase.rpc("set_inventory_equipped", {
        p_inventory_item_id: row.id,
        p_equipped: equipped,
    });

    if (error) setErr(error.message);

    await load();

    // keep drawer in sync (use fresh data, not stale `rows`)
    if (selected?.id === row.id) {
        setSelected((prev: any) => (prev ? { ...prev, equipped } : prev));
    }

    setBusyId(null);
    }


  async function dropOne(row: ItemRow) {
    setBusyId(row.id);
    setErr(null);

    if (row.quantity > 1 && safeStackable(row)) {
      const { error } = await supabase
        .from("inventory_items")
        .update({ quantity: row.quantity - 1 })
        .eq("id", row.id);

      if (error) setErr(error.message);
    } else {
      // Non-stackable items should usually have quantity 1 anyway.
      // If quantity is 1, delete row.
      const { error } = await supabase.from("inventory_items").delete().eq("id", row.id);
      if (error) setErr(error.message);
      if (selected?.id === row.id) setSelected(null);
    }

    await load();
    setBusyId(null);
  }

  async function useItem(row: ItemRow) {
    // Phase 1 stub: you said this will update Active Effects later.
    // For now, just a placeholder so the UX flow exists.
    // Optional: write to a log table later.
    setSelected(row);
    // If you want "use consumes 1" for consumables later, we can add an items.consumable flag.
  }

  return (
    <div className="w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-col">
            <label className="text-sm opacity-80">Search</label>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name…"
              className="w-full sm:w-72 rounded-md border px-3 py-2 bg-background"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-sm opacity-80">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full sm:w-56 rounded-md border px-3 py-2 bg-background"
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="text-sm opacity-80">
          {loading ? "Loading…" : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          {err}
        </div>
      )}

      <div className="mt-4 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs opacity-70 border-b">
          <div className="col-span-5">Item</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-1 text-center">Qty</div>
          <div className="col-span-1 text-center">Eq</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm opacity-70">Loading inventory…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm opacity-70">No items found.</div>
        ) : (
          filtered.map((r) => {
            const name = safeName(r);
            const t = safeType(r);
            const stackable = safeStackable(r);
            const busy = busyId === r.id;

            return (
              <div
                key={r.id}
                className="grid grid-cols-12 gap-2 px-3 py-3 border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <div className="col-span-5">
                  <div className="font-medium">{name}</div>
                  <div className="text-xs opacity-70">
                    {stackable ? "Stackable" : "Not stackable"}
                  </div>
                </div>

                <div className="col-span-2 text-sm">{t}</div>

                <div className="col-span-1 text-center text-sm">{r.quantity}</div>

                <div className="col-span-1 text-center text-sm">
                  {r.equipped ? "✓" : "—"}
                </div>

                <div className="col-span-3 flex justify-end gap-2">
                  <button
                    className="rounded-md border px-2 py-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      useItem(r);
                    }}
                    disabled={busy}
                    title="Phase 1: stub"
                  >
                    Use
                  </button>

                  {r.equipped ? (
                    <button
                      className="rounded-md border px-2 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEquipped(r, false);
                      }}
                      disabled={busy}
                    >
                      Unequip
                    </button>
                  ) : (
                    <button
                      className="rounded-md border px-2 py-1 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEquipped(r, true);
                      }}
                      disabled={busy}
                    >
                      Equip
                    </button>
                  )}

                  <button
                    className="rounded-md border px-2 py-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      dropOne(r);
                    }}
                    disabled={busy}
                  >
                    Drop
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Drawer (simple, phase 1) */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setSelected(null)}
          />
          <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-white text-gray-900 border-l border-gray-300 shadow-2xl p-5 overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{safeName(selected)}</div>
                <div className="text-sm text-gray-600">{safeType(selected)}</div>
              </div>
              <button
                className="rounded-md border px-2 py-1 text-sm"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs opacity-70">Description</div>
                <div className="text-sm mt-1 whitespace-pre-wrap">{safeDesc(selected)}</div>
              </div>

              <div className="rounded-lg border p-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs opacity-70">Quantity</div>
                  <div className="text-sm">{selected.quantity}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">Equipped</div>
                  <div className="text-sm">{selected.equipped ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">Stackable</div>
                  <div className="text-sm">{safeStackable(selected) ? "Yes" : "No"}</div>
                </div>
                <div>
                  <div className="text-xs opacity-70">Slot</div>
                  <div className="text-sm">{selected.equipped_slot ?? "—"}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="rounded-md border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm font-medium text-gray-900"
                  onClick={() => useItem(selected)}
                >
                  Use (stub)
                </button>

                {selected.equipped ? (
                  <button
                    className="rounded-md border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm font-medium text-gray-900"
                    onClick={() => setEquipped(selected, false)}
                  >
                    Unequip
                  </button>
                ) : (
                  <button
                    className="rounded-md border border-gray-300 bg-gray-100 hover:bg-gray-200 px-3 py-2 text-sm font-medium text-gray-900"
                    onClick={() => setEquipped(selected, true)}
                  >
                    Equip
                  </button>
                )}

                <button
                  className="rounded-md border border-red-300 bg-red-50 hover:bg-red-100 px-3 py-2 text-sm font-medium text-red-700"
                  onClick={() => dropOne(selected)}
                >
                  Drop
                </button>
              </div>

              <div className="text-xs opacity-60">
                Effects / weight / value are Phase 2; this drawer is ready for them.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
