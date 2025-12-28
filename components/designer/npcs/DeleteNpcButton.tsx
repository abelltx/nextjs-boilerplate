"use client";

import { useTransition } from "react";

export default function DeleteNpcButton({
  npcName,
  onDelete,
}: {
  npcName: string;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="px-3 py-2 rounded-lg border hover:bg-muted/40 disabled:opacity-50"
      onClick={() => {
        const ok = window.confirm(`Delete "${npcName}"?\n\nThis cannot be undone.`);
        if (!ok) return;

        startTransition(async () => {
          await onDelete();
        });
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
