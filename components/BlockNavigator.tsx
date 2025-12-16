"use client";

import { useMemo, useState, useTransition } from "react";
import { presentBlockToPlayersAction, clearPresentedAction } from "@/app/actions/present";

type Block = {
  id: string;
  sort_order: number;
  block_type: string;
  audience: string;
  mode: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  meta?: any; // jsonb
};

function EncounterRunner({ block }: { block: Block }) {
  // Phase 1: render structured data + allow simple HP tracking locally (not persisted yet)
  const monsters: Array<any> = block.meta?.monsters ?? [];
  const [hp, setHp] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (let i = 0; i < monsters.length; i++) {
      const key = monsters[i]?.id ?? `${i}`;
      seed[key] = Number(monsters[i]?.hp ?? 0);
    }
    return seed;
  });

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-gray-50">
      <div className="text-xs uppercase text-gray-500">Encounter Runner (Phase 1)</div>

      {block.meta?.notes ? (
        <div className="text-sm whitespace-pre-wrap">
          <span className="font-semibold">Notes:</span> {block.meta.notes}
        </div>
      ) : null}

      {monsters.length === 0 ? (
        <div className="text-sm text-gray-600">
          No monsters configured. Add to block.meta.monsters.
        </div>
      ) : (
        <div className="space-y-2">
          {monsters.map((m, i) => {
            const key = m?.id ?? `${i}`;
            const name = m?.name ?? `Monster ${i + 1}`;
            const ac = m?.ac ?? "—";
            const maxHp = Number(m?.hp ?? 0);
            const atk = m?.attack ?? "—";
            const dmg = m?.damage ?? "—";
            const curHp = hp[key] ?? maxHp;

            return (
              <div key={key} className="border rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{name}</div>
                    <div className="text-xs text-gray-600">
                      AC {ac} • ATK {atk} • DMG {dmg}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs uppercase text-gray-500">HP</div>
                    <div className="font-mono text-lg">
                      {curHp} / {maxHp}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="px-2 py-1 rounded border text-sm"
                    onClick={() => setHp((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? maxHp) - 1) }))}
                  >
                    -1
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-sm"
                    onClick={() => setHp((prev) => ({ ...prev, [key]: Math.max(0, (prev[key] ?? maxHp) - 5) }))}
                  >
                    -5
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-sm"
                    onClick={() => setHp((prev) => ({ ...prev, [key]: (prev[key] ?? maxHp) + 5 }))}
                  >
                    +5
                  </button>
                  <button
                    className="px-2 py-1 rounded border text-sm"
                    onClick={() => setHp((prev) => ({ ...prev, [key]: maxHp }))}
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs text-gray-500">
        Phase 1 = local tracking only. Next step is persisting encounter runtime state to session-scoped tables.
      </div>
    </div>
  );
}

export default function BlockNavigator({
  sessionId,
  blocks,
}: {
  sessionId: string;
  blocks: Block[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ordered = useMemo(
    () => [...blocks].sort((a, b) => a.sort_order - b.sort_order),
    [blocks]
  );

  const selected =
    ordered.find((b) => b.id === selectedId) ?? ordered[0] ?? null;

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase text-gray-500">Episode Blocks</div>
          <div className="text-sm font-semibold">
            {selected
              ? `#${selected.sort_order} • ${selected.block_type} • ${selected.audience} • ${selected.mode}`
              : "No blocks"}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded border text-sm disabled:opacity-50"
            disabled={isPending || ordered.length === 0}
            onClick={() =>
              startTransition(async () => {
                await clearPresentedAction(sessionId);
              })
            }
          >
            Clear Player View
          </button>

          {selected ? (
            <button
              className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await presentBlockToPlayersAction(sessionId, selected.id);
                })
              }
            >
              Present Selected
            </button>
          ) : null}
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="text-sm text-gray-600">Add blocks in the episode editor (admin).</div>
      ) : (
        <div className="space-y-2">
          {ordered.map((b, i) => {
            const isSel = selected?.id === b.id;
            return (
              <details
                key={b.id}
                open={isSel}
                className={`border rounded-lg p-2 ${isSel ? "bg-gray-50" : ""}`}
                onClick={() => setSelectedId(b.id)}
              >
                <summary className="cursor-pointer flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="text-gray-500 mr-2">{i + 1} of {ordered.length}</span>
                    <span className="font-semibold">{b.block_type}</span>
                    {b.title ? ` — ${b.title}` : ""}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">#{b.sort_order}</div>
                </summary>

                <div className="mt-2 space-y-2">
                  {b.body ? <div className="text-sm whitespace-pre-wrap">{b.body}</div> : null}

                  {b.image_url ? (
                    <div className="rounded border overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={b.image_url} alt="Block" className="w-full h-auto" />
                    </div>
                  ) : null}

                  {String(b.block_type).toUpperCase() === "ENCOUNTER" ? (
                    <EncounterRunner block={b} />
                  ) : null}

                  <div className="flex gap-2 flex-wrap">
                    <button
                      className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
                      disabled={isPending}
                      onClick={() =>
                        startTransition(async () => {
                          await presentBlockToPlayersAction(sessionId, b.id);
                        })
                      }
                    >
                      Present to Players
                    </button>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
