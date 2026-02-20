"use client";

import { useFormStatus } from "react-dom";

export default function SubmitGlowButton(props: {
  idleLabel: string;
  pendingLabel?: string;
  className?: string;
  pendingClassName?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={[
        props.className ?? "rounded border px-2 py-0.5 text-[11px]",
        pending
          ? props.pendingClassName ??
            "border-emerald-500 bg-emerald-100 text-emerald-800 animate-pulse shadow-[0_0_0_2px_rgba(16,185,129,0.35)]"
          : "",
      ]
        .join(" ")
        .trim()}
    >
      {pending ? props.pendingLabel ?? "Saving..." : props.idleLabel}
    </button>
  );
}

