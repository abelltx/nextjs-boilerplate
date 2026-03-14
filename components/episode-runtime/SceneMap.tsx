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
  initialZoom?: number;
  activeMarkerId?: string | null;
  onMarkerClick?: (marker: MapMarker, index: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [zoom, setZoom] = useState(Math.max(1.5, Math.min(12, Number(props.initialZoom ?? 2))));
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const [hoveringMarker, setHoveringMarker] = useState(false);
  const [nearMarker, setNearMarker] = useState(false);
  const [lensOn, setLensOn] = useState(true);

  function onMove(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const nx = clamp(x);
    const ny = clamp(y);
    setPos({ x: nx, y: ny });
    const threshold = 4; // percent distance threshold around markers
    const isNear = (props.markers ?? []).some((m) => Math.abs(nx - clamp(m.x)) <= threshold && Math.abs(ny - clamp(m.y)) <= threshold);
    setNearMarker(isNear);
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
          (() => {
            const isActive = String(props.activeMarkerId ?? "").trim() !== "" && String(m.id) === String(props.activeMarkerId);
            return (
          <button
            key={m.id}
            type="button"
            className={[
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[10px] font-semibold min-h-6 min-w-6",
              isActive
                ? "border-emerald-300 bg-emerald-500/85 text-black animate-pulse shadow-[0_0_0_3px_rgba(16,185,129,0.45),0_0_24px_rgba(16,185,129,0.65)]"
                : "border-white bg-black/80 text-white hover:bg-black",
            ].join(" ")}
            style={{ left: `${clamp(m.x)}%`, top: `${clamp(m.y)}%` }}
            title={m.label}
            onMouseEnter={() => setHoveringMarker(true)}
            onMouseLeave={() => setHoveringMarker(false)}
            onClick={(e) => {
              e.stopPropagation();
              setPos({ x: clamp(m.x), y: clamp(m.y) });
              setHover(true);
              props.onMarkerClick?.(m, i);
            }}
          >
            {i + 1}
          </button>
            );
          })()
        ))}

        {props.showMagnifier && lensOn && hover && !hoveringMarker && !nearMarker ? (
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
          {props.showMagnifier ? (
            <button
              type="button"
              className="rounded border border-neutral-700 px-2 py-0.5 hover:bg-neutral-900"
              onClick={() => setLensOn((v) => !v)}
              title="Toggle magnifier lens"
            >
              Lens: {lensOn ? "On" : "Off"}
            </button>
          ) : null}
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
