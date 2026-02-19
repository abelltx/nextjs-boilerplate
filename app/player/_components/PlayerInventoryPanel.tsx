"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
    max_stack: number | null;
    image_url: string | null;
    image_base_path: string | null;
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
function safeMaxStack(row: ItemRow) {
  const v = Number(row.item?.max_stack ?? NaN);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : null;
}
function safeImageUrl(row: ItemRow) {
  const v = row.item?.image_url;
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export default function PlayerInventoryPanel({ characterId }: { characterId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<ItemRow[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

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
          stackable,
          max_stack,
          image_url,
          image_base_path
        )
      `
      )
      .eq("character_id", characterId)
      .order("created_at", { ascending: false });

    if (error) {
      setErr(error.message);
      setRows([]);
      setThumbUrls({});
    } else {
      const nextRows = (data as any) ?? [];
      setRows(nextRows);

      const rowsWithBase = nextRows.filter((r: ItemRow) => {
        const base = r.item?.image_base_path;
        return typeof base === "string" && base.trim().length > 0;
      });

      if (!rowsWithBase.length) {
        setThumbUrls({});
      } else {
        const pairs = await Promise.all(
          rowsWithBase.map(async (r: ItemRow) => {
            const base = String(r.item?.image_base_path ?? "");
            const path = base.endsWith("/") ? `${base}thumb.webp` : `${base}/thumb.webp`;
            const { data: signed } = await supabase.storage.from("item-images").createSignedUrl(path, 60 * 30);
            return [r.id, signed?.signedUrl ?? ""] as const;
          })
        );

        const nextThumbs: Record<string, string> = {};
        for (const [rowId, url] of pairs) {
          if (url) nextThumbs[rowId] = url;
        }
        setThumbUrls(nextThumbs);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!characterId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterId]);

  useEffect(() => {
    const onRefresh = () => {
      void load();
    };
    window.addEventListener("inventory:refresh", onRefresh as EventListener);
    return () => {
      window.removeEventListener("inventory:refresh", onRefresh as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onOpenItem = (evt: Event) => {
      const custom = evt as CustomEvent<{ itemId?: string }>;
      const rawId = String(custom?.detail?.itemId ?? "").trim().toLowerCase();
      if (!rawId) return;
      const found = rows.find((r) => String(r.item_id ?? "").trim().toLowerCase() === rawId);
      if (found) setSelected(found);
    };
    window.addEventListener("inventory:open-item", onOpenItem as EventListener);
    return () => {
      window.removeEventListener("inventory:open-item", onOpenItem as EventListener);
    };
  }, [rows]);

  const filtered = rows;

    async function setEquipped(row: ItemRow, equipped: boolean) {
    setBusyId(row.id);
    setErr(null);

    const { error } = await supabase.rpc("set_inventory_equipped", {
        p_inventory_item_id: row.id,
        p_equipped: equipped,
    });

    if (error) setErr(error.message);

    await load();
    if (!error) router.refresh();

    // keep drawer in sync (use fresh data, not stale `rows`)
    if (selected?.id === row.id) {
        setSelected((prev: any) => (prev ? { ...prev, equipped } : prev));
    }

    setBusyId(null);
    }


  async function dropOne(row: ItemRow) {
    const name = safeName(row);
    const qtyHint =
      row.quantity > 1 && safeStackable(row)
        ? "This will sell 1 unit from the stack."
        : "This will sell this item.";
    const typed = window.prompt(
      `Sell item: ${name}\n${qtyHint}\n\nType SELL to confirm.`
    );
    if (typed !== "SELL") return;

    setBusyId(row.id);
    setErr(null);
    let hadError = false;

    if (row.quantity > 1 && safeStackable(row)) {
      const { error } = await supabase
        .from("inventory_items")
        .update({ quantity: row.quantity - 1 })
        .eq("id", row.id);

      if (error) {
        hadError = true;
        setErr(error.message);
      }
    } else {
      // Non-stackable items should usually have quantity 1 anyway.
      // If quantity is 1, delete row.
      const { error } = await supabase.from("inventory_items").delete().eq("id", row.id);
      if (error) {
        hadError = true;
        setErr(error.message);
      }
      if (selected?.id === row.id) setSelected(null);
    }

    await load();
    if (!hadError) router.refresh();
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
      <div className="flex justify-end">
        <div className="text-sm opacity-80">
          {loading ? "Loading..." : `${filtered.length} item${filtered.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          {err}
        </div>
      )}

      <div className="mt-4 rounded-xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs opacity-70 border-b">
          <div className="col-span-4">Item</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-1 text-center">Qty</div>
          <div className="col-span-1 text-center">Eq</div>
          <div className="col-span-4 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="px-3 py-6 text-sm opacity-70">Loading inventory...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-6 text-sm opacity-70">No items found.</div>
        ) : (
          filtered.map((r) => {
            const name = safeName(r);
            const t = safeType(r);
            const stackable = safeStackable(r);
            const maxStack = safeMaxStack(r);
            const isAtMax = Boolean(stackable && maxStack && r.quantity >= maxStack);
            const busy = busyId === r.id;

            return (
              <div
                key={r.id}
                className="grid grid-cols-12 gap-2 px-3 py-3 border-b last:border-b-0 hover:bg-muted/40 cursor-pointer"
                onClick={() => setSelected(r)}
              >
                <div className="col-span-4">
                  <div className="flex items-center gap-3">
                    {(thumbUrls[r.id] || safeImageUrl(r)) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumbUrls[r.id] || (safeImageUrl(r) as string)}
                        alt={name}
                        className="h-9 w-9 rounded-md border border-neutral-700 object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900 text-xs font-semibold text-neutral-300">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-xs opacity-70">
                        {stackable ? (maxStack ? `Stackable (Max ${maxStack})` : "Stackable") : "Not stackable"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-span-2 truncate text-sm" title={t}>{t}</div>

                <div className="col-span-1 text-center text-sm">
                  <div className="inline-flex items-center gap-1">
                    <span>{stackable && maxStack ? `${r.quantity}/${maxStack}` : r.quantity}</span>
                    {isAtMax ? (
                      <span className="rounded border border-amber-400/70 bg-amber-500/20 px-1 py-0 text-[10px] font-semibold text-amber-200">
                        MAX
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="col-span-1 text-center text-sm">
                  {r.equipped ? "Yes" : "-"}
                </div>

                <div className="col-span-4 flex flex-nowrap justify-end gap-1">
                  <button
                    className="whitespace-nowrap rounded-md border px-2 py-1 text-xs"
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
                      className="whitespace-nowrap rounded-md border px-2 py-1 text-xs"
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
                      className="whitespace-nowrap rounded-md border px-2 py-1 text-xs"
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
                    className="whitespace-nowrap rounded-md border px-2 py-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      dropOne(r);
                    }}
                    disabled={busy}
                  >
                    Sell
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
                {(() => {
                  const selectedMax = safeMaxStack(selected);
                  const selectedAtMax = Boolean(safeStackable(selected) && selectedMax && selected.quantity >= selectedMax);
                  return (
                    <>
                <div>
                  <div className="text-xs opacity-70">Quantity</div>
                  <div className="text-sm">
                    {safeStackable(selected) && safeMaxStack(selected)
                      ? `${selected.quantity}/${safeMaxStack(selected)}`
                      : selected.quantity}
                  </div>
                </div>
                {selectedAtMax ? (
                  <div>
                    <div className="text-xs opacity-70">Stack Status</div>
                    <div className="inline-flex rounded border border-amber-400/70 bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-200">
                      MAX
                    </div>
                  </div>
                ) : null}
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
                  <div className="text-sm">{selected.equipped_slot ?? "-"}</div>
                </div>
                    </>
                  );
                })()}
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
                  Sell
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

