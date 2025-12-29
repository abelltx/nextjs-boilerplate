"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
      type="submit"
      disabled={pending}
    >
      {pending ? "Saving..." : "Save Changes"}
    </button>
  );
}

export default function SaveBar() {
  const { pending } = useFormStatus();
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    // When a submit finishes (pending goes true -> false), show "Saved"
    if (!pending) return;
    setJustSaved(false);
  }, [pending]);

  useEffect(() => {
    if (pending) return;

    // If we *just* finished a submit, show Saved ✓ briefly
    // We detect finish by toggling a local flag once pending flips false after having been true
    // Simple approach: set on next tick after pending false
    const t = setTimeout(() => setJustSaved(true), 0);
    const hide = setTimeout(() => setJustSaved(false), 1500);
    return () => {
      clearTimeout(t);
      clearTimeout(hide);
    };
  }, [pending]);

  return (
    <div className="flex items-center gap-3">
      <SubmitButton />
      {pending && <span className="text-sm opacity-70">Sending…</span>}
      {!pending && justSaved && <span className="text-sm opacity-70">Saved ✓</span>}
    </div>
  );
}
