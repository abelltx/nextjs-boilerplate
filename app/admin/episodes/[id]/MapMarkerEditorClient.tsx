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
  required_quest_ids?: string[];
  player_text?: string;
  storyteller_notes?: string;
  check_prompts?: Array<{
    id: string;
    label?: string;
    check_key: string;
    dc?: number | null;
    storyteller_script?: string;
    notes?: string;
  }>;
  roll_outcomes?: Array<{
    id: string;
    min_roll?: number | null;
    max_roll?: number | null;
    label?: string;
    storyteller_script?: string;
    notes?: string;
  }>;
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
    required_quest_ids: Array.isArray(m?.required_quest_ids)
      ? m.required_quest_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)
      : typeof m?.required_quest_ids === "string"
        ? m.required_quest_ids.split(",").map((v: string) => v.trim()).filter(Boolean)
        : [],
    player_text: String(m?.player_text ?? "").trim(),
    storyteller_notes: String(m?.storyteller_notes ?? "").trim(),
    check_prompts: Array.isArray(m?.check_prompts)
      ? m.check_prompts.map((p: any, pi: number) => ({
          id: String(p?.id ?? `check-${pi + 1}`),
          label: String(p?.label ?? "").trim(),
          check_key: String(p?.check_key ?? "").trim(),
          dc: Number.isFinite(Number(p?.dc ?? NaN)) ? Math.max(0, Math.floor(Number(p?.dc))) : null,
          storyteller_script: String(p?.storyteller_script ?? "").trim(),
          notes: String(p?.notes ?? "").trim(),
        }))
      : [],
    roll_outcomes: Array.isArray(m?.roll_outcomes)
      ? m.roll_outcomes.map((o: any, oi: number) => ({
          id: String(o?.id ?? `outcome-${oi + 1}`),
          min_roll: Number.isFinite(Number(o?.min_roll ?? NaN)) ? Math.max(0, Math.floor(Number(o?.min_roll))) : null,
          max_roll: Number.isFinite(Number(o?.max_roll ?? NaN)) ? Math.max(0, Math.floor(Number(o?.max_roll))) : null,
          label: String(o?.label ?? "").trim(),
          storyteller_script: String(o?.storyteller_script ?? "").trim(),
          notes: String(o?.notes ?? "").trim(),
        }))
      : [],
  }));
}

export default function MapMarkerEditorClient(props: {
  imageUrl: string;
  initialMeta: any;
  revealCandidates: Array<{ id: string; title: string }>;
  mode?: "map" | "hex";
  itemOptions?: Array<{ id: string; name?: string | null; is_active?: boolean | null }>;
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
    updateMarkerById(selectedId, patch);
  }

  function updateMarkerById(id: string, patch: Partial<Marker>) {
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
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

  function addOutcomeToSelected() {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const list = Array.isArray(m.roll_outcomes) ? m.roll_outcomes : [];
        return {
          ...m,
          roll_outcomes: [
            ...list,
            {
              id: `outcome-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              min_roll: null,
              max_roll: null,
              label: `Outcome ${list.length + 1}`,
              storyteller_script: "",
              notes: "",
            },
          ],
        };
      })
    );
  }

  function updateOutcome(outcomeId: string, patch: Record<string, any>) {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const list = Array.isArray(m.roll_outcomes) ? m.roll_outcomes : [];
        return {
          ...m,
          roll_outcomes: list.map((o) => {
            if (o.id !== outcomeId) return o;
            const next: any = { ...o, ...patch };
            if ("min_roll" in patch) {
              const n = Number(next.min_roll ?? NaN);
              next.min_roll = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
            }
            if ("max_roll" in patch) {
              const n = Number(next.max_roll ?? NaN);
              next.max_roll = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
            }
            return next;
          }),
        };
      })
    );
  }

  function removeOutcome(outcomeId: string) {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const list = Array.isArray(m.roll_outcomes) ? m.roll_outcomes : [];
        return { ...m, roll_outcomes: list.filter((o) => o.id !== outcomeId) };
      })
    );
  }

  function addCheckPromptToSelected() {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const list = Array.isArray(m.check_prompts) ? m.check_prompts : [];
        return {
          ...m,
          check_prompts: [
            ...list,
            {
              id: `check-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              label: "",
              check_key: "",
              dc: null,
              storyteller_script: "",
              notes: "",
            },
          ],
        };
      })
    );
  }

  function updateCheckPrompt(checkId: string, patch: Record<string, any>) {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const list = Array.isArray(m.check_prompts) ? m.check_prompts : [];
        return {
          ...m,
          check_prompts: list.map((p) => {
            if (p.id !== checkId) return p;
            const next: any = { ...p, ...patch };
            if ("dc" in patch) {
              const n = Number(next.dc ?? NaN);
              next.dc = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
            }
            return next;
          }),
        };
      })
    );
  }

  function removeCheckPrompt(checkId: string) {
    if (!selectedId) return;
    setMarkers((prev) =>
      prev.map((m) => {
        if (m.id !== selectedId) return m;
        const list = Array.isArray(m.check_prompts) ? m.check_prompts : [];
        return { ...m, check_prompts: list.filter((p) => p.id !== checkId) };
      })
    );
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
  const CHECK_OPTIONS = [
    "Perception",
    "Investigation",
    "Insight",
    "Medicine",
    "Animal Handling",
    "Nature",
    "Performance",
    "Sleight of Hand",
    "Athletics",
    "Acrobatics",
    "Stealth",
    "Survival",
    "Religion",
    "History",
    "Persuasion",
    "Deception",
    "Intimidation",
    "STR",
    "DEX",
    "CON",
    "INT",
    "WIS",
    "CHA",
  ];
  const rewardOptions = (props.itemOptions ?? [])
    .filter((it) => it?.id)
    .map((it) => ({ id: String(it.id), name: String(it.name ?? "Item") }));

  return (
    <div className="space-y-2 rounded-lg border p-2">
      <div className="text-xs uppercase text-gray-500">Map Marker Editor</div>
      <div className="text-xs text-gray-600">
        Click image to add marker. Drag marker to move.
        {isHex ? " Configure check/reward fields per hex below." : " Use linked reveal dropdown for map reveals."}
      </div>
      {isHex ? (
        <div className="rounded border bg-gray-50 p-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase text-gray-500">Hex Cards</div>
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addMarker(50, 50);
              }}
            >
              + Blank Hex Card
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {markers.map((m, i) => (
              <button
                key={`card-${m.id}`}
                type="button"
                className={[
                  "min-w-[170px] rounded border p-2 text-left",
                  selectedId === m.id ? "bg-white border-black" : "bg-white/80",
                ].join(" ")}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedId(m.id);
                }}
              >
                <div className="text-[11px] text-gray-500">Hex {i + 1}</div>
                <div className="text-sm font-semibold truncate">{m.label || `Hex ${i + 1}`}</div>
                <div className="text-[11px] text-gray-600 truncate">
                  {(m.check_prompts ?? []).length
                    ? `${(m.check_prompts ?? []).length} prompt${(m.check_prompts ?? []).length === 1 ? "" : "s"}`
                    : m.check_key
                      ? `${m.check_key}${m.check_dc ? ` DC ${m.check_dc}` : ""}`
                      : "No check"}
                </div>
                <div className="text-[11px] text-gray-600 truncate">
                  Rewards: {(m.reward_item_ids ?? []).length}
                </div>
                <div className="text-[11px] text-gray-600 truncate">
                  Quest gate: {(m.required_quest_ids ?? []).length ? `${(m.required_quest_ids ?? []).length} quest(s)` : "none"}
                </div>
              </button>
            ))}
            {!markers.length ? <div className="text-xs text-gray-500 px-1 py-2">No hex markers yet.</div> : null}
          </div>
        </div>
      ) : null}

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
              <select
                className="border rounded p-2 text-sm"
                value={selected.check_key ?? ""}
                onChange={(e) => updateSelected({ check_key: e.target.value })}
              >
                <option value="">No required check</option>
                {CHECK_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
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
                value={(selected.required_quest_ids ?? []).join(", ")}
                onChange={(e) =>
                  updateSelected({
                    required_quest_ids: e.target.value
                      .split(",")
                      .map((v) => v.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="Required active quest IDs (comma-separated, optional)"
              />
              <select
                className="border rounded p-2 text-sm"
                defaultValue=""
                onChange={(e) => {
                  const v = String(e.target.value ?? "").trim();
                  if (!v) return;
                  const next = Array.from(new Set([...(selected.reward_item_ids ?? []), v]));
                  updateSelected({ reward_item_ids: next });
                  e.currentTarget.value = "";
                }}
              >
                <option value="">Quick add reward from Item Library</option>
                {rewardOptions.map((it) => (
                  <option key={it.id} value={it.id}>
                    {it.name}
                  </option>
                ))}
              </select>
              <textarea
                className="border rounded p-2 text-sm md:col-span-2 h-20"
                value={selected.player_text ?? ""}
                onChange={(e) => updateSelected({ player_text: e.target.value })}
                placeholder="Player text for this hex (optional)"
              />
              <textarea
                className="border rounded p-2 text-sm md:col-span-2 h-20"
                value={selected.storyteller_notes ?? ""}
                onChange={(e) => updateSelected({ storyteller_notes: e.target.value })}
                placeholder="Storyteller notes for this hex (optional)"
              />
              <div className="md:col-span-4 rounded border bg-gray-50 p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase text-gray-500">Check Prompts (per hex)</div>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      addCheckPromptToSelected();
                    }}
                  >
                    + Add Check Prompt
                  </button>
                </div>
                {(selected.check_prompts ?? []).length ? (
                  <div className="space-y-2">
                    {(selected.check_prompts ?? []).map((p, pi) => (
                      <div key={p.id} className="rounded border bg-white p-2 space-y-2">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                          <input
                            className="border rounded p-2 text-sm md:col-span-2"
                            value={p.label ?? ""}
                            onChange={(e) => updateCheckPrompt(p.id, { label: e.target.value })}
                            placeholder={`Prompt title (optional) e.g. Poster Clue #${pi + 1}`}
                          />
                          <select
                            className="border rounded p-2 text-sm"
                            value={p.check_key ?? ""}
                            onChange={(e) => updateCheckPrompt(p.id, { check_key: e.target.value })}
                          >
                            <option value="">Select check</option>
                            {CHECK_OPTIONS.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </select>
                          <input
                            className="border rounded p-2 text-sm"
                            type="number"
                            min={0}
                            step="1"
                            value={p.dc ?? ""}
                            onChange={(e) =>
                              updateCheckPrompt(p.id, {
                                dc: e.target.value.trim() ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="DC"
                          />
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs text-red-700"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeCheckPrompt(p.id);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="border rounded p-2 text-sm w-full h-16"
                          value={p.storyteller_script ?? ""}
                          onChange={(e) => updateCheckPrompt(p.id, { storyteller_script: e.target.value })}
                          placeholder="Storyteller readout for this check prompt"
                        />
                        <textarea
                          className="border rounded p-2 text-sm w-full h-14"
                          value={p.notes ?? ""}
                          onChange={(e) => updateCheckPrompt(p.id, { notes: e.target.value })}
                          placeholder="Optional mechanics note"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">
                    No check prompts yet. Add Perception/Investigation/History/Religion style prompts here.
                  </div>
                )}
              </div>
              <div className="md:col-span-4 rounded border bg-gray-50 p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] uppercase text-gray-500">Roll Outcomes (Storyteller)</div>
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      addOutcomeToSelected();
                    }}
                  >
                    + Add Outcome
                  </button>
                </div>
                {(selected.roll_outcomes ?? []).length ? (
                  <div className="space-y-2">
                    {(selected.roll_outcomes ?? []).map((o, oi) => (
                      <div key={o.id} className="rounded border bg-white p-2 space-y-2">
                        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
                          <input
                            className="border rounded p-2 text-sm md:col-span-2"
                            value={o.label ?? ""}
                            onChange={(e) => updateOutcome(o.id, { label: e.target.value })}
                            placeholder={`Outcome ${oi + 1} label`}
                          />
                          <input
                            className="border rounded p-2 text-sm"
                            type="number"
                            min={0}
                            step="1"
                            value={o.min_roll ?? ""}
                            onChange={(e) =>
                              updateOutcome(o.id, {
                                min_roll: e.target.value.trim() ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Min roll"
                          />
                          <input
                            className="border rounded p-2 text-sm"
                            type="number"
                            min={0}
                            step="1"
                            value={o.max_roll ?? ""}
                            onChange={(e) =>
                              updateOutcome(o.id, {
                                max_roll: e.target.value.trim() ? Number(e.target.value) : null,
                              })
                            }
                            placeholder="Max roll"
                          />
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              className="rounded border px-2 py-1 text-xs text-red-700"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                removeOutcome(o.id);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                        <textarea
                          className="border rounded p-2 text-sm w-full h-16"
                          value={o.storyteller_script ?? ""}
                          onChange={(e) => updateOutcome(o.id, { storyteller_script: e.target.value })}
                          placeholder="Storyteller script for this roll range"
                        />
                        <textarea
                          className="border rounded p-2 text-sm w-full h-14"
                          value={o.notes ?? ""}
                          onChange={(e) => updateOutcome(o.id, { notes: e.target.value })}
                          placeholder="Optional mechanics/notes for this outcome"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500">No outcomes yet. Add one for each roll range you want prewritten.</div>
                )}
              </div>
            </>
          ) : null}
          <div className="md:col-span-4">
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs text-red-700"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                removeSelected();
              }}
            >
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
