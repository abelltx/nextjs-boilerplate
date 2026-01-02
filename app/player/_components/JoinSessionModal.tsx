"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { joinSessionAction } from "../actions";

export default function JoinSessionModal(props: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Join a Session</div>
          <button className="text-xs text-neutral-300 hover:text-white" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="mt-3 text-sm text-neutral-300">Paste a join code (or a session ID).</div>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Join code…"
          className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-600"
        />

        {err ? <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">{err}</div> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-xl border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            onClick={() => {
              setErr(null);
              setCode("");
              props.onClose();
            }}
          >
            Cancel
          </button>

          <button
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-60"
            disabled={isPending}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                try {
                  const res = await joinSessionAction(code.trim());
                  if (res?.ok) {
                    props.onClose();
                    router.refresh(); // refresh hub data
                  } else {
                    setErr(res?.error ?? "Unable to join session.");
                  }
                } catch (e: any) {
                  setErr(e?.message ?? "Unable to join session.");
                }
              });
            }}
          >
            {isPending ? "Joining…" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}
