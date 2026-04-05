"use client";

import { useMemo, useRef, useState } from "react";

type NpcOption = {
  id: string;
  name: string;
  thumb_url?: string | null;
  medium_url?: string | null;
  full_url?: string | null;
  description?: string | null;
};

type EnemyRow = {
  id: number;
  name: string;
  npcId: string;
  imageUrl: string;
  initiativeMod: string;
  hpMax: string;
  hpCurrent: string;
  defense: string;
  x: number | null;
  y: number | null;
};

type SlotRow = {
  id: number;
  label: string;
  x: number | null;
  y: number | null;
};

type SurfaceToken =
  | { id: string; kind: "slot"; label: string; x: number; y: number }
  | { id: string; kind: "enemy"; label: string; x: number; y: number; imageUrl: string | null; hpCurrent: number; hpMax: number };

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function newEnemyRow(id: number): EnemyRow {
  return { id, name: "", npcId: "", imageUrl: "", initiativeMod: "0", hpMax: "6", hpCurrent: "6", defense: "", x: 50, y: 50 };
}

function newSlotRow(id: number): SlotRow {
  return { id, label: `Start ${id}`, x: 50, y: 50 };
}

function tokenHealthTone(current: number, max: number) {
  const ratio = max > 0 ? current / max : 0;
  if (ratio <= 0.25) return "bg-red-500";
  if (ratio <= 0.5) return "bg-orange-500";
  return "bg-emerald-500";
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part.slice(0, 1))
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function normalizePercent(value: unknown, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? round3(clamp(n)) : fallback;
}

function formatSquareInfo(cols: string, rows: string, feetPerSquare: string) {
  const c = Math.max(1, Number(cols) || 1);
  const r = Math.max(1, Number(rows) || 1);
  const feet = Math.max(1, Number(feetPerSquare) || 5);
  return `${c} x ${r} grid, ${feet} ft per square`;
}

export default function EncounterEditorClient(props: {
  blockTitle?: string | null;
  imageUrl?: string | null;
  initialMeta?: any;
  npcOptions?: NpcOption[];
}) {
  const encounter = useMemo(() => {
    const meta = props.initialMeta && typeof props.initialMeta === "object" ? props.initialMeta : {};
    const raw = meta.encounter && typeof meta.encounter === "object" ? meta.encounter : safeJsonParse(JSON.stringify(meta));
    return raw && typeof raw === "object" ? raw : {};
  }, [props.initialMeta]);

  const [summary, setSummary] = useState<string>(String(encounter.summary ?? "").trim());
  const [objectivesText, setObjectivesText] = useState<string>(
    Array.isArray(encounter.objectives) ? encounter.objectives.map((v: any) => String(v ?? "").trim()).filter(Boolean).join("\n") : ""
  );
  const [cols, setCols] = useState<string>(String(encounter.grid?.cols ?? 12));
  const [rows, setRows] = useState<string>(String(encounter.grid?.rows ?? 12));
  const [cellSize, setCellSize] = useState<string>(String(encounter.grid?.cell_size ?? 48));
  const [offsetX, setOffsetX] = useState<string>(String(encounter.grid?.offset_x ?? 0));
  const [offsetY, setOffsetY] = useState<string>(String(encounter.grid?.offset_y ?? 0));
  const [lineOpacity, setLineOpacity] = useState<string>(String(encounter.grid?.line_opacity ?? 0.35));
  const [feetPerSquare, setFeetPerSquare] = useState<string>(String(encounter.grid?.feet_per_square ?? 5));
  const [playerRolls, setPlayerRolls] = useState<boolean>(encounter.initiative?.player_rolls !== false);
  const [autoRollEnemies, setAutoRollEnemies] = useState<boolean>(encounter.initiative?.auto_roll_enemies !== false);
  const [slots, setSlots] = useState<SlotRow[]>(
    Array.isArray(encounter.player_slots) && encounter.player_slots.length
      ? encounter.player_slots.map((row: any, index: number) => ({
          id: index + 1,
          label: String(row?.label ?? "").trim() || `Start ${index + 1}`,
          x: normalizePercent(row?.x),
          y: normalizePercent(row?.y),
        }))
      : [newSlotRow(1)]
  );
  const [enemies, setEnemies] = useState<EnemyRow[]>(
    Array.isArray(encounter.enemies) && encounter.enemies.length
      ? encounter.enemies.map((row: any, index: number) => ({
          id: index + 1,
          name: String(row?.name ?? "").trim(),
          npcId: String(row?.npc_id ?? "").trim(),
          imageUrl: String(row?.image_url ?? "").trim(),
          initiativeMod: String(row?.initiative_mod ?? 0),
          hpMax: String(row?.hp_max ?? 6),
          hpCurrent: String(row?.hp_current ?? row?.hp_max ?? 6),
          defense: row?.defense == null ? "" : String(row.defense),
          x: normalizePercent(row?.x),
          y: normalizePercent(row?.y),
        }))
      : [newEnemyRow(1)]
  );
  const [selectedTokenId, setSelectedTokenId] = useState<string>("slot:1");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [didDrag, setDidDrag] = useState(false);
  const [npcToAdd, setNpcToAdd] = useState<string>("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const npcById = useMemo(() => new Map((props.npcOptions ?? []).map((npc) => [String(npc.id), npc] as const)), [props.npcOptions]);
  const nextEnemyId = useMemo(() => Math.max(0, ...enemies.map((row) => row.id)) + 1, [enemies]);
  const nextSlotId = useMemo(() => Math.max(0, ...slots.map((row) => row.id)) + 1, [slots]);
  const previewCols = Math.max(1, Number(cols) || 12);
  const previewRows = Math.max(1, Number(rows) || 12);
  const previewOpacity = Math.max(0.05, Math.min(1, Number(lineOpacity) || 0.35));

  const tokens = useMemo<SurfaceToken[]>(
    () => [
      ...slots.map((row) => ({ id: `slot:${row.id}`, kind: "slot" as const, label: row.label.trim() || `Start ${row.id}`, x: row.x ?? 50, y: row.y ?? 50 })),
      ...enemies.map((row) => ({
        id: `enemy:${row.id}`,
        kind: "enemy" as const,
        label: row.name.trim() || `Enemy ${row.id}`,
        x: row.x ?? 50,
        y: row.y ?? 50,
        imageUrl: row.imageUrl.trim() || null,
        hpCurrent: Math.max(0, Number(row.hpCurrent) || 0),
        hpMax: Math.max(1, Number(row.hpMax) || 1),
      })),
    ],
    [enemies, slots]
  );

  const selectedToken = tokens.find((token) => token.id === selectedTokenId) ?? null;
  const selectedSlot = selectedToken?.kind === "slot" ? slots.find((row) => `slot:${row.id}` === selectedToken.id) ?? null : null;
  const selectedEnemy = selectedToken?.kind === "enemy" ? enemies.find((row) => `enemy:${row.id}` === selectedToken.id) ?? null : null;

  function updateSlot(id: number, patch: Partial<SlotRow>) {
    setSlots((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, ...patch, x: patch.x == null ? row.x : normalizePercent(patch.x, row.x ?? 50), y: patch.y == null ? row.y : normalizePercent(patch.y, row.y ?? 50) }
          : row
      )
    );
  }

  function updateEnemy(id: number, patch: Partial<EnemyRow>) {
    setEnemies((prev) =>
      prev.map((row) =>
        row.id === id
          ? { ...row, ...patch, x: patch.x == null ? row.x : normalizePercent(patch.x, row.x ?? 50), y: patch.y == null ? row.y : normalizePercent(patch.y, row.y ?? 50) }
          : row
      )
    );
  }

  function moveTokenByClient(clientX: number, clientY: number) {
    if (!draggingId || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const x = round3(clamp(((clientX - rect.left) / rect.width) * 100));
    const y = round3(clamp(((clientY - rect.top) / rect.height) * 100));
    const [kind, rawId] = draggingId.split(":");
    const id = Number(rawId);
    if (kind === "slot") updateSlot(id, { x, y });
    if (kind === "enemy") updateEnemy(id, { x, y });
    setDidDrag(true);
  }

  function addSlotAt(x = 50, y = 50) {
    const id = nextSlotId;
    setSlots((prev) => [...prev, { id, label: `Start ${id}`, x, y }]);
    setSelectedTokenId(`slot:${id}`);
  }

  function addBlankEnemyAt(x = 50, y = 50) {
    const id = nextEnemyId;
    setEnemies((prev) => [...prev, { ...newEnemyRow(id), x, y }]);
    setSelectedTokenId(`enemy:${id}`);
  }

  function addNpcEnemyAt(npcId: string, x = 50, y = 50) {
    const npc = npcById.get(npcId);
    if (!npc) return;
    const id = nextEnemyId;
    setEnemies((prev) => [
      ...prev,
      { ...newEnemyRow(id), name: String(npc.name ?? "Enemy"), npcId, imageUrl: String(npc.medium_url ?? npc.thumb_url ?? npc.full_url ?? "").trim(), x, y },
    ]);
    setSelectedTokenId(`enemy:${id}`);
    setNpcToAdd("");
  }

  function removeSelectedToken() {
    if (!selectedToken) return;
    if (selectedToken.kind === "slot") {
      const targetId = Number(selectedToken.id.split(":")[1] ?? 0);
      const remaining = slots.filter((row) => row.id !== targetId);
      setSlots(remaining);
      setSelectedTokenId(remaining[0] ? `slot:${remaining[0].id}` : enemies[0] ? `enemy:${enemies[0].id}` : "");
      return;
    }
    const targetId = Number(selectedToken.id.split(":")[1] ?? 0);
    const remaining = enemies.filter((row) => row.id !== targetId);
    setEnemies(remaining);
    setSelectedTokenId(remaining[0] ? `enemy:${remaining[0].id}` : slots[0] ? `slot:${slots[0].id}` : "");
  }

  const extraMeta = useMemo(() => {
    const raw = props.initialMeta ?? {};
    const copy = { ...(raw as Record<string, any>) };
    delete copy.encounter;
    return copy;
  }, [props.initialMeta]);

  const metaJson = useMemo(() => {
    const cleanedObjectives = objectivesText.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
    return JSON.stringify(
      {
        ...extraMeta,
        encounter: {
          version: 1,
          title: String(props.blockTitle ?? "Encounter").trim() || "Encounter",
          summary: summary.trim() || null,
          map_image_url: String(props.imageUrl ?? "").trim() || null,
          grid: {
            cols: Math.max(1, Number(cols) || 12),
            rows: Math.max(1, Number(rows) || 12),
            cell_size: Math.max(16, Number(cellSize) || 48),
            offset_x: Number(offsetX) || 0,
            offset_y: Number(offsetY) || 0,
            line_opacity: previewOpacity,
            feet_per_square: Math.max(1, Number(feetPerSquare) || 5),
          },
          objectives: cleanedObjectives,
          player_slots: slots.map((row, index) => ({ id: `slot_${index + 1}`, label: row.label.trim() || `Start ${index + 1}`, x: row.x ?? null, y: row.y ?? null })),
          enemies: enemies.map((row, index) => ({
            id: `enemy_${index + 1}`,
            name: row.name.trim() || `Enemy ${index + 1}`,
            npc_id: row.npcId.trim() || null,
            image_url: row.imageUrl.trim() || null,
            initiative_mod: Number(row.initiativeMod) || 0,
            hp_max: Math.max(1, Number(row.hpMax) || 1),
            hp_current: Math.max(0, Number(row.hpCurrent) || 0),
            defense: row.defense.trim() === "" ? null : Number(row.defense),
            x: row.x ?? null,
            y: row.y ?? null,
          })),
          initiative: { player_rolls: playerRolls, auto_roll_enemies: autoRollEnemies },
        },
      },
      null,
      2
    );
  }, [autoRollEnemies, cellSize, cols, enemies, extraMeta, feetPerSquare, objectivesText, offsetX, offsetY, playerRolls, previewOpacity, props.blockTitle, props.imageUrl, rows, slots, summary]);

  return (
    <div className="space-y-4">
      <input type="hidden" name="meta_json" value={metaJson} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
        <div className="space-y-4">
          <div className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Encounter Surface</div>
                <div className="text-xs text-gray-600">{formatSquareInfo(cols, rows, feetPerSquare)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => addSlotAt(50, 50)}>
                  Add Player Start
                </button>
                <button type="button" className="rounded border px-2 py-1 text-xs" onClick={() => addBlankEnemyAt(50, 50)}>
                  Add Blank Enemy
                </button>
                <select
                  className="rounded border px-2 py-1 text-xs"
                  value={npcToAdd}
                  onChange={(e) => {
                    const value = String(e.currentTarget.value ?? "").trim();
                    setNpcToAdd(value);
                    if (value) addNpcEnemyAt(value, 50, 50);
                  }}
                >
                  <option value="">Add NPC from Library</option>
                  {(props.npcOptions ?? []).map((npc) => (
                    <option key={npc.id} value={npc.id}>
                      {npc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {props.imageUrl ? (
              <div
                ref={wrapRef}
                className="relative mt-3 overflow-hidden rounded-lg border bg-black/5"
                onPointerMove={(e) => {
                  if (!draggingId) return;
                  moveTokenByClient(e.clientX, e.clientY);
                }}
                onPointerUp={() => setDraggingId(null)}
                onPointerLeave={() => setDraggingId(null)}
                onPointerCancel={() => setDraggingId(null)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={props.imageUrl} alt="Encounter map" className="block h-auto w-full select-none" draggable={false} />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      `linear-gradient(to right, rgba(255,255,255,${previewOpacity}) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,${previewOpacity}) 1px, transparent 1px)`,
                    backgroundSize: `${100 / previewCols}% ${100 / previewRows}%`,
                    backgroundPosition: `${Number(offsetX) || 0}px ${Number(offsetY) || 0}px`,
                  }}
                />

                {tokens.map((token) => {
                  const isSelected = selectedTokenId === token.id;
                  return (
                    <button
                      key={token.id}
                      type="button"
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${token.x}%`, top: `${token.y}%` }}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        setSelectedTokenId(token.id);
                        setDraggingId(token.id);
                        setDidDrag(false);
                      }}
                      onPointerUp={() => {
                        setDraggingId(null);
                        if (!didDrag) setSelectedTokenId(token.id);
                      }}
                    >
                      {token.kind === "slot" ? (
                        <div
                          className={[
                            "flex h-11 w-11 items-center justify-center rounded-full border-2 text-[10px] font-semibold shadow-lg",
                            isSelected ? "border-cyan-200 bg-cyan-500 text-white" : "border-cyan-700 bg-cyan-950/90 text-cyan-100",
                          ].join(" ")}
                        >
                          P
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={[
                              "h-12 w-12 overflow-hidden rounded-full border-2 shadow-lg",
                              isSelected ? "border-white ring-2 ring-sky-400/80" : "border-neutral-200/70",
                            ].join(" ")}
                          >
                            {token.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={token.imageUrl} alt={token.label} className="h-full w-full object-cover" draggable={false} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-xs font-semibold text-white">
                                {initials(token.label)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-[3.5rem] rounded-full bg-black/70 px-2 py-1 text-center text-[10px] font-medium text-white">
                            {token.label}
                          </div>
                          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-neutral-800">
                            <div
                              className={`h-full ${tokenHealthTone(token.hpCurrent, token.hpMax)}`}
                              style={{ width: `${Math.max(0, Math.min(100, (token.hpCurrent / Math.max(1, token.hpMax)) * 100))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                Save an encounter image first. Then reopen this block to place starts and enemies on top of it.
              </div>
            )}
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-semibold">Encounter Brief</div>
            <label className="block space-y-1">
              <div className="text-xs text-gray-600">Summary</div>
              <textarea value={summary} onChange={(e) => setSummary(e.currentTarget.value)} className="h-20 w-full rounded border p-2" />
            </label>
            <label className="block space-y-1">
              <div className="text-xs text-gray-600">Objectives (one per line)</div>
              <textarea value={objectivesText} onChange={(e) => setObjectivesText(e.currentTarget.value)} className="h-24 w-full rounded border p-2" />
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-semibold">Grid + Scale</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <div className="text-xs text-gray-600">Columns</div>
                <input value={cols} onChange={(e) => setCols(e.currentTarget.value)} className="w-full rounded border p-2" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-gray-600">Rows</div>
                <input value={rows} onChange={(e) => setRows(e.currentTarget.value)} className="w-full rounded border p-2" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-gray-600">Cell Size</div>
                <input value={cellSize} onChange={(e) => setCellSize(e.currentTarget.value)} className="w-full rounded border p-2" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-gray-600">Feet Per Square</div>
                <input value={feetPerSquare} onChange={(e) => setFeetPerSquare(e.currentTarget.value)} className="w-full rounded border p-2" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-gray-600">Offset X</div>
                <input value={offsetX} onChange={(e) => setOffsetX(e.currentTarget.value)} className="w-full rounded border p-2" />
              </label>
              <label className="space-y-1">
                <div className="text-xs text-gray-600">Offset Y</div>
                <input value={offsetY} onChange={(e) => setOffsetY(e.currentTarget.value)} className="w-full rounded border p-2" />
              </label>
              <label className="col-span-2 space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Grid Line Opacity</span>
                  <span>{previewOpacity.toFixed(2)}</span>
                </div>
                <input type="range" min="0.05" max="1" step="0.05" value={lineOpacity} onChange={(e) => setLineOpacity(e.currentTarget.value)} className="w-full" />
              </label>
            </div>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-semibold">Initiative</div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={playerRolls} onChange={(e) => setPlayerRolls(e.currentTarget.checked)} />
              Players roll their own initiative
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRollEnemies} onChange={(e) => setAutoRollEnemies(e.currentTarget.checked)} />
              Auto-roll enemy initiative
            </label>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Selected Marker</div>
                <div className="text-xs text-gray-600">{selectedToken ? "Edit the selected start or enemy token." : "Choose a token on the map."}</div>
              </div>
              {selectedToken ? (
                <button type="button" className="rounded border border-red-300 px-2 py-1 text-xs text-red-700" onClick={removeSelectedToken}>
                  Remove
                </button>
              ) : null}
            </div>

            {selectedSlot ? (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <div className="text-xs text-gray-600">Start Label</div>
                  <input value={selectedSlot.label} onChange={(e) => updateSlot(selectedSlot.id, { label: e.currentTarget.value })} className="w-full rounded border p-2" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">X %</div>
                    <input value={selectedSlot.x ?? ""} onChange={(e) => updateSlot(selectedSlot.id, { x: Number(e.currentTarget.value) })} className="w-full rounded border p-2" />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">Y %</div>
                    <input value={selectedSlot.y ?? ""} onChange={(e) => updateSlot(selectedSlot.id, { y: Number(e.currentTarget.value) })} className="w-full rounded border p-2" />
                  </label>
                </div>
              </div>
            ) : null}

            {selectedEnemy ? (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <div className="text-xs text-gray-600">NPC Library</div>
                  <select
                    className="w-full rounded border p-2"
                    value={selectedEnemy.npcId}
                    onChange={(e) => {
                      const nextNpcId = String(e.currentTarget.value ?? "").trim();
                      const npc = npcById.get(nextNpcId);
                      updateEnemy(selectedEnemy.id, {
                        npcId: nextNpcId,
                        name: npc?.name ?? selectedEnemy.name,
                        imageUrl: String(npc?.medium_url ?? npc?.thumb_url ?? npc?.full_url ?? selectedEnemy.imageUrl).trim(),
                      });
                    }}
                  >
                    <option value="">Custom enemy</option>
                    {(props.npcOptions ?? []).map((npc) => (
                      <option key={npc.id} value={npc.id}>
                        {npc.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <div className="text-xs text-gray-600">Enemy Name</div>
                  <input value={selectedEnemy.name} onChange={(e) => updateEnemy(selectedEnemy.id, { name: e.currentTarget.value })} className="w-full rounded border p-2" />
                </label>
                <label className="block space-y-1">
                  <div className="text-xs text-gray-600">Portrait URL</div>
                  <input value={selectedEnemy.imageUrl} onChange={(e) => updateEnemy(selectedEnemy.id, { imageUrl: e.currentTarget.value })} className="w-full rounded border p-2" />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">Initiative Mod</div>
                    <input value={selectedEnemy.initiativeMod} onChange={(e) => updateEnemy(selectedEnemy.id, { initiativeMod: e.currentTarget.value })} className="w-full rounded border p-2" />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">Defense</div>
                    <input value={selectedEnemy.defense} onChange={(e) => updateEnemy(selectedEnemy.id, { defense: e.currentTarget.value })} className="w-full rounded border p-2" />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">HP Max</div>
                    <input value={selectedEnemy.hpMax} onChange={(e) => updateEnemy(selectedEnemy.id, { hpMax: e.currentTarget.value })} className="w-full rounded border p-2" />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">HP Current</div>
                    <input value={selectedEnemy.hpCurrent} onChange={(e) => updateEnemy(selectedEnemy.id, { hpCurrent: e.currentTarget.value })} className="w-full rounded border p-2" />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">X %</div>
                    <input value={selectedEnemy.x ?? ""} onChange={(e) => updateEnemy(selectedEnemy.id, { x: Number(e.currentTarget.value) })} className="w-full rounded border p-2" />
                  </label>
                  <label className="space-y-1">
                    <div className="text-xs text-gray-600">Y %</div>
                    <input value={selectedEnemy.y ?? ""} onChange={(e) => updateEnemy(selectedEnemy.id, { y: Number(e.currentTarget.value) })} className="w-full rounded border p-2" />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-sm font-semibold">Roster</div>
            <div className="mt-3 space-y-2">
              {slots.map((row) => (
                <button key={`slot:${row.id}`} type="button" onClick={() => setSelectedTokenId(`slot:${row.id}`)} className={["flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm", selectedTokenId === `slot:${row.id}` ? "border-cyan-500 bg-cyan-50" : "border-gray-200"].join(" ")}>
                  <span>{row.label || `Start ${row.id}`}</span>
                  <span className="text-xs text-gray-500">{Number(row.x ?? 50).toFixed(1)}%, {Number(row.y ?? 50).toFixed(1)}%</span>
                </button>
              ))}
              {enemies.map((row) => (
                <button key={`enemy:${row.id}`} type="button" onClick={() => setSelectedTokenId(`enemy:${row.id}`)} className={["flex w-full items-center justify-between rounded border px-3 py-2 text-left text-sm", selectedTokenId === `enemy:${row.id}` ? "border-sky-500 bg-sky-50" : "border-gray-200"].join(" ")}>
                  <span>{row.name || `Enemy ${row.id}`}</span>
                  <span className="text-xs text-gray-500">HP {row.hpCurrent || "0"}/{row.hpMax || "0"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
