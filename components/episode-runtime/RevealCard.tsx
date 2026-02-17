import { ReactNode } from "react";

export default function RevealCard(props: {
  kind?: string;
  audience?: string;
  mode?: string;
  title?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  imageAlt?: string;
  hideBody?: boolean;
  childrenTop?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={["rounded-lg border p-3", props.className ?? ""].join(" ").trim()}>
      {(props.kind || props.audience || props.mode) ? (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
          {props.kind ? <span className="rounded border px-2 py-0.5">{props.kind}</span> : null}
          {props.audience ? <span className="rounded border px-2 py-0.5">{props.audience}</span> : null}
          {props.mode ? <span className="rounded border px-2 py-0.5">{props.mode}</span> : null}
        </div>
      ) : null}

      {props.childrenTop ? <div className="mb-2">{props.childrenTop}</div> : null}

      <div className="text-sm font-semibold">{props.title?.trim() || "(Untitled)"}</div>

      {!props.hideBody && props.body?.trim() ? (
        <div className="mt-1 whitespace-pre-wrap text-sm">{props.body}</div>
      ) : !props.hideBody ? (
        <div className="mt-1 text-sm opacity-70">Add content.</div>
      ) : null}

      {props.children ? (
        <div className="mt-2">{props.children}</div>
      ) : props.imageUrl ? (
        <div className="mt-2 overflow-hidden rounded border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.imageUrl} alt={props.imageAlt ?? props.title ?? "Reveal"} className="w-full h-auto" />
        </div>
      ) : null}
    </div>
  );
}
