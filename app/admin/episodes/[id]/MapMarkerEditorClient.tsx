"use client";

import { useMemo, useRef, useState } from "react";

type Marker = {
  id: string;
  label: string;
  x: number;
  y: number;
  target_block_id: string | null;
  focus_image_url?: string;
  check_key?: string;
  check_dc?: number | null;
  reward_item_ids?: string[];
  player_text?: string;
  storyteller_notes?: string;
};

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function normalizeMarkers(input: any): Marker[] {
  const list = Array.isArray(input?.markers) ? input.markers : [];
  return list.map((m: any, i: number) => ({
    id: String(m?.id ?? `m-${i + 1}`),
    label: String(m?.label ?? `Marker ${i + 1}`),
    x: round3(clamp(Number(m?.x ?? 50))),
    y: round3(clamp(Number(m?.y ?? 50))),
    target_block_id: m?.target_block_id ? String(m.target_block_id) : null,
    focus_image_url: String(m?.focus_image_url ?? "").trim(),
    check_key: String(m?.check_key ?? "").trim(),
    check_dc: Number.isFinite(Number(m?.check_dc ?? NaN)) ? Math.max(0, Math.floor(Number(m?.check_dc))) : null,
    reward_item_ids: Array.isArray(m?.reward_item_ids)
      ? m.reward_item_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)
      : typeof m?.reward_item_ids === "string"
        ? m.reward_item_ids.split(",").map((v: string) => v.trim()).filter(Boolean)
        : [],
    player_text: String(m?.player_text ?? "").trim(),
    storyteller_notes: String(m?.storyteller_notes ?? "").trim(),
  }));
}

export default function MapMarkerEditorClient(props: {
  imageUrl: string;
  initialMeta: any;
  revealCandidates: Array<{ id: string; title: string }>;
  mode?: "map" | "hex";
}) {
  const [markers, setMarkers] = useState<Marker[]>(() => normalizeMarkers(props.initialMeta));
  const [selectedId, setSelectedId] = useState<string | null>(markers[0]?.id ?? null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [didDrag, setDidDrag] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = markers.find((m) => m.id === selectedId) ?? null;
  const isHex = props.mode === "hex";
  const extraMeta = useMemo(() => {
    const raw = props.initialMeta ?? {};
    const copy = { ...(raw as Record<string, any>) };
    delete copy.markers;
    return copy;
  }, [props.initialMeta]);

  function addMarker(x = 50, y = 50) {
    const id = `m-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const next: Marker = {
      id,
      label: `Marker ${markers.length + 1}`,
      x: clamp(x),
      y: clamp(y),
      target_block_id: null,
    };
    setMarkers((prev) => [...prev, next]);
    setSelectedId(id);
  }

  function updateSelected(patch: Partial<Marker>) {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const next = { ...m, ...patch };
        next.x = round3(clamp(Number(next.x ?? 50)));
        next.y = round3(clamp(Number(next.y ?? 50)));
        return next;
      })
    );
  }

  function removeSelected() {
    if (!selectedId) return;
    setMarkers((prev) => prev.filter((m) => m.id !== selectedId));
    setSelectedId((cur) => {
      const rest = markers.filter((m) => m.id !== cur);
      return rest[0]?.id ?? null;
    });
  }

  function moveMarkerByClient(clientX: number, clientY: number) {
    if (!draggingId || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    setMarkers((prev) =>
      prev.map((m) => (m.id === draggingId ? { ...m, x: round3(clamp(x)), y: round3(clamp(y)) } : m))
    );
    setDidDrag(true);
  }

  const metaJson = JSON.stringify({ ...extraMeta, markers }, null, 2);

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="text-xs uppercase text-gray-500">Map Marker Editor</div>
      <div className="text-xs text-gray-600">
        Click image to add marker. Drag marker to move.
        {isHex ? " Configure check/reward fields per hex below." : " Use linked reveal dropdown for map reveals."}
      </div>

      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded border bg-black/5"
        onPointerMove={(e) => {
          if (!draggingId) return;
          moveMarkerByClient(e.clientX, e.clientY);
        }}
        onPointerUp={() => setDraggingId(null)}
        onPointerLeave={() => setDraggingId(null)}
        onClick={(e) => {
          if (didDrag) {
            setDidDrag(false);
            return;
          }
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          addMarker(x, y);
        }}
      >
        {/* Use the same coordinate surface as player SceneMap (full-width image, no contain letterboxing). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.imageUrl} alt="Map marker editor" className="w-full h-auto block select-none" draggable={false} />

        {markers.map((m, i) => (
          <button
            key={m.id}
            type="button"
            className={[
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
              selectedId === m.id ? "border-black bg-white text-black" : "border-white bg-black/80 text-white",
            ].join(" ")}
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(m.id);
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setSelectedId(m.id);
              setDraggingId(m.id);
              setDidDrag(false);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (draggingId !== m.id) return;
              moveMarkerByClient(e.clientX, e.clientY);
            }}
            onPointerUp={(e) => {
              if (draggingId === m.id) setDraggingId(null);
              e.currentTarget.releasePointerCapture(e.pointerId);
            }}
            title={m.label}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {selected ? (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <input
            className="border rounded p-2 text-sm"
            value={selected.label}
            onChange={(e) => updateSelected({ label: e.target.value })}
            placeholder="Marker label"
          />
          <input
            className="border rounded p-2 text-sm"
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={selected.x}
            onChange={(e) => updateSelected({ x: clamp(Number(e.target.value || 0)) })}
            placeholder="X"
          />
          <input
            className="border rounded p-2 text-sm"
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={selected.y}
            onChange={(e) => updateSelected({ y: clamp(Number(e.target.value || 0)) })}
            placeholder="Y"
          />
          <select
            className="border rounded p-2 text-sm"
            value={selected.target_block_id ?? ""}
            onChange={(e) => updateSelected({ target_block_id: e.target.value || null })}
          >
            <option value="">No linked reveal card</option>
            {props.revealCandidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          {isHex ? (
            <>
              <input
                className="border rounded p-2 text-sm md:col-span-2"
                value={selected.focus_image_url ?? ""}
                onChange={(e) => updateSelected({ focus_image_url: e.target.value })}
                placeholder="Focused hex image URL (optional)"
              />
              <input
                className="border rounded p-2 text-sm"
                value={selected.check_key ?? ""}
                onChange={(e) => updateSelected({ check_key: e.target.value })}
                placeholder="Check key (e.g. Perception)"
              />
              <input
                className="border rounded p-2 text-sm"
                type="number"
                min={0}
                step="1"
                value={selected.check_dc ?? ""}
                onChange={(e) =>
                  updateSelected({
                    check_dc: e.target.value.trim() ? Math.max(0, Math.floor(Number(e.target.value))) : null,
                  })
                }
                placeholder="DC"
              />
              <input
                className="border rounded p-2 text-sm md:col-span-2"
                value={(selected.reward_item_ids ?? []).join(", ")}
                onChange={(e) =>
                  updateSelected({
                    reward_item_ids: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Reward item UUIDs (comma-separated)"
              />
              <input
                className="border rounded p-2 text-sm md:col-span-2"
                value={selected.player_text ?? ""}
                onChange={(e) => updateSelected({ player_text: e.target.value })}
                placeholder="Player text for this hex (optional)"
              />
              <input
                className="border rounded p-2 text-sm md:col-span-2"
                value={selected.storyteller_notes ?? ""}
                onChange={(e) => updateSelected({ storyteller_notes: e.target.value })}
                placeholder="Storyteller notes for this hex (optional)"
              />
            </>
          ) : null}
          <div className="md:col-span-4">
            <button type="button" className="rounded border px-2 py-1 text-xs text-red-700" onClick={removeSelected}>
              Remove selected marker
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-500">No marker selected.</div>
      )}

      <input type="hidden" name="meta_json" value={metaJson} />
      <details>
        <summary className="cursor-pointer text-xs text-gray-600">Advanced: raw meta JSON</summary>
        <pre className="mt-1 max-h-40 overflow-auto rounded border bg-gray-50 p-2 text-[11px]">{metaJson}</pre>
      </details>
    </div>
  );
}
