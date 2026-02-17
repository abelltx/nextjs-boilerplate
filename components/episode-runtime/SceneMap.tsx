"use client";

import { useState, type MouseEvent } from "react";
import type { MapMarker } from "@/lib/episodeRuntime";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

export default function SceneMap(props: {
  src: string;
  alt: string;
  markers?: MapMarker[];
  className?: string;
  showMagnifier?: boolean;
  onMarkerClick?: (marker: MapMarker, index: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [pos, setPos] = useState({ x: 50, y: 50 });

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPos({ x: clamp(x), y: clamp(y) });
  }

  return (
    <div className={props.className ?? "space-y-2"}>
      <div
        className="relative overflow-hidden rounded-xl border border-neutral-800"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onMouseMove={onMove}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.src} alt={props.alt} className="w-full" />

        {(props.markers ?? []).map((m, i) => (
          <button
            key={m.id}
            type="button"
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-black/80 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-black"
            style={{ left: `${clamp(m.x)}%`, top: `${clamp(m.y)}%` }}
            title={m.label}
            onClick={(e) => {
              e.stopPropagation();
              setPos({ x: clamp(m.x), y: clamp(m.y) });
              setHover(true);
              props.onMarkerClick?.(m, i);
            }}
          >
            {i + 1}
          </button>
        ))}

        {props.showMagnifier && hover ? (
          <div
            className="pointer-events-none absolute h-36 w-36 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-lg"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              backgroundImage: `url(${props.src})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${zoom * 100}%`,
              backgroundPosition: `${pos.x}% ${pos.y}%`,
            }}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between text-xs text-neutral-300">
        <div className="flex items-center gap-2">
          <span>Zoom</span>
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900"
            onClick={() => setZoom((z) => Math.max(1.5, Number((z - 0.5).toFixed(1))))}
          >
            -
          </button>
          <span>{zoom.toFixed(1)}x</span>
          <button
            type="button"
            className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900"
            onClick={() => setZoom((z) => Math.min(12, Number((z + 0.5).toFixed(1))))}
          >
            +
          </button>
        </div>
        <a href={props.src} target="_blank" rel="noreferrer" className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900">
          Open full image
        </a>
      </div>
    </div>
  );
}
