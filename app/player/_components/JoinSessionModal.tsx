"use client";

import { useState, useTransition } from "react";
import { joinSessionAction } from "../actions";

export default function JoinSessionModal(props: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Join a Session</div>
          <button className="text-sm text-neutral-300 hover:text-white" onClick={props.onClose}>
            Close
          </button>
        </div>

        <div className="mt-3 text-sm text-neutral-300">
          Paste a join code (or a session ID).
        </div>

        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Join code…"
          className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none focus:border-neutral-600"
        />

        {err ? <div className="mt-2 text-sm text-red-200">{err}</div> : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            className="rounded-xl border border-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-900"
            onClick={props.onClose}
          >
            Cancel
          </button>

          <button
            className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
            disabled={isPending || code.trim().length === 0}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                try {
                  const res = await joinSessionAction(code.trim());
                  if (res?.ok && res.sessionId) {
                    window.location.href = `/player/sessions/${res.sessionId}`;
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
