export type EncounterGrid = {
  cols: number;
  rows: number;
  cell_size: number;
  offset_x: number;
  offset_y: number;
  line_opacity: number;
  feet_per_square: number;
};

export type EncounterEnemyDef = {
  id: string;
  name: string;
  npc_id: string | null;
  image_url: string | null;
  initiative_mod: number;
  hp_max: number;
  hp_current: number;
  defense: number | null;
  x: number | null;
  y: number | null;
};

export type EncounterPlayerSlot = {
  id: string;
  label: string;
  x: number | null;
  y: number | null;
};

export type EncounterDefinition = {
  version: 1;
  title: string;
  summary: string | null;
  map_image_url: string | null;
  grid: EncounterGrid;
  objectives: string[];
  player_slots: EncounterPlayerSlot[];
  enemies: EncounterEnemyDef[];
  initiative: {
    player_rolls: boolean;
    auto_roll_enemies: boolean;
  };
};

export type EncounterCombatant = {
  id: string;
  kind: "player" | "enemy";
  name: string;
  player_id: string | null;
  character_id: string | null;
  npc_id: string | null;
  image_url: string | null;
  conditions: string[];
  initiative_mod: number;
  initiative_roll: number | null;
  initiative_total: number | null;
  hp_max: number | null;
  hp_current: number | null;
  defense: number | null;
  x: number | null;
  y: number | null;
  source_id: string | null;
  submitted_at: string | null;
};

export type EncounterLogEntry = {
  id: string;
  timestamp: string;
  type: "system" | "damage" | "heal" | "condition" | "note" | "move";
  text: string;
};

export type EncounterState = {
  encounter_block_id: string;
  title: string;
  summary: string | null;
  status: "initiative_pending" | "active" | "ended";
  round: number;
  turn_index: number;
  map_image_url: string | null;
  grid: EncounterGrid;
  objectives: string[];
  combatants: EncounterCombatant[];
  combat_log: EncounterLogEntry[];
  created_at: string;
  updated_at: string;
};

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cleanStringArray(input: unknown) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
}

export function abilityModifier(score: unknown) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}

export function initiativeModifierFromStatBlock(statBlock: any) {
  const dex = Number(statBlock?.abilities?.dex ?? 10);
  const dexMod = abilityModifier(dex);
  const bonus = Number(statBlock?.skills?.initiative ?? 0);
  return dexMod + (Number.isFinite(bonus) ? bonus : 0);
}

export function sortEncounterCombatants(combatants: EncounterCombatant[]) {
  return [...combatants].sort((a, b) => {
    const totalDiff = Number(b.initiative_total ?? -9999) - Number(a.initiative_total ?? -9999);
    if (totalDiff !== 0) return totalDiff;
    const modDiff = Number(b.initiative_mod ?? 0) - Number(a.initiative_mod ?? 0);
    if (modDiff !== 0) return modDiff;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });
}

export function normalizeEncounterDefinition(input: unknown, fallbackTitle = "Encounter"): EncounterDefinition {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, any>) : {};
  const rawGrid = raw.grid && typeof raw.grid === "object" && !Array.isArray(raw.grid) ? (raw.grid as Record<string, any>) : {};
  const enemies = (Array.isArray(raw.enemies) ? raw.enemies : [])
    .map((row: any, index) => ({
      id: String(row?.id ?? `enemy_${index + 1}`).trim() || `enemy_${index + 1}`,
      name: String(row?.name ?? `Enemy ${index + 1}`).trim() || `Enemy ${index + 1}`,
      npc_id: String(row?.npc_id ?? "").trim() || null,
      image_url: String(row?.image_url ?? "").trim() || null,
      initiative_mod: toInt(row?.initiative_mod, 0),
      hp_max: Math.max(1, toInt(row?.hp_max, 1)),
      hp_current: Math.max(0, toInt(row?.hp_current, toInt(row?.hp_max, 1))),
      defense: Number.isFinite(Number(row?.defense ?? NaN)) ? toInt(row?.defense, 10) : null,
      x: Number.isFinite(Number(row?.x ?? NaN)) ? toInt(row?.x, 0) : null,
      y: Number.isFinite(Number(row?.y ?? NaN)) ? toInt(row?.y, 0) : null,
    }))
    .filter((row) => row.name.length > 0);
  const playerSlots = (Array.isArray(raw.player_slots) ? raw.player_slots : [])
    .map((row: any, index) => ({
      id: String(row?.id ?? `slot_${index + 1}`).trim() || `slot_${index + 1}`,
      label: String(row?.label ?? `Start ${index + 1}`).trim() || `Start ${index + 1}`,
      x: Number.isFinite(Number(row?.x ?? NaN)) ? toInt(row?.x, 0) : null,
      y: Number.isFinite(Number(row?.y ?? NaN)) ? toInt(row?.y, 0) : null,
    }))
    .filter((row) => row.label.length > 0);

  return {
    version: 1,
    title: String(raw.title ?? fallbackTitle).trim() || fallbackTitle,
    summary: String(raw.summary ?? "").trim() || null,
    map_image_url: String(raw.map_image_url ?? raw.mapImageUrl ?? "").trim() || null,
    grid: {
      cols: clamp(toInt(rawGrid.cols, 12), 1, 64),
      rows: clamp(toInt(rawGrid.rows, 12), 1, 64),
      cell_size: clamp(toInt(rawGrid.cell_size, 48), 16, 256),
      offset_x: toInt(rawGrid.offset_x, 0),
      offset_y: toInt(rawGrid.offset_y, 0),
      line_opacity: clamp(Number(rawGrid.line_opacity ?? 0.35) || 0.35, 0.05, 1),
      feet_per_square: clamp(toInt(rawGrid.feet_per_square, 5), 1, 100),
    },
    objectives: cleanStringArray(raw.objectives),
    player_slots: playerSlots,
    enemies,
    initiative: {
      player_rolls: raw?.initiative?.player_rolls !== false,
      auto_roll_enemies: raw?.initiative?.auto_roll_enemies !== false,
    },
  };
}

export function normalizeEncounterState(input: unknown): EncounterState | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, any>;
  const blockId = String(raw.encounter_block_id ?? "").trim();
  if (!blockId) return null;
  const def = normalizeEncounterDefinition(
    {
      title: raw.title,
      summary: raw.summary,
      map_image_url: raw.map_image_url,
      grid: raw.grid,
      objectives: raw.objectives,
    },
    String(raw.title ?? "Encounter")
  );
  const combatants = (Array.isArray(raw.combatants) ? raw.combatants : [])
    .map((row: any, index) => ({
      id: String(row?.id ?? `combatant_${index + 1}`).trim() || `combatant_${index + 1}`,
      kind: (String(row?.kind ?? "").trim().toLowerCase() === "enemy" ? "enemy" : "player") as "player" | "enemy",
      name: String(row?.name ?? `Combatant ${index + 1}`).trim() || `Combatant ${index + 1}`,
      player_id: String(row?.player_id ?? "").trim() || null,
      character_id: String(row?.character_id ?? "").trim() || null,
      npc_id: String(row?.npc_id ?? "").trim() || null,
      image_url: String(row?.image_url ?? "").trim() || null,
      conditions: cleanStringArray(row?.conditions),
      initiative_mod: toInt(row?.initiative_mod, 0),
      initiative_roll: Number.isFinite(Number(row?.initiative_roll ?? NaN)) ? toInt(row?.initiative_roll, 0) : null,
      initiative_total: Number.isFinite(Number(row?.initiative_total ?? NaN)) ? toInt(row?.initiative_total, 0) : null,
      hp_max: Number.isFinite(Number(row?.hp_max ?? NaN)) ? Math.max(0, toInt(row?.hp_max, 0)) : null,
      hp_current: Number.isFinite(Number(row?.hp_current ?? NaN)) ? Math.max(0, toInt(row?.hp_current, 0)) : null,
      defense: Number.isFinite(Number(row?.defense ?? NaN)) ? toInt(row?.defense, 0) : null,
      x: Number.isFinite(Number(row?.x ?? NaN)) ? toInt(row?.x, 0) : null,
      y: Number.isFinite(Number(row?.y ?? NaN)) ? toInt(row?.y, 0) : null,
      source_id: String(row?.source_id ?? "").trim() || null,
      submitted_at: String(row?.submitted_at ?? "").trim() || null,
    }))
    .filter((row) => row.name.length > 0);
  const combatLog = (Array.isArray(raw.combat_log) ? raw.combat_log : [])
    .map((row: any, index) => ({
      id: String(row?.id ?? `log_${index + 1}`).trim() || `log_${index + 1}`,
      timestamp: String(row?.timestamp ?? "").trim() || new Date(0).toISOString(),
      type: (["system", "damage", "heal", "condition", "note", "move"].includes(String(row?.type ?? "").trim().toLowerCase())
        ? String(row?.type ?? "").trim().toLowerCase()
        : "note") as EncounterLogEntry["type"],
      text: String(row?.text ?? "").trim(),
    }))
    .filter((row) => row.text.length > 0);

  return {
    encounter_block_id: blockId,
    title: def.title,
    summary: String(raw.summary ?? "").trim() || null,
    status: String(raw.status ?? "").trim().toLowerCase() === "active"
      ? "active"
      : String(raw.status ?? "").trim().toLowerCase() === "ended"
        ? "ended"
        : "initiative_pending",
    round: Math.max(1, toInt(raw.round, 1)),
    turn_index: Math.max(0, toInt(raw.turn_index, 0)),
    map_image_url: def.map_image_url,
    grid: def.grid,
    objectives: def.objectives,
    combatants: sortEncounterCombatants(combatants),
    combat_log: combatLog,
    created_at: String(raw.created_at ?? "").trim() || new Date(0).toISOString(),
    updated_at: String(raw.updated_at ?? "").trim() || new Date(0).toISOString(),
  };
}
