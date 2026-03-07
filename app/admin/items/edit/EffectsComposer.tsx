"use client";

import { useMemo, useState } from "react";

const EFFECT_KEYS: Record<string, { label: string; value: string }[]> = {
  ability: ["str", "dex", "con", "int", "wis", "cha"].map((k) => ({ label: k.toUpperCase(), value: k })),
  ac: [{ label: "AC", value: "ac" }],
  speed: [{ label: "Speed", value: "speed" }],
  skill: [
    "athletics",
    "acrobatics",
    "sleight_of_hand",
    "stealth",
    "arcana",
    "history",
    "investigation",
    "nature",
    "religion",
    "animal_handling",
    "insight",
    "medicine",
    "perception",
    "survival",
    "deception",
    "intimidation",
    "performance",
    "persuasion",
  ].map((k) => ({ label: k, value: k })),
  save: ["str_save", "dex_save", "con_save", "int_save", "wis_save", "cha_save"].map((k) => ({
    label: k,
    value: k,
  })),
  resistance: [
    "bludgeoning",
    "piercing",
    "slashing",
    "fire",
    "cold",
    "lightning",
    "thunder",
    "acid",
    "poison",
    "necrotic",
    "radiant",
    "psychic",
    "force",
  ].map((k) => ({ label: k, value: k })),
  immunity: [
    "bludgeoning",
    "piercing",
    "slashing",
    "fire",
    "cold",
    "lightning",
    "thunder",
    "acid",
    "poison",
    "necrotic",
    "radiant",
    "psychic",
    "force",
  ].map((k) => ({ label: k, value: k })),
  advantage: [
    "athletics",
    "acrobatics",
    "sleight_of_hand",
    "stealth",
    "arcana",
    "history",
    "investigation",
    "nature",
    "religion",
    "animal_handling",
    "insight",
    "medicine",
    "perception",
    "survival",
    "deception",
    "intimidation",
    "performance",
    "persuasion",
    "initiative",
  ].map((k) => ({ label: k, value: k })),
  passive: [{ label: "Passive", value: "passive" }],
  special: [
    { label: "Special", value: "special" },
    { label: "Class Package", value: "class_package" },
  ],
};

const EFFECT_MODES: Record<string, { label: string; value: string }[]> = {
  ability: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  ac: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  speed: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  skill: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  save: [
    { label: "add", value: "add" },
    { label: "set", value: "set" },
  ],
  resistance: [{ label: "grant", value: "grant" }],
  immunity: [{ label: "grant", value: "grant" }],
  advantage: [{ label: "grant", value: "grant" }],
  passive: [
    { label: "equipped", value: "equipped" },
    { label: "owned", value: "owned" },
  ],
  special: [{ label: "note", value: "note" }],
};

type Row = { id: number; type: string };

function newRow(id: number): Row {
  return { id, type: "ability" };
}

export default function EffectsComposer({
  itemId,
  addEffectAction,
}: {
  itemId: string;
  addEffectAction: (formData: FormData) => Promise<void>;
}) {
  const [rows, setRows] = useState<Row[]>([newRow(1)]);

  const nextId = useMemo(() => Math.max(0, ...rows.map((r) => r.id)) + 1, [rows]);

  return (
    <div className="rounded-2xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-semibold">Add Effects</div>
          <p className="text-xs text-muted-foreground">Use compact rows and add more only when needed.</p>
        </div>
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, newRow(nextId)])}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-muted"
        >
          Add another effect
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {rows.map((row, index) => {
          const keys = EFFECT_KEYS[row.type] ?? EFFECT_KEYS.ability;
          const modes = EFFECT_MODES[row.type] ?? EFFECT_MODES.ability;
          const needsValue = ["ability", "ac", "speed", "skill", "save"].includes(row.type);
          const needsNotes = row.type === "special" || row.type === "passive";

          return (
            <form
              key={row.id}
              action={addEffectAction}
              className="rounded-xl border p-3"
              onSubmit={() => {
                // keep row for fast repeated adds
              }}
            >
              <input type="hidden" name="item_id" value={itemId} />

              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">Effect #{index + 1}</div>
                {rows.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((r) => r.id !== row.id))}
                    className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                <div>
                  <label className="text-xs text-muted-foreground">Type</label>
                  <select
                    name="effect_type"
                    value={row.type}
                    onChange={(e) => {
                      const type = e.target.value;
                      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, type } : r)));
                    }}
                    className="mt-1 h-9 w-full rounded-md border px-2 text-sm"
                  >
                    {Object.keys(EFFECT_KEYS).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Key</label>
                  <select name="effect_key" className="mt-1 h-9 w-full rounded-md border px-2 text-sm" defaultValue={keys[0]?.value}>
                    {keys.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Mode</label>
                  <select name="mode" className="mt-1 h-9 w-full rounded-md border px-2 text-sm" defaultValue={modes[0]?.value}>
                    {modes.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Value</label>
                  <input
                    name="value"
                    type="number"
                    step="1"
                    disabled={!needsValue}
                    placeholder={needsValue ? "required" : "-"}
                    className="mt-1 h-9 w-full rounded-md border px-3 text-sm disabled:bg-muted"
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Sort</label>
                  <input name="sort_order" type="number" step="1" defaultValue={0} className="mt-1 h-9 w-full rounded-md border px-3 text-sm" />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">
                    {needsNotes ? "Player note" : "Notes"}
                  </label>
                  <input
                    name="notes"
                    placeholder={needsNotes ? "required" : "optional"}
                    className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  />
                </div>
              </div>
              {row.type === "passive" ? (
                <div className="mt-2">
                  <label className="text-xs text-muted-foreground">Storyteller note (optional)</label>
                  <input
                    name="storyteller_note"
                    placeholder="Only visible on storyteller player-passives drawer"
                    className="mt-1 h-9 w-full rounded-md border px-3 text-sm"
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <input type="checkbox" name="passive_save_trigger" />
                    Enable storyteller save-trigger button for this passive
                  </label>
                </div>
              ) : null}

              <div className="mt-2 flex justify-end">
                <button className="h-9 rounded-md border px-3 text-sm hover:bg-muted" type="submit">
                  Add Effect
                </button>
              </div>
            </form>
          );
        })}
      </div>
    </div>
  );
}
