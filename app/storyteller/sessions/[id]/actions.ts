"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { randomUUID } from "crypto";
import {
  EncounterCombatant,
  EncounterLogEntry,
  normalizeEncounterDefinition,
  normalizeEncounterState,
  initiativeModifierFromStatBlock,
  sortEncounterCombatants,
} from "@/lib/encounter";
import { extractHexMarkers } from "@/lib/episodeRuntime";

/**
 * Loads the DM session, state, and joined players
 * SAFE VERSION:
 * - Uses maybeSingle() instead of single()
 * - Guards against null (RLS or invalid id)
 * - Prevents "Cannot coerce result to a single JSON object"
 */
export async function getDmSession(sessionId: string) {
  const supabase = await createClient();

  // --- SESSION ---
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr) {
    console.error("getDmSession: session error", sessionErr.message);
    redirect("/storyteller/sessions");
  }

  if (!session) {
    console.error("getDmSession: no session returned for", sessionId);
    redirect("/storyteller/sessions");
  }

  // --- SESSION STATE ---
  const { data: state, error: stateErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (stateErr) {
    console.error("getDmSession: state error", stateErr.message);
    redirect("/storyteller/sessions");
  }

  // Ensure state always exists (prevents undefined reads)
  const safeState =
    state ??
    ({
      session_id: sessionId,
      timer_status: "stopped",
      remaining_seconds: session.duration_seconds ?? 0,
      completed_scene_ids: [],
    } as any);

  // --- JOINS (players connected to the session) ---
  // Your table has: session_id, player_id, joined_at
  // ✅ Use joined_at for ordering
  let joins: any[] = [];
  {
    const res = await supabase
      .from("session_players")
      .select("player_id, joined_at")
      .eq("session_id", sessionId)
      .order("joined_at", { ascending: true }); // ✅ FIX

    if (res.error) {
      console.error("getDmSession: joins error", res.error.message);
      joins = [];
    } else {
      joins = res.data ?? [];
    }
  }

  return {
    session,
    state: safeState,
    joins,
  };
}

/**
 * Updates the shared story text (DM-controlled)
 */
export async function updateStoryText(sessionId: string, fd: FormData) {
  const supabase = await createClient();
  const storyText = String(fd.get("story_text") ?? "");

  const { error } = await supabase.from("sessions").update({ story_text: storyText }).eq("id", sessionId);
  if (error) throw new Error(error.message);
}

/**
 * Generic state update helper
 */
export async function updateState(sessionId: string, patch: Record<string, any>) {
  const supabase = await createClient();

  const { error } = await supabase.from("session_state").update(patch).eq("session_id", sessionId);
  if (error) throw new Error(error.message);
}

function appendEncounterLog(
  current: EncounterLogEntry[] | undefined,
  entry: Omit<EncounterLogEntry, "id" | "timestamp">
) {
  const nextEntry: EncounterLogEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    type: entry.type,
    text: entry.text,
  };
  return [...(Array.isArray(current) ? current : []), nextEntry].slice(-60);
}

function isDefeatedCombatant(row: EncounterCombatant | null | undefined) {
  if (!row) return false;
  return Number.isFinite(Number(row.hp_current ?? NaN)) && Number(row.hp_current) <= 0;
}

function nextLivingTurnIndex(combatants: EncounterCombatant[], startIndex: number) {
  if (!combatants.length) return 0;
  for (let offset = 0; offset < combatants.length; offset += 1) {
    const idx = (startIndex + offset) % combatants.length;
    const row = combatants[idx];
    if (!isDefeatedCombatant(row)) return idx;
  }
  return 0;
}

async function persistEncounterCombatantHp(
  supabase: Awaited<ReturnType<typeof createClient>>,
  characterId: string,
  hpCurrent: number
) {
  const { data: charRow, error: charErr } = await supabase
    .from("characters")
    .select("id,stat_block")
    .eq("id", characterId)
    .maybeSingle();
  if (charErr) throw new Error(charErr.message);
  if (!charRow?.id) throw new Error("Character not found.");

  const statBlock = ((charRow as any).stat_block ?? {}) as Record<string, any>;
  const nextStatBlock = {
    ...statBlock,
    derived: {
      ...((statBlock.derived ?? {}) as Record<string, any>),
      hp_current: hpCurrent,
    },
  };

  const { error: upCharErr } = await supabase
    .from("characters")
    .update({ stat_block: nextStatBlock })
    .eq("id", characterId);
  if (upCharErr) throw new Error(upCharErr.message);

  const { error: upCurErr } = await supabase
    .from("character_stats_current")
    .update({ stat_block_current: nextStatBlock })
    .eq("character_id", characterId);
  if (upCurErr) {
    const msg = String(upCurErr.message ?? "").toLowerCase();
    if (!msg.includes("cannot update view") && !msg.includes("not automatically updatable")) {
      throw new Error(upCurErr.message);
    }
  }
}

export async function storytellerStartEncounter(input: {
  sessionId: string;
  encounterBlockId: string;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const encounterBlockId = String(input.encounterBlockId ?? "").trim();
  if (!isUuid(sessionId) || !isUuid(encounterBlockId)) throw new Error("Missing encounter details.");

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const { data: block, error: blockErr } = await supabase
    .from("episode_blocks")
    .select("id,title,body,image_url,meta")
    .eq("id", encounterBlockId)
    .maybeSingle();
  if (blockErr) throw new Error(blockErr.message);
  if (!block?.id) throw new Error("Encounter block not found.");

  const meta = ((block as any).meta ?? {}) as Record<string, any>;
  const encounterDef = normalizeEncounterDefinition(
    meta?.encounter && typeof meta.encounter === "object" ? meta.encounter : meta,
    String((block as any).title ?? "Encounter")
  );

  const targets = await getSessionCharacterTargets(sessionId);
  const characterIds = targets.map((t) => t.characterId);
  const { data: charRows, error: charErr } = characterIds.length
    ? await admin
        .from("characters")
        .select("id,user_id,name,stat_block")
        .in("id", characterIds)
    : { data: [], error: null as any };
  if (charErr) throw new Error(charErr.message);
  const charsById = new Map<string, any>((charRows ?? []).map((row: any) => [String(row.id), row]));

  const { data: currentRows, error: currentErr } = characterIds.length
    ? await admin
        .from("character_stats_current")
        .select("character_id,stat_block_current")
        .in("character_id", characterIds)
    : { data: [], error: null as any };
  if (currentErr && !String(currentErr.message ?? "").toLowerCase().includes("does not exist")) {
    throw new Error(currentErr.message);
  }
  const currentByCharacterId = new Map<string, any>(
    (currentRows ?? []).map((row: any) => [String(row.character_id), (row as any).stat_block_current ?? null])
  );

  const combatants: EncounterCombatant[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const char = charsById.get(target.characterId);
    const statBlock = currentByCharacterId.get(target.characterId) ?? char?.stat_block ?? {};
    const slot = encounterDef.player_slots[i] ?? null;
    combatants.push({
      id: `player_${target.playerId}`,
      kind: "player",
      name: String(char?.name ?? "Adventurer").trim() || "Adventurer",
      player_id: target.playerId,
      character_id: target.characterId,
      npc_id: null,
      image_url: null,
      conditions: [],
      initiative_mod: initiativeModifierFromStatBlock(statBlock),
      initiative_roll: null,
      initiative_total: null,
      hp_max: Number.isFinite(Number(statBlock?.derived?.hp_max ?? NaN)) ? Number(statBlock.derived.hp_max) : null,
      hp_current: Number.isFinite(Number(statBlock?.derived?.hp_current ?? NaN)) ? Number(statBlock.derived.hp_current) : null,
      defense: Number.isFinite(Number(statBlock?.derived?.defense ?? NaN)) ? Number(statBlock.derived.defense) : null,
      x: slot?.x ?? null,
      y: slot?.y ?? null,
      source_id: target.characterId,
      submitted_at: null,
    });
  }

  for (const enemy of encounterDef.enemies) {
    const roll = encounterDef.initiative.auto_roll_enemies ? Math.floor(Math.random() * 20) + 1 : null;
    combatants.push({
      id: enemy.id,
      kind: "enemy",
      name: enemy.name,
      player_id: null,
      character_id: null,
      npc_id: enemy.npc_id,
      image_url: enemy.image_url,
      conditions: [],
      initiative_mod: enemy.initiative_mod,
      initiative_roll: roll,
      initiative_total: roll == null ? null : roll + enemy.initiative_mod,
      hp_max: enemy.hp_max,
      hp_current: enemy.hp_current,
      defense: enemy.defense,
      x: enemy.x,
      y: enemy.y,
      source_id: enemy.id,
      submitted_at: roll == null ? null : new Date().toISOString(),
    });
  }

  const nowIso = new Date().toISOString();
  const encounterState = {
    encounter_block_id: encounterBlockId,
    title: encounterDef.title,
    summary: encounterDef.summary,
    status: "initiative_pending",
    round: 1,
    turn_index: 0,
    map_image_url: encounterDef.map_image_url || String((block as any).image_url ?? "").trim() || null,
    grid: encounterDef.grid,
    objectives: encounterDef.objectives,
    combatants: sortEncounterCombatants(combatants),
    combat_log: [
      {
        id: randomUUID(),
        timestamp: nowIso,
        type: "system",
        text: `Encounter started: ${encounterDef.title}`,
      },
    ],
    turn_action: null,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await updateState(sessionId, { encounter_state: encounterState });
}

export async function storytellerLockEncounterInitiative(input: { sessionId: string }) {
  const sessionId = String(input.sessionId ?? "").trim();
  if (!isUuid(sessionId)) throw new Error("Missing session.");
  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  const pendingPlayers = encounter.combatants.filter((row) => row.kind === "player" && row.initiative_total == null);
  if (pendingPlayers.length) {
    throw new Error("Players still need to roll initiative.");
  }
  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      status: "active",
      round: 1,
      turn_index: nextLivingTurnIndex(sortEncounterCombatants(encounter.combatants), 0),
      combatants: sortEncounterCombatants(encounter.combatants),
      turn_action: null,
      combat_log: appendEncounterLog(encounter.combat_log, {
        type: "system",
        text: "Initiative locked. Round 1 begins.",
      }),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function storytellerAdvanceEncounterTurn(input: { sessionId: string }) {
  const sessionId = String(input.sessionId ?? "").trim();
  if (!isUuid(sessionId)) throw new Error("Missing session.");
  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  if (!encounter.combatants.length) throw new Error("No combatants.");
  const combatants = encounter.combatants;
  const tentativeIndex = encounter.turn_index + 1;
  const wrapped = tentativeIndex >= combatants.length;
  const nextIndex = nextLivingTurnIndex(combatants, wrapped ? 0 : tentativeIndex);
  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      status: "active",
      round: wrapped ? encounter.round + 1 : encounter.round,
      turn_index: nextIndex,
      turn_action: null,
      combat_log: appendEncounterLog(encounter.combat_log, {
        type: "system",
        text: wrapped
          ? `Round ${encounter.round + 1} begins.`
          : `Turn passes to ${String(combatants[nextIndex]?.name ?? "next combatant")}.`,
      }),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function storytellerConsumeEncounterTurnAction(input: {
  sessionId: string;
  combatantId: string;
  actionId?: string | null;
  actionName?: string | null;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const combatantId = String(input.combatantId ?? "").trim();
  if (!isUuid(sessionId) || !combatantId) throw new Error("Missing turn action details.");

  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  if (encounter.status !== "active") throw new Error("Encounter is not in an active round.");

  const currentTurn = encounter.combatants[encounter.turn_index] ?? null;
  if (!currentTurn || String(currentTurn.id ?? "") !== combatantId) {
    throw new Error("It is not this combatant's turn.");
  }
  if (isDefeatedCombatant(currentTurn)) {
    throw new Error(`${currentTurn.name} is defeated and cannot act.`);
  }
  if (
    encounter.turn_action &&
    encounter.turn_action.round === encounter.round &&
    encounter.turn_action.combatant_id === combatantId
  ) {
    return { ok: true as const, alreadyUsed: true as const };
  }

  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      turn_action: {
        round: encounter.round,
        combatant_id: combatantId,
        action_id: String(input.actionId ?? "").trim() || null,
        action_name: String(input.actionName ?? "").trim() || null,
        consumed_at: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    },
  });
  return { ok: true as const };
}

export async function storytellerEndEncounter(input: { sessionId: string }) {
  const sessionId = String(input.sessionId ?? "").trim();
  if (!isUuid(sessionId)) throw new Error("Missing session.");
  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) return;
  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      status: "ended",
      combat_log: appendEncounterLog(encounter.combat_log, {
        type: "system",
        text: `Encounter ended: ${encounter.title}`,
      }),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function storytellerMoveEncounterCombatant(input: {
  sessionId: string;
  combatantId: string;
  x: number;
  y: number;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const combatantId = String(input.combatantId ?? "").trim();
  if (!isUuid(sessionId) || !combatantId) throw new Error("Missing movement details.");
  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  const x = Math.max(0, Math.min(100, Number(input.x) || 0));
  const y = Math.max(0, Math.min(100, Number(input.y) || 0));
  const moved = encounter.combatants.find((row) => row.id === combatantId);
  if (!moved) throw new Error("Combatant not found.");
  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      combatants: encounter.combatants.map((row) => (row.id === combatantId ? { ...row, x, y } : row)),
      combat_log: appendEncounterLog(encounter.combat_log, {
        type: "move",
        text: `${moved.name} moved to ${x.toFixed(1)}%, ${y.toFixed(1)}%.`,
      }),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function storytellerUpdateEncounterCombatant(input: {
  sessionId: string;
  combatantId: string;
  hpCurrent?: number | null;
  defense?: number | null;
  conditions?: string[] | null;
  note?: string | null;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const combatantId = String(input.combatantId ?? "").trim();
  if (!isUuid(sessionId) || !combatantId) throw new Error("Missing combatant details.");
  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  const current = encounter.combatants.find((row) => row.id === combatantId);
  if (!current) throw new Error("Combatant not found.");

  const hpCurrent =
    input.hpCurrent == null || !Number.isFinite(Number(input.hpCurrent))
      ? current.hp_current
      : Math.max(0, Math.min(Math.max(0, Number(current.hp_max ?? 0)), Math.floor(Number(input.hpCurrent))));
  const defense =
    input.defense == null || !Number.isFinite(Number(input.defense))
      ? current.defense
      : Math.max(0, Math.floor(Number(input.defense)));
  const conditions = Array.from(
    new Set((Array.isArray(input.conditions) ? input.conditions : []).map((v) => String(v ?? "").trim()).filter(Boolean))
  );
  const note = String(input.note ?? "").trim();
  const hpDelta =
    Number.isFinite(Number(current.hp_current ?? NaN)) && Number.isFinite(Number(hpCurrent ?? NaN))
      ? Number(hpCurrent) - Number(current.hp_current)
      : null;
  const logEntries = [...(encounter.combat_log ?? [])];
  if (hpDelta != null && hpDelta !== 0) {
    logEntries.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: hpDelta < 0 ? "damage" : "heal",
      text: `${current.name} ${hpDelta < 0 ? `takes ${Math.abs(hpDelta)}` : `recovers ${hpDelta}`} HP (${hpCurrent}/${current.hp_max ?? "?"}).`,
    });
  }
  if (conditions.join("|") !== (current.conditions ?? []).join("|")) {
    logEntries.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "condition",
      text: `${current.name} conditions: ${conditions.length ? conditions.join(", ") : "none"}.`,
    });
  }
  if (note) {
    logEntries.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "note",
      text: note,
    });
  }
  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      combatants: encounter.combatants.map((row) =>
        row.id === combatantId ? { ...row, hp_current: hpCurrent, defense, conditions } : row
      ),
      combat_log: logEntries.slice(-60),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function storytellerAddEncounterLogNote(input: {
  sessionId: string;
  text: string;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const text = String(input.text ?? "").trim();
  if (!isUuid(sessionId) || !text) throw new Error("Missing note.");
  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      combat_log: appendEncounterLog(encounter.combat_log, { type: "note", text }),
      updated_at: new Date().toISOString(),
    },
  });
}

export async function storytellerApplyEncounterDamageAction(input: {
  sessionId: string;
  targetCombatantId: string;
  amount: number;
  sourceText: string;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const targetCombatantId = String(input.targetCombatantId ?? "").trim();
  const amount = Math.max(0, Math.floor(Number(input.amount ?? 0) || 0));
  const sourceText = String(input.sourceText ?? "").trim();
  if (!isUuid(sessionId) || !targetCombatantId || amount <= 0) throw new Error("Missing damage details.");

  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) throw new Error("Encounter not active.");
  const target = encounter.combatants.find((row) => row.id === targetCombatantId);
  if (!target) throw new Error("Target not found.");

  const nextCombatants = encounter.combatants.map((row) =>
    row.id === targetCombatantId
      ? { ...row, hp_current: Math.max(0, Number(row.hp_current ?? 0) - amount) }
      : row
  );
  const targetHp = nextCombatants.find((row) => row.id === targetCombatantId);
  const combatLog = appendEncounterLog(
    appendEncounterLog(encounter.combat_log, { type: "damage", text: sourceText }),
    {
      type: "damage",
      text: `${target.name} takes ${amount} damage (${targetHp?.hp_current ?? "?"}/${target.hp_max ?? "?"} HP).`,
    }
  );

  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      combatants: nextCombatants,
      combat_log: combatLog,
      updated_at: new Date().toISOString(),
    },
  });
  if (target.character_id && targetHp?.hp_current != null) {
    await persistEncounterCombatantHp(supabase, String(target.character_id), Number(targetHp.hp_current));
  }
}

export async function storytellerRollEncounterAction(input: {
  sessionId: string;
  combatantId: string;
  actionName: string;
  targetCombatantId?: string | null;
  targetName?: string | null;
  attackBonus?: number | null;
  damageDice?: string | null;
  damageBonus?: number | null;
}): Promise<{ ok: boolean; hit?: boolean; targetName?: string | null; attackText?: string | null; damageText?: string | null; error?: string }> {
  const sessionId = String(input.sessionId ?? "").trim();
  const combatantId = String(input.combatantId ?? "").trim();
  const actionName = String(input.actionName ?? "").trim() || "Action";
  if (!isUuid(sessionId) || !combatantId) return { ok: false, error: "Missing combat action details." };

  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) return { ok: false, error: "Encounter not active." };
  const actor = encounter.combatants.find((row) => row.id === combatantId);
  if (!actor) return { ok: false, error: "Combatant not found." };

  const targetCombatantId = String(input.targetCombatantId ?? "").trim();
  const targetCombatant = targetCombatantId
    ? encounter.combatants.find((row) => row.id === targetCombatantId) ?? null
    : null;
  const targetName = String(input.targetName ?? "").trim() || String(targetCombatant?.name ?? "").trim();
  const attackBonus = Number.isFinite(Number(input.attackBonus ?? NaN)) ? Math.floor(Number(input.attackBonus)) : null;
  const damageDice = String(input.damageDice ?? "").trim().toLowerCase();
  const damageBonus = Number.isFinite(Number(input.damageBonus ?? NaN)) ? Math.floor(Number(input.damageBonus)) : 0;
  if (!targetCombatant && !targetName) return { ok: false, error: "Choose a target first." };
  const nextLog = [...(encounter.combat_log ?? [])];
  let didHit: boolean | undefined;
  let nextCombatants = [...encounter.combatants];
  let attackText: string | null = null;
  let damageText: string | null = null;

  if (attackBonus != null) {
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + attackBonus;
    const targetDefense = Number.isFinite(Number(targetCombatant?.defense ?? NaN)) ? Number(targetCombatant?.defense) : null;
    if (targetCombatant && targetDefense == null) {
      return { ok: false, error: `${targetCombatant.name} has no defense/AC set yet.` };
    }
    didHit = targetDefense == null ? undefined : total >= targetDefense;
    attackText = `${actor.name} uses ${actionName}${targetName ? ` vs ${targetName}` : ""}: hit roll ${total} (d20 ${d20}${attackBonus ? ` + ${attackBonus}` : ""})${didHit === true ? " HIT" : didHit === false ? " MISS" : ""}.`;
    nextLog.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "note",
      text: attackText,
    });
  }

  if (damageDice) {
    if (attackBonus == null && targetCombatant && !Number.isFinite(Number(targetCombatant?.defense ?? NaN)) && !String(input.targetName ?? "").trim()) {
      return { ok: false, error: `${targetCombatant.name} has no defense/AC set yet.` };
    }
    const match = damageDice.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
    if (!match) return { ok: false, error: "Damage dice must look like 1d8 or 2d6+3." };
    const count = Math.max(1, Number(match[1] || 1));
    const sides = Math.max(2, Number(match[2] || 2));
    const inlineBonus = Number(match[3] || 0);
    const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
    const total = rolls.reduce((sum, n) => sum + n, 0) + inlineBonus + damageBonus;
    const totalBonus = inlineBonus + damageBonus;
    if (didHit === false) {
      nextLog.push({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        type: "note",
        text: `${actor.name} cannot apply ${actionName} damage because the attack missed.`,
      });
      damageText = `${actor.name} cannot apply ${actionName} damage because the attack missed.`;
    } else if (attackBonus != null && didHit == null) {
      return { ok: false, error: "Roll attack first." };
    } else if (targetCombatant && Number.isFinite(Number(targetCombatant.hp_current ?? NaN))) {
      nextCombatants = encounter.combatants.map((row) =>
        row.id === targetCombatant.id
          ? { ...row, hp_current: Math.max(0, Number(row.hp_current ?? 0) - total) }
          : row
      );
      damageText = `${actor.name} uses ${actionName}${targetName ? ` vs ${targetName}` : ""}: damage ${total} from [${rolls.join(", ")}]${totalBonus ? ` ${totalBonus > 0 ? "+" : "-"} ${Math.abs(totalBonus)}` : ""}.`;
      nextLog.push({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        type: "damage",
        text: damageText,
      });
    } else {
      damageText = `${actor.name} uses ${actionName}${targetName ? ` on ${targetName}` : ""}: damage ${total}.`;
      nextLog.push({
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        type: "damage",
        text: damageText,
      });
    }
  }

  await updateState(sessionId, {
    encounter_state: {
      ...encounter,
      combatants: nextCombatants,
      combat_log: nextLog.slice(-60),
      updated_at: new Date().toISOString(),
    },
  });
  return { ok: true, hit: didHit, targetName: targetName || null, attackText, damageText };
}

function cleanIds(input: string[] | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
}

function isUuid(value: unknown) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function getSessionCharacterTargets(sessionId: string) {
  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const { data: joins, error: joinsErr } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId);
  if (joinsErr) throw new Error(joinsErr.message);
  const playerIds = Array.from(
    new Set((joins ?? []).map((r: any) => String(r?.player_id ?? "").trim()).filter(Boolean))
  );
  if (!playerIds.length) return [] as Array<{ playerId: string; characterId: string }>;

  const { data: chars, error: charsErr } = await admin
    .from("characters")
    .select("id,user_id,created_at")
    .in("user_id", playerIds)
    .order("created_at", { ascending: true });
  if (charsErr) throw new Error(charsErr.message);

  const firstCharByUser = new Map<string, string>();
  for (const row of chars ?? []) {
    const userId = String((row as any)?.user_id ?? "").trim();
    const charId = String((row as any)?.id ?? "").trim();
    if (!userId || !charId || firstCharByUser.has(userId)) continue;
    firstCharByUser.set(userId, charId);
  }
  return playerIds
    .map((playerId) => ({ playerId, characterId: firstCharByUser.get(playerId) ?? "" }))
    .filter((x) => x.characterId.length > 0);
}

export async function storytellerAssignQuestToAll(input: {
  sessionId: string;
  questId: string;
  questTitle?: string;
  taskDefs?: Array<{ id: string; title?: string; kind?: string; target_npc_block_id?: string | null; target_npc_name?: string | null }>;
  rewardFaith?: number;
  rewardItemIds?: string[];
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  if (!sessionId || !questId) throw new Error("Missing session or quest id.");

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const targets = await getSessionCharacterTargets(sessionId);
  const taskDefs = (Array.isArray(input.taskDefs) ? input.taskDefs : [])
    .map((t: any) => ({
      id: String(t?.id ?? "").trim(),
      title: String(t?.title ?? "").trim(),
      kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
      target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
      target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
    }))
    .filter((t) => t.id.length > 0);
  const taskIds = taskDefs.map((t) => t.id);
  const rewardItemIds = cleanIds(input.rewardItemIds);
  const rewardFaith = Math.max(0, Math.floor(Number(input.rewardFaith ?? 0) || 0));

  for (const t of targets) {
    const { data: existingRows, error: existingErr } = await admin
      .from("player_quest_progress")
      .select("id")
      .eq("character_id", t.characterId)
      .eq("quest_id", questId)
      .limit(1);
    if (existingErr) throw new Error(existingErr.message);
    const hasExisting = Array.isArray(existingRows) && existingRows.length > 0;
    if (hasExisting) {
      const { error: upErr } = await admin
        .from("player_quest_progress")
        .update({
          quest_title: String(input.questTitle ?? "").trim() || questId,
          status: "active",
          reward_meta: {
            faith: rewardFaith,
            item_ids: rewardItemIds,
            task_ids: taskIds,
            task_defs: taskDefs,
            storyteller_controlled: true,
          },
          last_task_at: new Date().toISOString(),
        })
        .eq("character_id", t.characterId)
        .eq("quest_id", questId);
      if (upErr) throw new Error(upErr.message);
    } else {
      const { error: insErr } = await admin.from("player_quest_progress").insert({
        player_id: t.playerId,
        character_id: t.characterId,
        quest_id: questId,
        quest_title: String(input.questTitle ?? "").trim() || questId,
        status: "active",
        completed_task_ids: [],
        reward_meta: {
          faith: rewardFaith,
          item_ids: rewardItemIds,
          task_ids: taskIds,
          task_defs: taskDefs,
          storyteller_controlled: true,
        },
      });
      if (insErr) throw new Error(insErr.message);
    }
  }
}

export async function storytellerCompleteQuestTaskForAll(input: {
  sessionId: string;
  questId: string;
  questTitle?: string;
  taskId: string;
  allTaskIds?: string[];
  taskDefs?: Array<{ id: string; title?: string; kind?: string; target_npc_block_id?: string | null; target_npc_name?: string | null }>;
  rewardFaith?: number;
  rewardItemIds?: string[];
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  const taskId = String(input.taskId ?? "").trim();
  if (!sessionId || !questId || !taskId) throw new Error("Missing quest task details.");

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const targets = await getSessionCharacterTargets(sessionId);
  const allTaskIds = cleanIds(input.allTaskIds);
  const taskDefs = (Array.isArray(input.taskDefs) ? input.taskDefs : [])
    .map((t: any) => ({
      id: String(t?.id ?? "").trim(),
      title: String(t?.title ?? "").trim(),
      kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
      target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
      target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
    }))
    .filter((t) => t.id.length > 0);
  const rewardItemIds = cleanIds(input.rewardItemIds);
  const rewardFaith = Math.max(0, Math.floor(Number(input.rewardFaith ?? 0) || 0));

  for (const t of targets) {
    const { data: rows, error: rowErr } = await admin
      .from("player_quest_progress")
      .select("id,status,completed_task_ids,completed_at,created_at")
      .eq("character_id", t.characterId)
      .eq("quest_id", questId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (rowErr) throw new Error(rowErr.message);
    const row = Array.isArray(rows) && rows.length ? (rows[0] as any) : null;
    const currentDone = Array.isArray(row?.completed_task_ids) ? row.completed_task_ids : [];
    const nextDone = Array.from(new Set([...currentDone.map((v: any) => String(v)), taskId]));
    const isCompleted = allTaskIds.length > 0 && allTaskIds.every((id) => nextDone.includes(id));
    const nextStatus = row?.status === "claimed" ? "claimed" : isCompleted ? "completed" : "active";

    if (!row?.id) {
      const { error: insErr } = await admin.from("player_quest_progress").insert({
        player_id: t.playerId,
        character_id: t.characterId,
        quest_id: questId,
        quest_title: String(input.questTitle ?? "").trim() || questId,
        status: nextStatus,
        completed_task_ids: nextDone,
        completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
        last_task_at: new Date().toISOString(),
        reward_meta: {
          faith: rewardFaith,
          item_ids: rewardItemIds,
          task_ids: allTaskIds,
          task_defs: taskDefs,
          storyteller_controlled: true,
        },
      });
      if (insErr) throw new Error(insErr.message);
    } else {
      const { error: upErr } = await admin
        .from("player_quest_progress")
        .update({
          completed_task_ids: nextDone,
          status: nextStatus,
          completed_at: nextStatus === "completed" ? new Date().toISOString() : row?.completed_at ?? null,
          last_task_at: new Date().toISOString(),
        })
        .eq("character_id", t.characterId)
        .eq("quest_id", questId);
      if (upErr) throw new Error(upErr.message);
    }
  }
}

export async function storytellerCompleteQuestForAll(input: {
  sessionId: string;
  questId: string;
  questTitle?: string;
  allTaskIds?: string[];
  taskDefs?: Array<{ id: string; title?: string; kind?: string; target_npc_block_id?: string | null; target_npc_name?: string | null }>;
  rewardFaith?: number;
  rewardItemIds?: string[];
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  if (!sessionId || !questId) throw new Error("Missing quest details.");

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const targets = await getSessionCharacterTargets(sessionId);
  const allTaskIds = cleanIds(input.allTaskIds);
  const taskDefs = (Array.isArray(input.taskDefs) ? input.taskDefs : [])
    .map((t: any) => ({
      id: String(t?.id ?? "").trim(),
      title: String(t?.title ?? "").trim(),
      kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
      target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
      target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
    }))
    .filter((t) => t.id.length > 0);
  const rewardItemIds = cleanIds(input.rewardItemIds);
  const rewardFaith = Math.max(0, Math.floor(Number(input.rewardFaith ?? 0) || 0));

  for (const t of targets) {
    const { data: rows, error: rowErr } = await admin
      .from("player_quest_progress")
      .select("id,status,created_at")
      .eq("character_id", t.characterId)
      .eq("quest_id", questId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (rowErr) throw new Error(rowErr.message);
    const row = Array.isArray(rows) && rows.length ? (rows[0] as any) : null;

    if (!row?.id) {
      const { error: insErr } = await admin.from("player_quest_progress").insert({
        player_id: t.playerId,
        character_id: t.characterId,
        quest_id: questId,
        quest_title: String(input.questTitle ?? "").trim() || questId,
        status: "completed",
        completed_task_ids: allTaskIds,
        completed_at: new Date().toISOString(),
        last_task_at: new Date().toISOString(),
        reward_meta: {
          faith: rewardFaith,
          item_ids: rewardItemIds,
          task_ids: allTaskIds,
          task_defs: taskDefs,
          storyteller_controlled: true,
        },
      });
      if (insErr) throw new Error(insErr.message);
    } else if (row?.status !== "claimed") {
      const { error: upErr } = await admin
        .from("player_quest_progress")
        .update({
          status: "completed",
          completed_task_ids: allTaskIds,
          completed_at: new Date().toISOString(),
          last_task_at: new Date().toISOString(),
        })
        .eq("character_id", t.characterId)
        .eq("quest_id", questId);
      if (upErr) throw new Error(upErr.message);
    }
  }
}

export async function storytellerAssignQuestRewardsForAll(input: {
  sessionId: string;
  questId: string;
  questTitle?: string;
  allTaskIds?: string[];
  taskDefs?: Array<{ id: string; title?: string; kind?: string; target_npc_block_id?: string | null; target_npc_name?: string | null }>;
  rewardFaith?: number;
  rewardItemIds?: string[];
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  if (!sessionId || !questId) throw new Error("Missing quest details.");

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const targets = await getSessionCharacterTargets(sessionId);
  const allTaskIds = cleanIds(input.allTaskIds);
  const taskDefs = (Array.isArray(input.taskDefs) ? input.taskDefs : [])
    .map((t: any) => ({
      id: String(t?.id ?? "").trim(),
      title: String(t?.title ?? "").trim(),
      kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
      target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
      target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
    }))
    .filter((t) => t.id.length > 0);
  const rewardItemIds = cleanIds(input.rewardItemIds);
  const rewardFaith = Math.max(0, Math.floor(Number(input.rewardFaith ?? 0) || 0));

  for (const t of targets) {
    const { data: rows, error: rowErr } = await admin
      .from("player_quest_progress")
      .select("id,status,reward_meta,created_at")
      .eq("character_id", t.characterId)
      .eq("quest_id", questId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (rowErr) throw new Error(rowErr.message);
    const row = Array.isArray(rows) && rows.length ? (rows[0] as any) : null;
    if (String(row?.status ?? "").toLowerCase() === "claimed") continue;

    const rewardMeta = {
      faith: Math.max(0, Math.floor(Number((row as any)?.reward_meta?.faith ?? rewardFaith) || 0)),
      item_ids: cleanIds(
        Array.isArray((row as any)?.reward_meta?.item_ids)
          ? ((row as any).reward_meta.item_ids as string[])
          : rewardItemIds
      ),
      task_ids: allTaskIds.length
        ? allTaskIds
        : cleanIds(
            Array.isArray((row as any)?.reward_meta?.task_ids)
              ? ((row as any).reward_meta.task_ids as string[])
              : allTaskIds
          ),
      task_defs: taskDefs.length ? taskDefs : Array.isArray((row as any)?.reward_meta?.task_defs) ? (row as any).reward_meta.task_defs : [],
      storyteller_controlled: true,
    };

    // Grant item rewards (stack-aware).
    if (rewardMeta.item_ids.length) {
      const { data: itemRows, error: itemErr } = await admin
        .from("items")
        .select("id,name,is_active,stackable,max_stack")
        .in("id", rewardMeta.item_ids);
      if (itemErr) throw new Error(itemErr.message);
      const validItems = (itemRows ?? []).filter((it: any) => Boolean(it?.id) && it?.is_active !== false);
      for (const it of validItems as any[]) {
        const itemId = String(it.id);
        const isStackable = Boolean(it?.stackable ?? true);
        const maxStack = Number(it?.max_stack ?? NaN);
        const stackCap = Number.isFinite(maxStack) && maxStack > 0 ? Math.floor(maxStack) : null;

        const { data: existing, error: exErr } = await admin
          .from("inventory_items")
          .select("id,quantity")
          .eq("character_id", t.characterId)
          .eq("item_id", itemId)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (exErr) throw new Error(exErr.message);

        if (existing?.id && isStackable) {
          const qty = Math.max(1, Number((existing as any).quantity ?? 1));
          if (stackCap && qty >= stackCap) continue;
          const { error: upInvErr } = await admin
            .from("inventory_items")
            .update({ quantity: stackCap ? Math.min(stackCap, qty + 1) : qty + 1 })
            .eq("id", String((existing as any).id));
          if (upInvErr) throw new Error(upInvErr.message);
        } else {
          const { error: insInvErr } = await admin.from("inventory_items").insert({
            character_id: t.characterId,
            item_id: itemId,
            name: String((it as any).name ?? "Quest Reward"),
            quantity: 1,
          });
          if (insInvErr) throw new Error(insInvErr.message);
        }
      }
    }

    // Grant faith rewards.
    if (rewardMeta.faith > 0) {
      const { data: curRow, error: curErr } = await admin
        .from("character_stats_current")
        .select("id,stat_block_current")
        .eq("character_id", t.characterId)
        .maybeSingle();
      if (curErr) throw new Error(curErr.message);
      if (curRow?.id) {
        const statBlock = ((curRow as any).stat_block_current ?? {}) as Record<string, any>;
        const resources = { ...(statBlock.resources ?? {}) } as Record<string, any>;
        const before = Number(resources.faith_available ?? 0);
        resources.faith_available = (Number.isFinite(before) ? before : 0) + rewardMeta.faith;
        const nextStatBlock = { ...statBlock, resources };
        const { error: upCurErr } = await admin
          .from("character_stats_current")
          .update({ stat_block_current: nextStatBlock })
          .eq("id", String((curRow as any).id));
        if (upCurErr) throw new Error(upCurErr.message);
      } else {
        const { data: charRow, error: charErr } = await admin
          .from("characters")
          .select("id,stat_block")
          .eq("id", t.characterId)
          .maybeSingle();
        if (charErr) throw new Error(charErr.message);
        const statBlock = ((charRow as any)?.stat_block ?? {}) as Record<string, any>;
        const resources = { ...(statBlock.resources ?? {}) } as Record<string, any>;
        const before = Number(resources.faith_available ?? 0);
        resources.faith_available = (Number.isFinite(before) ? before : 0) + rewardMeta.faith;
        const nextStatBlock = { ...statBlock, resources };
        const { error: upCharErr } = await admin
          .from("characters")
          .update({ stat_block: nextStatBlock })
          .eq("id", t.characterId);
        if (upCharErr) throw new Error(upCharErr.message);
      }
    }

    if (!row?.id) {
      const { error: insErr } = await admin.from("player_quest_progress").insert({
        player_id: t.playerId,
        character_id: t.characterId,
        quest_id: questId,
        quest_title: String(input.questTitle ?? "").trim() || questId,
        status: "claimed",
        completed_task_ids: rewardMeta.task_ids,
        completed_at: new Date().toISOString(),
        claimed_at: new Date().toISOString(),
        last_task_at: new Date().toISOString(),
        reward_meta: rewardMeta,
      });
      if (insErr) throw new Error(insErr.message);
    } else {
      const { error: upErr } = await admin
        .from("player_quest_progress")
        .update({
          status: "claimed",
          completed_task_ids: rewardMeta.task_ids,
          completed_at: new Date().toISOString(),
          claimed_at: new Date().toISOString(),
          last_task_at: new Date().toISOString(),
          reward_meta: rewardMeta,
        })
        .eq("character_id", t.characterId)
        .eq("quest_id", questId);
      if (upErr) throw new Error(upErr.message);
    }
  }
}

export async function requestPassiveSavePrompt(input: {
  sessionId: string;
  playerId: string;
  checkKey: string;
  dc?: number | null;
  passiveSource?: string;
  instruction?: string;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const playerId = String(input.playerId ?? "").trim();
  const checkKey = String(input.checkKey ?? "WIS").trim().toUpperCase();
  const dc = Number(input.dc ?? NaN);
  const hasDc = Number.isFinite(dc) && dc > 0;
  const source = String(input.passiveSource ?? "").trim();
  const instruction = String(input.instruction ?? "").trim();
  if (!sessionId || !playerId) throw new Error("Missing session/player.");

  const prompt = [
    "Roll Request",
    `${checkKey} saving throw${hasDc ? ` (DC ${Math.floor(dc)})` : ""}.`,
    instruction || `Click ${checkKey} in your Abilities and report your total.`,
    source ? `Triggered by: ${source}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  await updateState(sessionId, {
    roll_open: true,
    roll_die: "d20",
    roll_prompt: prompt,
    roll_target: playerId,
    roll_round_id: randomUUID(),
    roll_results: {},
  });
}

export async function approvePlayerRollRequest(input: {
  sessionId: string;
  requestId: string;
  instruction?: string;
  dc?: number | null;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const requestId = String(input.requestId ?? "").trim();
  const instruction = String(input.instruction ?? "").trim();
  const dc = Number(input.dc ?? NaN);
  const hasDc = Number.isFinite(dc) && dc > 0;
  if (!sessionId || !requestId) throw new Error("Missing request details.");

  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("roll_requests")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  if (!st) throw new Error("Session state not found.");

  const requests = Array.isArray((st as any)?.roll_requests) ? ([...(st as any).roll_requests] as any[]) : [];
  const idx = requests.findIndex((r: any) => String(r?.id ?? "").trim() === requestId);
  if (idx < 0) throw new Error("Roll request not found.");
  const req = requests[idx] ?? {};
  const status = String(req?.status ?? "pending").trim().toLowerCase();
  if (status !== "pending") return;

  const checkKey = String(req?.check_key ?? "Perception").trim();
  const playerId = String(req?.player_id ?? "").trim();
  const playerMessage = String(req?.message ?? "").trim();
  if (!playerId) throw new Error("Roll request has no player.");

  requests[idx] = {
    ...req,
    status: "approved",
    approved_at: new Date().toISOString(),
  };

  const prompt = [
    "Roll Request",
    `${checkKey} check${hasDc ? ` (DC ${Math.floor(dc)})` : ""}.`,
    instruction || `Click ${checkKey} in your sheet and report your total.`,
    playerMessage ? `Player plan: ${playerMessage}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const { error: upErr } = await supabase
    .from("session_state")
    .update({
      roll_requests: requests,
      roll_open: true,
      roll_die: "d20",
      roll_prompt: prompt,
      roll_target: playerId,
      roll_round_id: randomUUID(),
      roll_results: {},
      roll_request_id: requestId,
      roll_request_source: "player",
    } as any)
    .eq("session_id", sessionId);
  if (upErr) throw new Error(upErr.message);
}

export async function declinePlayerRollRequest(input: {
  sessionId: string;
  requestId: string;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const requestId = String(input.requestId ?? "").trim();
  if (!sessionId || !requestId) throw new Error("Missing request details.");

  const supabase = await createClient();
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("roll_requests")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) throw new Error(stErr.message);
  if (!st) throw new Error("Session state not found.");

  const requests = Array.isArray((st as any)?.roll_requests) ? ([...(st as any).roll_requests] as any[]) : [];
  const idx = requests.findIndex((r: any) => String(r?.id ?? "").trim() === requestId);
  if (idx < 0) return;
  const req = requests[idx] ?? {};
  requests[idx] = {
    ...req,
    status: "declined",
    declined_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ roll_requests: requests })
    .eq("session_id", sessionId);
  if (upErr) throw new Error(upErr.message);
}

export async function storytellerSetHexFocus(input: {
  sessionId: string;
  blockId: string;
  markerId: string;
  label?: string;
  focusImageUrl?: string | null;
  checkKey?: string | null;
  checkDc?: number | null;
  rewardItemIds?: string[];
  requiredQuestIds?: string[];
  playerText?: string | null;
  storytellerNotes?: string | null;
  checkPrompts?: Array<{
    id?: string;
    label?: string;
    checkKey?: string;
    dc?: number | null;
    rewardItemIds?: string[];
    storytellerScript?: string;
    notes?: string | null;
  }>;
  rollOutcomes?: Array<{
    id?: string;
    minRoll?: number | null;
    maxRoll?: number | null;
    label?: string;
    storytellerScript?: string;
    notes?: string | null;
  }>;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const blockId = String(input.blockId ?? "").trim();
  const markerId = String(input.markerId ?? "").trim();
  if (!isUuid(sessionId) || !isUuid(blockId) || !markerId) return;

  const checkDcRaw = Number(input.checkDc ?? NaN);
  const focus = {
    block_id: blockId,
    marker_id: markerId,
    label: String(input.label ?? "").trim() || "Hex",
    focus_image_url: String(input.focusImageUrl ?? "").trim() || null,
    check_key: String(input.checkKey ?? "").trim() || null,
    check_dc: Number.isFinite(checkDcRaw) ? Math.max(0, Math.floor(checkDcRaw)) : null,
    reward_item_ids: cleanIds(input.rewardItemIds),
    required_quest_ids: cleanIds(input.requiredQuestIds),
    player_text: String(input.playerText ?? "").trim() || null,
    storyteller_notes: String(input.storytellerNotes ?? "").trim() || null,
    check_prompts: (Array.isArray(input.checkPrompts) ? input.checkPrompts : [])
      .map((p: any, i: number) => {
        const dcRaw = Number(p?.dc ?? NaN);
        return {
          id: String(p?.id ?? `check-${i + 1}`),
          label: String(p?.label ?? "").trim() || null,
          check_key: String(p?.checkKey ?? "").trim(),
          dc: Number.isFinite(dcRaw) ? Math.max(0, Math.floor(dcRaw)) : null,
          reward_item_ids: cleanIds(p?.rewardItemIds),
          storyteller_script: String(p?.storytellerScript ?? "").trim(),
          notes: String(p?.notes ?? "").trim() || null,
        };
      })
      .filter((p: any) => String(p.check_key ?? "").trim().length > 0),
    roll_outcomes: (Array.isArray(input.rollOutcomes) ? input.rollOutcomes : [])
      .map((o: any, i: number) => {
        const minRaw = Number(o?.minRoll ?? NaN);
        const maxRaw = Number(o?.maxRoll ?? NaN);
        return {
          id: String(o?.id ?? `outcome-${i + 1}`),
          min_roll: Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : null,
          max_roll: Number.isFinite(maxRaw) ? Math.max(0, Math.floor(maxRaw)) : null,
          label: String(o?.label ?? `Outcome ${i + 1}`).trim(),
          storyteller_script: String(o?.storytellerScript ?? "").trim(),
          notes: String(o?.notes ?? "").trim() || null,
        };
      })
      .filter((o: any) => String(o.storyteller_script ?? "").trim().length > 0 || String(o.label ?? "").trim().length > 0),
    reward_status: "pending",
    reward_target_player_id: null,
    updated_at: new Date().toISOString(),
  };

  try {
    await updateState(sessionId, { hex_focus: focus });
  } catch (e) {
    console.error("storytellerSetHexFocus failed:", e);
    return;
  }
}

export async function storytellerClearHexFocus(input: { sessionId: string }) {
  const sessionId = String(input.sessionId ?? "").trim();
  if (!isUuid(sessionId)) return;
  try {
    await updateState(sessionId, { hex_focus: null });
  } catch (e) {
    console.error("storytellerClearHexFocus failed:", e);
    return;
  }
}

async function grantItemsToCharacter(admin: any, characterId: string, itemIds: string[]) {
  const cleanItemIds = cleanIds(itemIds).filter((id) => isUuid(id));
  if (!cleanItemIds.length) return;

  const { data: itemRows, error: itemErr } = await admin
    .from("items")
    .select("id,name,is_active,stackable,max_stack")
    .in("id", cleanItemIds);
  if (itemErr) throw new Error(itemErr.message);
  const validItems = (itemRows ?? []).filter((it: any) => Boolean(it?.id) && it?.is_active !== false);
  for (const it of validItems as any[]) {
    const itemId = String(it.id);
    const isStackable = Boolean(it?.stackable ?? true);
    const maxStack = Number(it?.max_stack ?? NaN);
    const stackCap = Number.isFinite(maxStack) && maxStack > 0 ? Math.floor(maxStack) : null;

    const { data: existing, error: exErr } = await admin
      .from("inventory_items")
      .select("id,quantity")
      .eq("character_id", characterId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);

    if (existing?.id && isStackable) {
      const qty = Math.max(1, Number((existing as any).quantity ?? 1));
      if (stackCap && qty >= stackCap) continue;
      const { error: upInvErr } = await admin
        .from("inventory_items")
        .update({ quantity: stackCap ? Math.min(stackCap, qty + 1) : qty + 1 })
        .eq("id", String((existing as any).id));
      if (upInvErr) throw new Error(upInvErr.message);
    } else {
      const { error: insInvErr } = await admin.from("inventory_items").insert({
        character_id: characterId,
        item_id: itemId,
        name: String((it as any).name ?? "Hex Reward"),
        quantity: 1,
      });
      if (insInvErr) throw new Error(insInvErr.message);
    }
  }
}

export async function storytellerResolveHexReward(input: {
  sessionId: string;
  decision: "grant" | "hold" | "skip";
  targetMode?: "highest_roll" | "manual" | "all_joined" | "all_eligible";
  playerId?: string | null;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const decision = String(input.decision ?? "").trim().toLowerCase();
  if (!isUuid(sessionId) || !["grant", "hold", "skip"].includes(decision)) return;

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr || !st) return;

  const focus = ((st as any).hex_focus ?? null) as Record<string, any> | null;
  if (!focus) return;

  if (decision === "hold" || decision === "skip") {
    const next = {
      ...focus,
      reward_status: decision,
      reward_target_player_id: null,
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase.from("session_state").update({ hex_focus: next }).eq("session_id", sessionId);
    if (upErr) return;
    return;
  }

  const rewardItemIds = cleanIds(Array.isArray(focus.reward_item_ids) ? focus.reward_item_ids : []);
  if (!rewardItemIds.length) return;

  const targets = await getSessionCharacterTargets(sessionId);
  if (!targets.length) return;
  const charByPlayer = new Map<string, string>(targets.map((t) => [t.playerId, t.characterId]));

  const targetMode = String(input.targetMode ?? "highest_roll").trim().toLowerCase();
  const requiredQuestIds = cleanIds(Array.isArray(focus.required_quest_ids) ? focus.required_quest_ids : []);

  if (targetMode === "all_joined" || targetMode === "all_eligible") {
    let eligibleTargets = targets;
    if (targetMode === "all_eligible" && requiredQuestIds.length) {
      const { data: qpRows, error: qpErr } = await admin
        .from("player_quest_progress")
        .select("character_id,quest_id,status")
        .in("character_id", targets.map((t) => t.characterId))
        .in("quest_id", requiredQuestIds)
        .eq("status", "active");
      if (qpErr) throw new Error(qpErr.message);
      const eligibleChars = new Set(
        (qpRows ?? [])
          .map((r: any) => String(r?.character_id ?? "").trim())
          .filter(Boolean)
      );
      eligibleTargets = targets.filter((t) => eligibleChars.has(t.characterId));
    }
    if (!eligibleTargets.length) return;
    for (const t of eligibleTargets) {
      await grantItemsToCharacter(admin, t.characterId, rewardItemIds);
    }
    const next = {
      ...focus,
      reward_status: "granted_multi",
      reward_target_player_ids: eligibleTargets.map((t) => t.playerId),
      reward_item_ids_granted: rewardItemIds,
      reward_granted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabase.from("session_state").update({ hex_focus: next }).eq("session_id", sessionId);
    if (upErr) return;
    return;
  }

  let winnerPlayerId = String(input.playerId ?? "").trim();
  if (targetMode === "highest_roll") {
    const raw = ((st as any).roll_results ?? {}) as Record<string, any>;
    let best: { playerId: string; total: number } | null = null;
    for (const [playerId, row] of Object.entries(raw)) {
      const pid = String(playerId ?? "").trim();
      if (!pid || !charByPlayer.has(pid)) continue;
      const total = Number((row as any)?.total ?? NaN);
      if (!Number.isFinite(total)) continue;
      if (!best || total > best.total) best = { playerId: pid, total };
    }
    if (!best) return;
    winnerPlayerId = best.playerId;
  }

  if (!winnerPlayerId || !charByPlayer.has(winnerPlayerId)) return;
  const characterId = String(charByPlayer.get(winnerPlayerId) ?? "").trim();
  if (!characterId) return;

  await grantItemsToCharacter(admin, characterId, rewardItemIds);

  const next = {
    ...focus,
    reward_status: "granted",
    reward_target_player_id: winnerPlayerId,
    reward_item_ids_granted: rewardItemIds,
    reward_granted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await supabase.from("session_state").update({ hex_focus: next }).eq("session_id", sessionId);
  if (upErr) return;
}

export async function storytellerResolveHexCheckPromptReward(input: {
  sessionId: string;
  checkPromptId: string;
  targetMode?: "highest_roll" | "manual";
  playerId?: string | null;
}) {
  const sessionId = String(input.sessionId ?? "").trim();
  const checkPromptId = String(input.checkPromptId ?? "").trim();
  if (!isUuid(sessionId) || !checkPromptId) return;

  const supabase = await createClient();
  const admin = createAdminClient() ?? supabase;
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr || !st) return;

  const focus = ((st as any).hex_focus ?? null) as Record<string, any> | null;
  if (!focus) return;
  let checkPrompts = Array.isArray(focus.check_prompts) ? (focus.check_prompts as any[]) : [];
  let checkPrompt = checkPrompts.find((p: any) => String(p?.id ?? "").trim() === checkPromptId);
  if (!checkPrompt && String(focus.block_id ?? "").trim()) {
    const { data: blockRow, error: blockErr } = await admin
      .from("episode_blocks")
      .select("id,meta")
      .eq("id", String(focus.block_id))
      .maybeSingle();
    if (blockErr) throw new Error(blockErr.message);
    const markers = blockRow ? extractHexMarkers((blockRow as any).meta) : [];
    const marker = markers.find((m: any) => String(m?.id ?? "").trim() === String(focus.marker_id ?? "").trim()) ?? null;
    checkPrompts = Array.isArray(marker?.checkPrompts) ? (marker?.checkPrompts as any[]) : [];
    checkPrompt = checkPrompts.find((p: any) => String(p?.id ?? "").trim() === checkPromptId);
  }
  if (!checkPrompt) return;

  const rewardItemIds = cleanIds(
    Array.isArray(checkPrompt.reward_item_ids)
      ? checkPrompt.reward_item_ids
      : Array.isArray(checkPrompt.rewardItemIds)
        ? checkPrompt.rewardItemIds
        : []
  );
  if (!rewardItemIds.length) return;

  const targets = await getSessionCharacterTargets(sessionId);
  if (!targets.length) return;
  const charByPlayer = new Map<string, string>(targets.map((t) => [t.playerId, t.characterId]));

  let winnerPlayerId = String(input.playerId ?? "").trim();
  const dc = Number((checkPrompt as any)?.dc ?? (checkPrompt as any)?.check_dc ?? NaN);
  const requiresDc = Number.isFinite(dc) && dc > 0;
  const raw = ((st as any).roll_results ?? {}) as Record<string, any>;
  if (String(input.targetMode ?? "highest_roll").trim().toLowerCase() === "highest_roll") {
    let best: { playerId: string; total: number } | null = null;
    for (const [playerId, row] of Object.entries(raw)) {
      const pid = String(playerId ?? "").trim();
      if (!pid || !charByPlayer.has(pid)) continue;
      const total = Number((row as any)?.total ?? NaN);
      if (!Number.isFinite(total)) continue;
      if (!best || total > best.total) best = { playerId: pid, total };
    }
    if (!best) return;
    if (requiresDc && best.total < dc) return;
    winnerPlayerId = best.playerId;
  } else if (winnerPlayerId) {
    const manualTotal = Number((raw[winnerPlayerId] as any)?.total ?? NaN);
    if (requiresDc && (!Number.isFinite(manualTotal) || manualTotal < dc)) return;
  }

  const rolledCharacterId = String((raw[winnerPlayerId] as any)?.character_id ?? "").trim();
  const characterId = rolledCharacterId || String(charByPlayer.get(winnerPlayerId) ?? "").trim();
  if (!characterId) return;

  await grantItemsToCharacter(admin, characterId, rewardItemIds);

  const granted = Array.isArray(focus.check_prompt_rewards_granted) ? [...focus.check_prompt_rewards_granted] : [];
  granted.push({
    id: randomUUID(),
    check_prompt_id: checkPromptId,
    reward_item_ids: rewardItemIds,
    reward_target_player_id: winnerPlayerId,
    granted_at: new Date().toISOString(),
  });

  const next = {
    ...focus,
    check_prompt_rewards_granted: granted.slice(-20),
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await supabase.from("session_state").update({ hex_focus: next }).eq("session_id", sessionId);
  if (upErr) return;
}
