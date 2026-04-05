"use client";

import { useMemo, useState } from "react";

type EnemyRow = {
  id: number;
  name: string;
  initiativeMod: string;
  hpMax: string;
  defense: string;
  x: string;
  y: string;
};

type SlotRow = {
  id: number;
  label: string;
  x: string;
  y: string;
};

function safeJsonParse(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function newEnemyRow(id: number): EnemyRow {
  return { id, name: "", initiativeMod: "0", hpMax: "6", defense: "", x: "", y: "" };
}

function newSlotRow(id: number): SlotRow {
  return { id, label: "", x: "", y: "" };
}

export default function EncounterEditorClient(props: {
  blockTitle?: string | null;
  imageUrl?: string | null;
  initialMeta?: any;
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
  const [playerRolls, setPlayerRolls] = useState<boolean>(encounter.initiative?.player_rolls !== false);
  const [autoRollEnemies, setAutoRollEnemies] = useState<boolean>(encounter.initiative?.auto_roll_enemies !== false);
  const [slots, setSlots] = useState<SlotRow[]>(
    Array.isArray(encounter.player_slots) && encounter.player_slots.length
      ? encounter.player_slots.map((row: any, index: number) => ({
          id: index + 1,
          label: String(row?.label ?? "").trim(),
          x: String(row?.x ?? ""),
          y: String(row?.y ?? ""),
        }))
      : [newSlotRow(1)]
  );
  const [enemies, setEnemies] = useState<EnemyRow[]>(
    Array.isArray(encounter.enemies) && encounter.enemies.length
      ? encounter.enemies.map((row: any, index: number) => ({
          id: index + 1,
          name: String(row?.name ?? "").trim(),
          initiativeMod: String(row?.initiative_mod ?? 0),
          hpMax: String(row?.hp_max ?? 6),
          defense: row?.defense == null ? "" : String(row.defense),
          x: row?.x == null ? "" : String(row.x),
          y: row?.y == null ? "" : String(row.y),
        }))
      : [newEnemyRow(1)]
  );

  const nextEnemyId = useMemo(() => Math.max(0, ...enemies.map((row) => row.id)) + 1, [enemies]);
  const nextSlotId = useMemo(() => Math.max(0, ...slots.map((row) => row.id)) + 1, [slots]);

  const metaJson = useMemo(() => {
    const parsedCols = Math.max(1, Number(cols) || 12);
    const parsedRows = Math.max(1, Number(rows) || 12);
    const parsedCellSize = Math.max(16, Number(cellSize) || 48);
    const parsedOffsetX = Number(offsetX) || 0;
    const parsedOffsetY = Number(offsetY) || 0;
    const cleanedObjectives = objectivesText
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    const cleanedSlots = slots
      .map((row, index) => ({
        id: `slot_${index + 1}`,
        label: row.label.trim() || `Start ${index + 1}`,
        x: row.x.trim() === "" ? null : Number(row.x),
        y: row.y.trim() === "" ? null : Number(row.y),
      }))
      .filter((row) => row.label.length > 0);
    const cleanedEnemies = enemies
      .map((row, index) => ({
        id: `enemy_${index + 1}`,
        name: row.name.trim() || `Enemy ${index + 1}`,
        initiative_mod: Number(row.initiativeMod) || 0,
        hp_max: Math.max(1, Number(row.hpMax) || 1),
        hp_current: Math.max(1, Number(row.hpMax) || 1),
        defense: row.defense.trim() === "" ? null : Number(row.defense),
        x: row.x.trim() === "" ? null : Number(row.x),
        y: row.y.trim() === "" ? null : Number(row.y),
      }))
      .filter((row) => row.name.length > 0);

    return JSON.stringify(
      {
        encounter: {
          version: 1,
          title: String(props.blockTitle ?? "Encounter").trim() || "Encounter",
          summary: summary.trim() || null,
          map_image_url: String(props.imageUrl ?? "").trim() || null,
          grid: {
            cols: parsedCols,
            rows: parsedRows,
            cell_size: parsedCellSize,
            offset_x: parsedOffsetX,
            offset_y: parsedOffsetY,
          },
          objectives: cleanedObjectives,
          player_slots: cleanedSlots,
          enemies: cleanedEnemies,
          initiative: {
            player_rolls: playerRolls,
            auto_roll_enemies: autoRollEnemies,
          },
        },
      },
      null,
      2
    );
  }, [cellSize, cols, enemies, objectivesText, offsetX, offsetY, playerRolls, autoRollEnemies, props.blockTitle, props.imageUrl, rows, slots, summary]);

  const previewCols = Math.max(1, Number(cols) || 12);
  const previewRows = Math.max(1, Number(rows) || 12);

  return (
    <div className="space-y-4">
      <input type="hidden" name="meta_json" value={metaJson} />

      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-sm font-semibold">Encounter Setup</div>

        <label className="block space-y-1">
          <div className="text-xs text-gray-600">Summary</div>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.currentTarget.value)}
            className="w-full rounded border p-2 h-20"
            placeholder="High-level encounter framing, stakes, and setup."
          />
        </label>

        <label className="block space-y-1">
          <div className="text-xs text-gray-600">Objectives (one per line)</div>
          <textarea
            value={objectivesText}
            onChange={(e) => setObjectivesText(e.currentTarget.value)}
            className="w-full rounded border p-2 h-24"
            placeholder={"Defeat the raiders\nProtect the ritualist\nHold for 3 rounds"}
          />
        </label>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="text-sm font-semibold">Map Grid</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <label className="space-y-1">
            <div className="text-xs text-gray-600">Cols</div>
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
            <div className="text-xs text-gray-600">Offset X</div>
            <input value={offsetX} onChange={(e) => setOffsetX(e.currentTarget.value)} className="w-full rounded border p-2" />
          </label>
          <label className="space-y-1">
            <div className="text-xs text-gray-600">Offset Y</div>
            <input value={offsetY} onChange={(e) => setOffsetY(e.currentTarget.value)} className="w-full rounded border p-2" />
          </label>
        </div>

        {props.imageUrl ? (
          <div className="rounded-lg border overflow-hidden">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={props.imageUrl} alt="Encounter map" className="w-full h-auto block" />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    `linear-gradient(to right, rgba(255,255,255,0.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.45) 1px, transparent 1px)`,
                  backgroundSize: `${100 / previewCols}% ${100 / previewRows}%`,
                }}
              />
            </div>
          </div>
        ) : (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            Save an image URL or upload an image for this encounter block to preview the grid overlay.
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Player Start Slots</div>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setSlots((prev) => [...prev, newSlotRow(nextSlotId)])}
          >
            Add Slot
          </button>
        </div>
        <div className="space-y-2">
          {slots.map((row) => (
            <div key={row.id} className="grid grid-cols-4 gap-2">
              <input
                value={row.label}
                onChange={(e) => setSlots((prev) => prev.map((slot) => (slot.id === row.id ? { ...slot, label: e.currentTarget.value } : slot)))}
                className="rounded border p-2"
                placeholder="Label"
              />
              <input
                value={row.x}
                onChange={(e) => setSlots((prev) => prev.map((slot) => (slot.id === row.id ? { ...slot, x: e.currentTarget.value } : slot)))}
                className="rounded border p-2"
                placeholder="X"
              />
              <input
                value={row.y}
                onChange={(e) => setSlots((prev) => prev.map((slot) => (slot.id === row.id ? { ...slot, y: e.currentTarget.value } : slot)))}
                className="rounded border p-2"
                placeholder="Y"
              />
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setSlots((prev) => (prev.length > 1 ? prev.filter((slot) => slot.id !== row.id) : prev))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Enemy Roster</div>
          <button
            type="button"
            className="rounded border px-2 py-1 text-xs"
            onClick={() => setEnemies((prev) => [...prev, newEnemyRow(nextEnemyId)])}
          >
            Add Enemy
          </button>
        </div>
        <div className="space-y-2">
          {enemies.map((row) => (
            <div key={row.id} className="grid grid-cols-7 gap-2">
              <input
                value={row.name}
                onChange={(e) => setEnemies((prev) => prev.map((enemy) => (enemy.id === row.id ? { ...enemy, name: e.currentTarget.value } : enemy)))}
                className="rounded border p-2"
                placeholder="Name"
              />
              <input
                value={row.initiativeMod}
                onChange={(e) => setEnemies((prev) => prev.map((enemy) => (enemy.id === row.id ? { ...enemy, initiativeMod: e.currentTarget.value } : enemy)))}
                className="rounded border p-2"
                placeholder="Init"
              />
              <input
                value={row.hpMax}
                onChange={(e) => setEnemies((prev) => prev.map((enemy) => (enemy.id === row.id ? { ...enemy, hpMax: e.currentTarget.value } : enemy)))}
                className="rounded border p-2"
                placeholder="HP"
              />
              <input
                value={row.defense}
                onChange={(e) => setEnemies((prev) => prev.map((enemy) => (enemy.id === row.id ? { ...enemy, defense: e.currentTarget.value } : enemy)))}
                className="rounded border p-2"
                placeholder="Def"
              />
              <input
                value={row.x}
                onChange={(e) => setEnemies((prev) => prev.map((enemy) => (enemy.id === row.id ? { ...enemy, x: e.currentTarget.value } : enemy)))}
                className="rounded border p-2"
                placeholder="X"
              />
              <input
                value={row.y}
                onChange={(e) => setEnemies((prev) => prev.map((enemy) => (enemy.id === row.id ? { ...enemy, y: e.currentTarget.value } : enemy)))}
                className="rounded border p-2"
                placeholder="Y"
              />
              <button
                type="button"
                className="rounded border px-2 py-1 text-xs"
                onClick={() => setEnemies((prev) => (prev.length > 1 ? prev.filter((enemy) => enemy.id !== row.id) : prev))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <div className="text-sm font-semibold">Initiative Rules</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={playerRolls} onChange={(e) => setPlayerRolls(e.currentTarget.checked)} />
          Players roll their own initiative
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoRollEnemies} onChange={(e) => setAutoRollEnemies(e.currentTarget.checked)} />
          Auto-roll enemy initiative
        </label>
      </div>

      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Generated Encounter JSON</summary>
        <textarea readOnly value={metaJson} className="mt-3 w-full rounded border p-2 h-64 font-mono text-[12px]" />
      </details>
    </div>
  );
}
