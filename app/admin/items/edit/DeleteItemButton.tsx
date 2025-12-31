"use client";

import { useState } from "react";

export default function DeleteItemButton({
  itemId,
  deleteAction,
}: {
  itemId: string;
  deleteAction: (formData: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action={async (fd) => {
        const ok = confirm("Delete this item? This also deletes all item effects.");
        if (!ok) return;
        setBusy(true);
        await deleteAction(fd);
      }}
    >
      <input type="hidden" name="item_id" value={itemId} />
      <button
        type="submit"
        disabled={busy}
        className="rounded-lg border px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-60"
      >
        {busy ? "Deleting..." : "Delete Item"}
      </button>
    </form>
  );
}
