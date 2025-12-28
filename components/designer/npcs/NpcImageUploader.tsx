"use client";

import { useState } from "react";
import { npcClearImageMetaAction, npcSetImageMetaAction } from "@/app/actions/npcs";

export default function NpcImageUploader({ npc }: { npc: any }) {
  const [busy, setBusy] = useState(false);

  async function onRemove() {
    setBusy(true);
    try {
      // TODO: delete Storage folder files: npc-images/<id>/*
      await npcClearImageMetaAction(npc.id);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  async function onFakeSet() {
    setBusy(true);
    try {
      await npcSetImageMetaAction(npc.id, npc.image_alt ?? null);
      window.location.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div>
        {npc.mediumUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={npc.mediumUrl}
            alt={npc.image_alt ?? npc.name}
            width={167}
            height={215}
            className="rounded-lg border object-cover"
          />
        ) : (
          <div className="w-[167px] h-[215px] rounded-lg border bg-muted/40" />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Upload + auto-crop + thumbnail generation will go here next.
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onFakeSet}
            className="px-3 py-2 rounded-lg border hover:bg-muted/40"
          >
            Replace image (next)
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onRemove}
            className="px-3 py-2 rounded-lg border hover:bg-muted/40"
          >
            Remove image
          </button>
        </div>
      </div>
    </div>
  );
}
