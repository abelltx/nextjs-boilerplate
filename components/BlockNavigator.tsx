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
};

export default function BlockNavigator({
  sessionId,
  blocks,
}: {
  sessionId: string;
  blocks: Block[];
}) {
  const [idx, setIdx] = useState(0);
  const [isPending, startTransition] = useTransition();

  // ST sees all blocks; players only see what you present.
  const ordered = useMemo(() => [...blocks].sort((a, b) => a.sort_order - b.sort_order), [blocks]);
  const current = ordered[idx];

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase text-gray-500">Episode Blocks</div>
          <div className="text-sm font-semibold">
            {current ? `#${current.sort_order} • ${current.block_type} • ${current.audience} • ${current.mode}` : "No blocks"}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded border text-sm disabled:opacity-50"
            disabled={isPending || idx <= 0}
            onClick={() => setIdx((v) => Math.max(0, v - 1))}
          >
            Prev
          </button>
          <button
            className="px-3 py-2 rounded border text-sm disabled:opacity-50"
            disabled={isPending || idx >= ordered.length - 1}
            onClick={() => setIdx((v) => Math.min(ordered.length - 1, v + 1))}
          >
            Next
          </button>
        </div>
      </div>

      {current ? (
        <>
          {current.title ? <div className="font-semibold">{current.title}</div> : null}
          {current.body ? <div className="text-sm whitespace-pre-wrap">{current.body}</div> : null}
          {current.image_url ? <div className="text-xs text-gray-600 break-all">Image: {current.image_url}</div> : null}

          <div className="flex gap-2 flex-wrap">
            <button
              className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await presentBlockToPlayersAction(sessionId, current.id);
                })
              }
            >
              Present to Players
            </button>

            <button
              className="px-3 py-2 rounded border text-sm disabled:opacity-50"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await clearPresentedAction(sessionId);
                })
              }
            >
              Clear Player View
            </button>
          </div>
        </>
      ) : (
        <div className="text-sm text-gray-600">Add blocks in the episode editor (admin).</div>
      )}
    </div>
  );
}
