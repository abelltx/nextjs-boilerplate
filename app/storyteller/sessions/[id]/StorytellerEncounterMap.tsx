"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { storytellerMoveEncounterCombatant } from "./actions";

export default function StorytellerEncounterMap(props: {
  sessionId: string;
  encounter: any;
}) {
  const router = useRouter();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [selectedCombatantId, setSelectedCombatantId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const gridCols = Math.max(1, Number(props.encounter?.grid?.cols ?? 12));
  const gridRows = Math.max(1, Number(props.encounter?.grid?.rows ?? 12));
  const lineOpacity = Math.max(0.05, Math.min(1, Number(props.encounter?.grid?.line_opacity ?? 0.2) || 0.2));
  const currentTurn = props.encounter?.combatants?.[props.encounter?.turn_index ?? 0] ?? null;
  const combatants = Array.isArray(props.encounter?.combatants) ? props.encounter.combatants : [];
  const selectedCombatant = useMemo(
    () => combatants.find((row: any) => String(row?.id ?? "") === selectedCombatantId) ?? null,
    [combatants, selectedCombatantId]
  );

  function moveSelectedCombatant(event: React.MouseEvent<HTMLDivElement>) {
    if (!selectedCombatantId || pending) return;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    startTransition(async () => {
      try {
        const safeX = Math.max(0, Math.min(100, x));
        const safeY = Math.max(0, Math.min(100, y));
        await storytellerMoveEncounterCombatant({
          sessionId: props.sessionId,
          combatantId: selectedCombatantId,
          x: safeX,
          y: safeY,
        });
        router.refresh();
      } catch (error: any) {
        alert(error?.message ?? "Could not move combatant.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <div>
          {selectedCombatant
            ? `Moving ${selectedCombatant.name}. Click the map to place the token.`
            : "Click a token on the map, then click a destination square to move it."}
        </div>
        {selectedCombatant ? (
          <button
            type="button"
            className="rounded border bg-white px-2 py-1 hover:bg-slate-100"
            onClick={() => setSelectedCombatantId("")}
            disabled={pending}
          >
            Cancel Move
          </button>
        ) : null}
      </div>
      <div
        ref={boardRef}
        className={[
          "rounded border overflow-hidden bg-gray-100 relative",
          selectedCombatant ? "cursor-crosshair" : "cursor-default",
          pending ? "opacity-80" : "",
        ].join(" ")}
        onClick={moveSelectedCombatant}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.encounter.map_image_url} alt={props.encounter.title ?? "Encounter"} className="w-full h-auto block" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              `linear-gradient(to right, rgba(255,255,255,${lineOpacity}) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,${lineOpacity}) 1px, transparent 1px)`,
            backgroundSize: `${100 / gridCols}% ${100 / gridRows}%`,
            backgroundPosition: `${Number(props.encounter?.grid?.offset_x ?? 0) || 0}px ${Number(props.encounter?.grid?.offset_y ?? 0) || 0}px`,
          }}
        />
        {combatants.map((row: any) => {
          const x = Number.isFinite(Number(row?.x ?? NaN)) ? Number(row.x) : null;
          const y = Number.isFinite(Number(row?.y ?? NaN)) ? Number(row.y) : null;
          if (x == null || y == null) return null;
          const label = String(row?.name ?? row?.kind ?? "Unit").trim();
          const hpMax = Number(row?.hp_max ?? NaN);
          const hpCurrent = Number(row?.hp_current ?? NaN);
          const ratio = Number.isFinite(hpCurrent) && Number.isFinite(hpMax) && hpMax > 0 ? hpCurrent / hpMax : 1;
          const tone = ratio <= 0.25 ? "bg-red-500" : ratio <= 0.5 ? "bg-orange-500" : "bg-emerald-500";
          const imageUrl = String(row?.image_url ?? "").trim();
          const initials = label
            .split(/\s+/)
            .map((part: string) => part.slice(0, 1))
            .join("")
            .slice(0, 2)
            .toUpperCase();
          const isCurrent = currentTurn?.id === row.id && props.encounter?.status === "active";
          const isSelected = selectedCombatantId === String(row.id);
          return (
            <button
              key={row.id}
              type="button"
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedCombatantId(String(row.id));
              }}
            >
              <div className="flex flex-col items-center gap-1">
                <div
                  className={[
                    "h-12 w-12 overflow-hidden rounded-full border-2 shadow",
                    row.kind === "player" ? "border-cyan-400 bg-cyan-950" : "border-white bg-neutral-900",
                    isCurrent ? "ring-2 ring-emerald-400" : "",
                    isSelected ? "ring-4 ring-amber-300" : "",
                  ].join(" ")}
                >
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">{initials || "?"}</div>
                  )}
                </div>
                <div className="rounded-full bg-black/70 px-2 py-1 text-[10px] text-white">{label}</div>
                {Number.isFinite(hpCurrent) && Number.isFinite(hpMax) ? (
                  <div className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
                    <div className={`h-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                  </div>
                ) : null}
              </div>
            </button>
          );
        })}
        <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-[11px] text-white">
          {Math.max(1, Number(props.encounter?.grid?.feet_per_square ?? 5) || 5)} ft / square
        </div>
      </div>
    </div>
  );
}
