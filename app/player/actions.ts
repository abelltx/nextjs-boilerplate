"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { normalizeEncounterState, sortEncounterCombatants } from "@/lib/encounter";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function hasMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes(`relation "${table}" does not exist`) || msg.includes(`relation "public.${table}" does not exist`);
}

function hasMissingFunctionError(err: any, fn: string) {
  const msg = String(err?.message ?? "").toLowerCase();
  const code = String(err?.code ?? "").trim().toUpperCase();
  return (
    code === "PGRST202" ||
    msg.includes(`could not find the function public.${fn}`) ||
    msg.includes(`function public.${fn}`) ||
    msg.includes(`public.${fn}(`)
  );
}

function hasNonUpdatableViewError(err: any) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes("cannot update view") || msg.includes("not automatically updatable");
}

function toBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v) return fallback;
    if (["true", "1", "yes", "on"].includes(v)) return true;
    if (["false", "0", "no", "off", "null", "undefined"].includes(v)) return false;
  }
  return fallback;
}

function mergeJsonObjects(
  base: Record<string, any>,
  patch: Record<string, any>
): Record<string, any> {
  const next: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      next[key] = mergeJsonObjects(
        base[key] as Record<string, any>,
        value as Record<string, any>
      );
      continue;
    }
    next[key] = value;
  }
  return next;
}

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
const DERIVED_KEYS = ["hp_max", "hp_current", "defense", "speed"] as const;

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStatBlockShape(input: unknown): Record<string, any> {
  const source = isPlainObject(input) ? ({ ...input } as Record<string, any>) : {};
  const rawAbilities = isPlainObject(source.abilities) ? { ...(source.abilities as Record<string, any>) } : {};
  const rawDerived = isPlainObject(source.derived) ? { ...(source.derived as Record<string, any>) } : {};
  const rawResources = isPlainObject(source.resources) ? { ...(source.resources as Record<string, any>) } : {};
  const rawMeta = isPlainObject(source.meta) ? { ...(source.meta as Record<string, any>) } : {};

  const abilities: Record<string, any> = { ...rawAbilities };
  for (const key of ABILITY_KEYS) {
    if (abilities[key] == null && source[key] != null) abilities[key] = source[key];
    delete source[key];
  }

  const derived: Record<string, any> = { ...rawDerived };
  for (const key of DERIVED_KEYS) {
    if (derived[key] == null && rawResources[key] != null) derived[key] = rawResources[key];
    if (derived[key] == null && source[key] != null) derived[key] = source[key];
    delete rawResources[key];
    delete source[key];
  }

  delete source.abilities;
  delete source.derived;
  delete source.resources;
  delete source.meta;

  const normalized: Record<string, any> = { ...source };
  if (Object.keys(abilities).length > 0) normalized.abilities = abilities;
  if (Object.keys(derived).length > 0) normalized.derived = derived;
  if (Object.keys(rawResources).length > 0) normalized.resources = rawResources;
  if (Object.keys(rawMeta).length > 0) normalized.meta = rawMeta;
  return normalized;
}

async function syncCharacterStatsCurrent(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  characterId: string,
  nextStatBlock: Record<string, any>
) {
  const { error: upErr } = await supabase
    .from("character_stats_current")
    .update({ stat_block_current: nextStatBlock })
    .eq("character_id", characterId);
  if (upErr && hasNonUpdatableViewError(upErr)) return { ok: true as const };
  if (upErr) return { ok: false as const, error: upErr.message };
  return { ok: true as const };
}

function buildClassPackageStatBlock(
  baseStatBlock: Record<string, any>,
  replaceStatBlock: Record<string, any> | null,
  packageId: string,
  alreadyApplied: boolean
) {
  const nextStatBlock = alreadyApplied
    ? normalizeStatBlockShape({ ...baseStatBlock })
    : normalizeStatBlockShape(
        replaceStatBlock
          ? mergeJsonObjects(
              { ...baseStatBlock } as Record<string, any>,
              replaceStatBlock as Record<string, any>
            )
          : { ...baseStatBlock }
      );

  if (!alreadyApplied) {
    const baseMeta =
      nextStatBlock.meta && typeof nextStatBlock.meta === "object"
        ? ({ ...(nextStatBlock.meta as Record<string, any>) } as Record<string, any>)
        : {};
    const appliedIds = Array.isArray(baseMeta.class_package_applied_ids)
      ? Array.from(
          new Set(
            (baseMeta.class_package_applied_ids as any[])
              .map((v) => String(v ?? "").trim())
              .filter(Boolean)
          )
        )
      : [];
    baseMeta.class_package_applied_ids = Array.from(new Set([...appliedIds, packageId]));
    nextStatBlock.meta = baseMeta;
  }

  return nextStatBlock;
}

type PointSupportEffectRow = {
  id: string;
  kind: "point";
  action_id: string;
  action_name: string | null;
  source_player_id: string;
  source_character_id: string;
  source_name: string | null;
  target_player_id: string;
  target_character_id: string;
  target_name: string | null;
  choice_owner: string | null;
  options: Array<{
    id: string | null;
    label: string | null;
    trigger: string | null;
    grant_advantage: boolean | null;
    damage_bonus: number | null;
    consume_on_use: boolean | null;
  }>;
  status: "pending_choice" | "next_attack_roll" | "next_damage_roll" | "next_skill_check" | "reroll_next_roll" | "consumed";
  damage_bonus: number | null;
  created_at: string | null;
  chosen_at: string | null;
  consumed_at: string | null;
};

function normalizeTargetedSupportConfig(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const cfg = input as Record<string, any>;
  const kind = String(cfg.kind ?? "").trim().toLowerCase();
  if (kind !== "targeted_support") return null;
  const options = (Array.isArray(cfg.options) ? cfg.options : [])
    .map((row: any) => {
      const trigger = String(row?.trigger ?? "").trim().toLowerCase();
      if (!["next_attack_roll", "next_damage_roll", "next_skill_check", "reroll_next_roll"].includes(trigger)) return null;
      return {
        id: String(row?.id ?? "").trim() || null,
        label: String(row?.label ?? "").trim() || null,
        trigger,
        grant_advantage: typeof row?.grant_advantage === "boolean" ? row.grant_advantage : null,
        damage_bonus: Number.isFinite(Number(row?.damage_bonus ?? NaN)) ? Number(row.damage_bonus) : null,
        consume_on_use: typeof row?.consume_on_use === "boolean" ? row.consume_on_use : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  if (!options.length) return null;
  return {
    kind: "targeted_support" as const,
    target_scope: String(cfg.target_scope ?? "ally").trim().toLowerCase() || "ally",
    choice_owner: String(cfg.choice_owner ?? "target").trim().toLowerCase() || "target",
    options,
  };
}

async function getSessionCharacterRoster(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  sessionId: string
) {
  const admin = createAdminClient() ?? supabase;
  const { data: joins, error: joinsErr } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId);
  if (joinsErr) throw new Error(joinsErr.message);
  const playerIds = Array.from(new Set((joins ?? []).map((r: any) => String(r?.player_id ?? "").trim()).filter(Boolean)));
  if (!playerIds.length) return [] as Array<{ playerId: string; characterId: string; name: string; className: string | null }>;

  const { data: chars, error: charsErr } = await admin
    .from("characters")
    .select("id,user_id,name,class,created_at")
    .in("user_id", playerIds)
    .order("created_at", { ascending: true });
  if (charsErr) throw new Error(charsErr.message);

  const firstCharByUser = new Map<string, { characterId: string; name: string; className: string | null }>();
  for (const row of chars ?? []) {
    const playerId = String((row as any)?.user_id ?? "").trim();
    const characterId = String((row as any)?.id ?? "").trim();
    if (!playerId || !characterId || firstCharByUser.has(playerId)) continue;
    firstCharByUser.set(playerId, {
      characterId,
      name: String((row as any)?.name ?? "").trim() || "Adventurer",
      className: String((row as any)?.class ?? "").trim() || null,
    });
  }

  return playerIds
    .map((playerId) => {
      const row = firstCharByUser.get(playerId);
      return row
        ? { playerId, characterId: row.characterId, name: row.name, className: row.className }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function normalizePointSupportEffects(input: unknown) {
  return (Array.isArray(input) ? input : [])
    .map((row: any) => {
      const id = String(row?.id ?? "").trim();
      const status = String(row?.status ?? "").trim().toLowerCase();
      if (!id) return null;
      if (!["pending_choice", "next_attack_roll", "next_damage_roll", "next_skill_check", "reroll_next_roll", "consumed"].includes(status)) return null;
      return {
        id,
        kind: "point" as const,
        action_id: String(row?.action_id ?? "").trim(),
        action_name: String(row?.action_name ?? "").trim() || null,
        source_player_id: String(row?.source_player_id ?? "").trim(),
        source_character_id: String(row?.source_character_id ?? "").trim(),
        source_name: String(row?.source_name ?? "").trim() || null,
        target_player_id: String(row?.target_player_id ?? "").trim(),
        target_character_id: String(row?.target_character_id ?? "").trim(),
        target_name: String(row?.target_name ?? "").trim() || null,
        choice_owner: String(row?.choice_owner ?? "").trim().toLowerCase() || null,
        options: (Array.isArray(row?.options) ? row.options : [])
          .map((opt: any) => ({
            id: String(opt?.id ?? "").trim() || null,
            label: String(opt?.label ?? "").trim() || null,
            trigger: String(opt?.trigger ?? "").trim().toLowerCase() || null,
            grant_advantage: typeof opt?.grant_advantage === "boolean" ? opt.grant_advantage : null,
            damage_bonus: Number.isFinite(Number(opt?.damage_bonus ?? NaN)) ? Number(opt.damage_bonus) : null,
            consume_on_use: typeof opt?.consume_on_use === "boolean" ? opt.consume_on_use : null,
          }))
          .filter((opt: any) => Boolean(opt.trigger)),
        status: status as PointSupportEffectRow["status"],
        damage_bonus: Number.isFinite(Number(row?.damage_bonus ?? NaN)) ? Number(row?.damage_bonus) : null,
        created_at: String(row?.created_at ?? "").trim() || null,
        chosen_at: String(row?.chosen_at ?? "").trim() || null,
        consumed_at: String(row?.consumed_at ?? "").trim() || null,
      };
    })
    .filter((row): row is PointSupportEffectRow => Boolean(row));
}

async function requireOwnedCharacter(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  characterId: string
) {
  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id,name,stat_block")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false as const, error: chErr.message };
  if (!ch?.id || ch.user_id !== userId) return { ok: false as const, error: "Character not found." };
  return { ok: true as const, character: ch };
}

function cleanQuestTaskIds(input: string[] | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
}

function extractTaskItemId(task: any): string | null {
  const direct = String(
    task?.target_item_id ??
      task?.item_id ??
      task?.required_item_id ??
      ""
  )
    .trim()
    .toLowerCase();
  if (isUuid(direct)) return direct;

  const title = String(task?.title ?? "").trim();
  const tagged = title.match(/\[item_id:([0-9a-f-]{36})\]/i);
  if (tagged?.[1] && isUuid(tagged[1])) return tagged[1].toLowerCase();
  const prefixed = title.match(/^(?:have_item|item)\s*:\s*([0-9a-f-]{36})/i);
  if (prefixed?.[1] && isUuid(prefixed[1])) return prefixed[1].toLowerCase();
  return null;
}

function isUuidLike(value: unknown) {
  const v = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function cleanTaskTitle(raw: unknown) {
  return String(raw ?? "")
    .trim()
    .replace(/\[item_id:[^\]]+\]/gi, "")
    .replace(/^(?:have_item|item)\s*:\s*[0-9a-f-]{36}\s*\|?\s*/i, "")
    .trim();
}

function normalizeQuestTaskDefs(taskDefs: any[]) {
  return (Array.isArray(taskDefs) ? taskDefs : [])
    .map((t: any) => {
      const id = String(t?.id ?? "").trim();
      if (!id) return null;
      const rawKind = String(t?.kind ?? "").trim().toLowerCase();
      const targetNpcId = String(t?.target_npc_block_id ?? "").trim();
      const detectedItemId = extractTaskItemId(t);
      const kind =
        rawKind === "talk_to_npc" && isUuidLike(targetNpcId)
          ? "talk_to_npc"
          : (rawKind === "have_item" || rawKind === "item" || rawKind === "requires_item" || Boolean(detectedItemId))
            ? "have_item"
            : "task";
      return {
        id,
        title: cleanTaskTitle(t?.title),
        kind,
        target_npc_block_id: kind === "talk_to_npc" ? targetNpcId || null : null,
        target_npc_name: kind === "talk_to_npc" ? String(t?.target_npc_name ?? "").trim() || null : null,
        target_item_id: kind === "have_item" ? detectedItemId : null,
      };
    })
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
}

async function getAutoCompletedItemTaskIds(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  characterId: string,
  taskDefs: any[]
) {
  if (!characterId || !Array.isArray(taskDefs) || !taskDefs.length) return [] as string[];
  const { data: invRows, error: invErr } = await supabase
    .from("inventory_items")
    .select("item_id")
    .eq("character_id", characterId);
  if (invErr) throw new Error(invErr.message);
  const ownedItemIds = new Set(
    (invRows ?? [])
      .map((r: any) => String(r?.item_id ?? "").trim().toLowerCase())
      .filter((v) => isUuid(v))
  );

  return taskDefs
    .map((t: any) => {
      const id = String(t?.id ?? "").trim();
      const kind = String(t?.kind ?? "").trim().toLowerCase();
      const itemId = extractTaskItemId(t);
      if (!id || !itemId) return null;
      if (!["have_item", "item", "requires_item", "task"].includes(kind)) return null;
      return ownedItemIds.has(itemId) ? id : null;
    })
    .filter((v): v is string => Boolean(v));
}

async function appendGameLogSafe(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  input: {
    userId: string;
    characterId: string;
    eventType: string;
    title: string;
    summary?: string;
    itemId?: string;
  }
) {
  const taggedSummary = input.itemId
    ? `${input.summary ?? ""}${input.summary ? " " : ""}[item_id:${input.itemId}]`
    : input.summary ?? null;
  const payload = {
    user_id: input.userId,
    character_id: input.characterId,
    event_type: input.eventType,
    title: input.title,
    summary: taggedSummary,
  };
  const { error } = await supabase.from("game_log").insert(payload as any);
  if (error) {
    const msg = String(error.message ?? "").toLowerCase();
    if (msg.includes("does not exist") || msg.includes("schema cache")) return;
    console.error("appendGameLogSafe failed:", error.message);
  }
}

async function applyClassPackageFallback(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  input: {
    userId: string;
    characterId: string;
    inventoryItemId: string;
    packageId: string;
    className: string;
    replaceStatBlock: Record<string, any> | null;
    grantItemIds: string[];
    grantTraitIds: string[];
    grantActionIds: string[];
    consumeOnUse: boolean;
  }
) {
  const owned = await requireOwnedCharacter(supabase, input.userId, input.characterId);
  if (!owned.ok) return { ok: false as const, error: owned.error };

  const { data: invRow, error: invErr } = await supabase
    .from("inventory_items")
    .select("id,item_id,quantity")
    .eq("id", input.inventoryItemId)
    .eq("character_id", input.characterId)
    .maybeSingle();
  if (invErr) return { ok: false as const, error: invErr.message };
  if (!invRow?.id) return { ok: false as const, error: "Inventory item not found." };

  const baseStatBlock =
    owned.character && typeof (owned.character as any).stat_block === "object" && (owned.character as any).stat_block
      ? normalizeStatBlockShape((owned.character as any).stat_block as Record<string, any>)
      : {};
  const baseMeta =
    baseStatBlock.meta && typeof baseStatBlock.meta === "object"
      ? ({ ...(baseStatBlock.meta as Record<string, any>) } as Record<string, any>)
      : {};
  const appliedIds = Array.isArray(baseMeta.class_package_applied_ids)
    ? Array.from(
        new Set(
          (baseMeta.class_package_applied_ids as any[])
            .map((v) => String(v ?? "").trim())
            .filter(Boolean)
        )
      )
    : [];
  const alreadyApplied = appliedIds.includes(input.packageId);

  const normalizedPackageStatBlock =
    input.replaceStatBlock && typeof input.replaceStatBlock === "object"
      ? normalizeStatBlockShape(input.replaceStatBlock as Record<string, any>)
      : null;
  const nextStatBlock = buildClassPackageStatBlock(
    baseStatBlock,
    normalizedPackageStatBlock,
    input.packageId,
    alreadyApplied
  );

  if (!alreadyApplied) {
    const characterPatch: Record<string, any> = { stat_block: nextStatBlock };
    if (input.className) characterPatch.class = input.className;
    const { error: charErr } = await supabase.from("characters").update(characterPatch).eq("id", input.characterId);
    if (charErr) return { ok: false as const, error: charErr.message };
  }

  const syncErr = await syncCharacterStatsCurrent(supabase, input.characterId, nextStatBlock);
  if (!syncErr.ok) return syncErr;

  for (const traitId of input.grantTraitIds) {
    const { data: existing, error: exErr } = await supabase
      .from("player_trait_links")
      .select("id")
      .eq("character_id", input.characterId)
      .eq("trait_id", traitId)
      .limit(1)
      .maybeSingle();
    if (exErr) return { ok: false as const, error: exErr.message };
    if (existing?.id) continue;
    const { error: insErr } = await supabase.from("player_trait_links").insert({
      player_id: input.userId,
      character_id: input.characterId,
      trait_id: traitId,
    });
    if (insErr) return { ok: false as const, error: insErr.message };
  }

  for (const actionId of input.grantActionIds) {
    const { data: existing, error: exErr } = await supabase
      .from("player_action_links")
      .select("id")
      .eq("character_id", input.characterId)
      .eq("action_id", actionId)
      .limit(1)
      .maybeSingle();
    if (exErr) return { ok: false as const, error: exErr.message };
    if (existing?.id) continue;
    const { error: insErr } = await supabase.from("player_action_links").insert({
      player_id: input.userId,
      character_id: input.characterId,
      action_id: actionId,
    });
    if (insErr) return { ok: false as const, error: insErr.message };
  }

  if (input.grantItemIds.length) {
    const { data: itemRows, error: itemErr } = await supabase
      .from("items")
      .select("id,name,is_active,stackable,max_stack")
      .in("id", input.grantItemIds);
    if (itemErr) return { ok: false as const, error: itemErr.message };
    const validItems = (itemRows ?? []).filter((row: any) => row?.id && row.is_active !== false);
    for (const item of validItems as any[]) {
      const { data: existing, error: exErr } = await supabase
        .from("inventory_items")
        .select("id,quantity")
        .eq("character_id", input.characterId)
        .eq("item_id", String(item.id))
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (exErr) return { ok: false as const, error: exErr.message };

      const stackable = toBool(item.stackable, true);
      const maxStack = Number(item.max_stack ?? NaN);
      const stackCap = Number.isFinite(maxStack) && maxStack > 0 ? Math.floor(maxStack) : null;
      if (existing?.id && stackable) {
        const qty = Math.max(1, Number((existing as any).quantity ?? 1));
        if (!stackCap || qty < stackCap) {
          const { error: upErr } = await supabase
            .from("inventory_items")
            .update({ quantity: stackCap ? Math.min(stackCap, qty + 1) : qty + 1 })
            .eq("id", String((existing as any).id));
          if (upErr) return { ok: false as const, error: upErr.message };
        }
        continue;
      }

      const { error: insErr } = await supabase.from("inventory_items").insert({
        character_id: input.characterId,
        item_id: String(item.id),
        name: String(item.name ?? "Class Reward"),
        quantity: 1,
      });
      if (insErr) return { ok: false as const, error: insErr.message };
    }
  }

  if (input.consumeOnUse) {
    const qty = Math.max(1, Number((invRow as any).quantity ?? 1));
    if (qty > 1) {
      const { error: upErr } = await supabase
        .from("inventory_items")
        .update({ quantity: qty - 1 })
        .eq("id", input.inventoryItemId);
      if (upErr) return { ok: false as const, error: upErr.message };
    } else {
      const { error: delErr } = await supabase.from("inventory_items").delete().eq("id", input.inventoryItemId);
      if (delErr) return { ok: false as const, error: delErr.message };
    }
  }

  return { ok: true as const, alreadyApplied };
}

export async function joinSessionAction(
  joinCodeOrId: string
): Promise<{ ok: boolean; sessionId?: string; sessionName?: string; error?: string }> {
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();
  const token = joinCodeOrId.trim();

  // 1) Resolve session by join_code (preferred)
  // Assumes sessions.join_code exists. If it doesn't, this query will fail; we catch and fallback.
  let sessionId: string | null = null;
  let sessionName: string | null = null;

  const tryJoinCode = async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("id,name")
      .eq("join_code", token)
      .maybeSingle();

    if (error) return null;
    if (!data?.id) return null;
    sessionName = (data as any)?.name ?? null;
    return data.id;
  };

  const tryId = async () => {
    if (!isUuid(token)) return null;
    const { data, error } = await supabase
      .from("sessions")
      .select("id,name")
      .eq("id", token)
      .maybeSingle();

    if (error) return null;
    if (!data?.id) return null;
    sessionName = (data as any)?.name ?? null;
    return data.id;
  };

  sessionId = (await tryJoinCode()) ?? (await tryId());

  if (!sessionId) {
    return { ok: false, error: "Session not found. Check your join code." };
  }

  // 2) Insert session_players row (idempotent-ish)
  // If you add a unique constraint on (session_id, player_id), duplicates will safely error.
  const { error: insErr } = await supabase
    .from("session_players")
    .insert({ session_id: sessionId, player_id: user.id });

  if (insErr) {
    // If it's a duplicate row error, treat as success.
    const msg = insErr.message?.toLowerCase() ?? "";
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return { ok: true, sessionId, sessionName: sessionName ?? undefined };
    }
    return { ok: false, error: `Failed to join: ${insErr.message}` };
  }

  return { ok: true, sessionId, sessionName: sessionName ?? undefined };
}

export async function leaveSessionAction(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("session_players")
    .delete()
    .eq("session_id", sessionId)
    .eq("player_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitRollResultAction(input: {
  sessionId: string;
  characterId?: string;
  rollValue: number;
  source: "manual" | "digital";
  rerollEffectId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();

  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("roll_open,roll_target,roll_round_id,roll_results")
    .eq("session_id", input.sessionId)
    .single();

  if (stErr) return { ok: false, error: stErr.message };
  if (!st || !(st as any).roll_open) return { ok: false, error: "No open roll request." };

  const target = String((st as any).roll_target ?? "all");
  if (target !== "all" && target !== user.id) {
    return { ok: false, error: "This roll request targets a different player." };
  }

  const roundId = String((st as any).roll_round_id ?? "");

  const current = ((st as any)?.roll_results ?? {}) as Record<string, any>;
  const rerollEffectId = String(input.rerollEffectId ?? "").trim();
  if (current[user.id]?.round_id && current[user.id].round_id === roundId && !rerollEffectId) {
    return { ok: false, error: "You already submitted a roll for this request." };
  }

  let nextSupportEffects: PointSupportEffectRow[] | null = null;
  if (rerollEffectId) {
    const characterId = String(input.characterId ?? "").trim();
    if (!characterId) return { ok: false, error: "Missing character for reroll." };
    const owner = await requireOwnedCharacter(supabase, user.id, characterId);
    if (!owner.ok) return { ok: false, error: owner.error };
    const supportEffects = normalizePointSupportEffects((st as any)?.support_effects);
    const effect = supportEffects.find((row) => row.id === rerollEffectId);
    if (!effect) return { ok: false, error: "Reroll effect not found." };
    if (effect.target_character_id !== characterId) {
      return { ok: false, error: "This reroll belongs to a different character." };
    }
    if (effect.status !== "reroll_next_roll") {
      return { ok: false, error: "This reroll is no longer available." };
    }
    const nowIso = new Date().toISOString();
    nextSupportEffects = supportEffects.map((row) =>
      row.id === rerollEffectId
        ? {
            ...row,
            status: "consumed" as const,
            consumed_at: nowIso,
          }
        : row
    );
  }

  const next = {
    ...current,
    [user.id]: {
      value: input.rollValue,
      source: input.source,
      round_id: roundId,
      submitted_at: new Date().toISOString(),
    },
  };

  const { error: upErr } = await supabase
    .from("session_state")
    .update(
      nextSupportEffects
        ? {
            roll_results: next,
            support_effects: nextSupportEffects,
          }
        : { roll_results: next }
    )
    .eq("session_id", input.sessionId);

  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function requestRollApprovalAction(input: {
  sessionId: string;
  checkKey: string;
  message?: string;
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const sessionId = String(input.sessionId ?? "").trim();
  const checkKey = String(input.checkKey ?? "").trim();
  const message = String(input.message ?? "").trim();
  if (!sessionId || !checkKey) return { ok: false, error: "Missing session or check." };

  const supabase = await supabaseServer();
  const { data: joinRow, error: joinErr } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (joinErr) return { ok: false, error: joinErr.message };
  if (!joinRow?.player_id) return { ok: false, error: "You are not in this session." };

  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("roll_requests,roll_open,roll_target")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };
  if (!st) return { ok: false, error: "Session state not found." };

  const existing = Array.isArray((st as any)?.roll_requests) ? ((st as any).roll_requests as any[]) : [];
  const hasPending = existing.some(
    (r: any) =>
      String(r?.player_id ?? "").trim() === user.id &&
      String(r?.status ?? "pending").trim().toLowerCase() === "pending"
  );
  if (hasPending) return { ok: true };

  const next = [
    ...existing,
    {
      id: randomUUID(),
      player_id: user.id,
      check_key: checkKey,
      message: message || null,
      status: "pending",
      created_at: new Date().toISOString(),
    },
  ];

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ roll_requests: next })
    .eq("session_id", sessionId);
  if (upErr) return { ok: false, error: upErr.message };
  revalidatePath("/player");
  return { ok: true };
}

export async function submitEncounterInitiativeAction(input: {
  sessionId: string;
  characterId: string;
  rollValue: number;
  source?: "manual" | "digital";
}): Promise<{ ok: boolean; total?: number; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const sessionId = String(input.sessionId ?? "").trim();
  const characterId = String(input.characterId ?? "").trim();
  const rollValue = Number(input.rollValue ?? NaN);
  const source = String(input.source ?? "digital").trim().toLowerCase() === "manual" ? "manual" : "digital";
  if (!sessionId || !characterId || !Number.isFinite(rollValue)) {
    return { ok: false, error: "Missing encounter initiative details." };
  }

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: joinRow, error: joinErr } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (joinErr) return { ok: false, error: joinErr.message };
  if (!joinRow?.player_id) return { ok: false, error: "You are not in this session." };

  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) return { ok: false, error: "No encounter is active." };
  if (encounter.status !== "initiative_pending") return { ok: false, error: "Initiative is already locked." };

  let found = false;
  let total = 0;
  const nextCombatants = encounter.combatants.map((row) => {
    if (row.kind !== "player") return row;
    if (row.player_id !== user.id || row.character_id !== characterId) return row;
    found = true;
    total = Math.floor(rollValue) + Number(row.initiative_mod ?? 0);
    return {
      ...row,
      initiative_roll: Math.floor(rollValue),
      initiative_total: total,
      submitted_at: new Date().toISOString(),
      source_id: source,
    };
  });
  if (!found) return { ok: false, error: "Your initiative slot was not found." };

  await supabase
    .from("session_state")
    .update({
      encounter_state: {
        ...encounter,
        combatants: sortEncounterCombatants(nextCombatants),
        updated_at: new Date().toISOString(),
      },
    })
    .eq("session_id", sessionId);

  revalidatePath("/player");
  return { ok: true, total };
}

export async function usePointSupportAction(input: {
  sessionId: string;
  characterId: string;
  actionId: string;
  targetCharacterId: string;
}): Promise<{ ok: boolean; alreadyPending?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const sessionId = String(input.sessionId ?? "").trim();
  const characterId = String(input.characterId ?? "").trim();
  const actionId = String(input.actionId ?? "").trim();
  const targetCharacterId = String(input.targetCharacterId ?? "").trim();
  if (!sessionId || !characterId || !actionId || !targetCharacterId) {
    return { ok: false, error: "Missing session, action, or target." };
  }

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: joinRow, error: joinErr } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", user.id)
    .maybeSingle();
  if (joinErr) return { ok: false, error: joinErr.message };
  if (!joinRow?.player_id) return { ok: false, error: "You are not in this session." };

  const roster = await getSessionCharacterRoster(supabase, sessionId);
  const target = roster.find((row) => row.characterId === targetCharacterId);
  if (!target) return { ok: false, error: "Target character not found in this session." };

  const { data: learned, error: learnedErr } = await supabase
    .from("player_action_links")
    .select("action_id")
    .eq("character_id", characterId)
    .eq("action_id", actionId)
    .maybeSingle();
  if (learnedErr) return { ok: false, error: learnedErr.message };
  if (!learned?.action_id) return { ok: false, error: "You have not learned this action." };

  const { data: action, error: actionErr } = await supabase
    .from("actions")
    .select("id,name,tags,action_config,is_active")
    .eq("id", actionId)
    .maybeSingle();
  if (actionErr) return { ok: false, error: actionErr.message };
  if (!action?.id || action.is_active === false) return { ok: false, error: "Action not available." };
  const supportConfig = normalizeTargetedSupportConfig((action as any)?.action_config);
  if (!supportConfig) return { ok: false, error: "This action is not configured as a targeted support action." };
  if (target.characterId === characterId && supportConfig.target_scope !== "ally_or_self") {
    return { ok: false, error: "This action must target an ally." };
  }

  const { data: stateRow, error: stateErr } = await supabase
    .from("session_state")
    .select("support_effects")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stateErr) return { ok: false, error: stateErr.message };
  if (!stateRow) return { ok: false, error: "Session state not found." };

  const current = normalizePointSupportEffects((stateRow as any)?.support_effects);
  const existing = current.find(
    (row) =>
      row.kind === "point" &&
      row.target_character_id === targetCharacterId &&
      row.action_id === actionId &&
      ["pending_choice", "next_attack_roll", "next_damage_roll", "next_skill_check", "reroll_next_roll"].includes(
        row.status
      )
  );
  if (existing) return { ok: true, alreadyPending: true };

  const sourceName = String((owner.character as any)?.name ?? "").trim() || "Ally";
  const next = [
    ...current,
    {
      id: randomUUID(),
      kind: "point" as const,
      action_id: actionId,
      action_name: String((action as any)?.name ?? "").trim() || null,
      source_player_id: user.id,
      source_character_id: characterId,
      source_name: sourceName,
      target_player_id: target.playerId,
      target_character_id: target.characterId,
      target_name: target.name,
      choice_owner: supportConfig.choice_owner,
      options: supportConfig.options,
      status: "pending_choice" as const,
      damage_bonus: null,
      created_at: new Date().toISOString(),
      chosen_at: null,
      consumed_at: null,
    },
  ];

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ support_effects: next })
    .eq("session_id", sessionId);
  if (upErr) return { ok: false, error: upErr.message };
  revalidatePath("/player");
  return { ok: true };
}

export async function appendEncounterLogAction(input: {
  sessionId: string;
  characterId: string;
  type?: "note" | "damage" | "heal";
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };
  const sessionId = String(input.sessionId ?? "").trim();
  const characterId = String(input.characterId ?? "").trim();
  const text = String(input.text ?? "").trim();
  if (!sessionId || !characterId || !text) return { ok: false, error: "Missing encounter log details." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) return { ok: false, error: "Encounter not active." };
  const me = encounter.combatants.find(
    (row) => row.kind === "player" && String(row.character_id ?? "").trim() === characterId && String(row.player_id ?? "").trim() === user.id
  );
  if (!me) return { ok: false, error: "You are not part of this encounter." };

  const combatLog = [
    ...(Array.isArray(encounter.combat_log) ? encounter.combat_log : []),
    {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: input.type === "damage" || input.type === "heal" ? input.type : "note",
      text,
    },
  ].slice(-60);

  const { error: upErr } = await supabase
    .from("session_state")
    .update({
      encounter_state: {
        ...encounter,
        combat_log: combatLog,
        updated_at: new Date().toISOString(),
      },
    })
    .eq("session_id", sessionId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function moveOwnEncounterTokenAction(input: {
  sessionId: string;
  characterId: string;
  x: number;
  y: number;
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };
  const sessionId = String(input.sessionId ?? "").trim();
  const characterId = String(input.characterId ?? "").trim();
  if (!sessionId || !characterId) return { ok: false, error: "Missing movement details." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("encounter_state")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };
  const encounter = normalizeEncounterState((st as any)?.encounter_state);
  if (!encounter) return { ok: false, error: "Encounter not active." };

  const me = encounter.combatants.find(
    (row) => row.kind === "player" && String(row.character_id ?? "").trim() === characterId && String(row.player_id ?? "").trim() === user.id
  );
  if (!me) return { ok: false, error: "You are not part of this encounter." };

  const x = Math.max(0, Math.min(100, Number(input.x) || 0));
  const y = Math.max(0, Math.min(100, Number(input.y) || 0));
  const combatLog = [
    ...(Array.isArray(encounter.combat_log) ? encounter.combat_log : []),
    {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "move" as const,
      text: `${me.name} moved to ${x.toFixed(1)}%, ${y.toFixed(1)}%.`,
    },
  ].slice(-60);

  const { error: upErr } = await supabase
    .from("session_state")
    .update({
      encounter_state: {
        ...encounter,
        combatants: encounter.combatants.map((row) => (row.id === me.id ? { ...row, x, y } : row)),
        combat_log: combatLog,
        updated_at: new Date().toISOString(),
      },
    })
    .eq("session_id", sessionId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function choosePointSupportAction(input: {
  sessionId: string;
  characterId: string;
  effectId: string;
  choice: "next_attack_roll" | "next_damage_roll" | "next_skill_check" | "reroll_next_roll";
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const sessionId = String(input.sessionId ?? "").trim();
  const characterId = String(input.characterId ?? "").trim();
  const effectId = String(input.effectId ?? "").trim();
  const choice =
    input.choice === "next_damage_roll"
      ? "next_damage_roll"
      : input.choice === "next_skill_check"
        ? "next_skill_check"
        : input.choice === "reroll_next_roll"
          ? "reroll_next_roll"
          : "next_attack_roll";
  if (!sessionId || !characterId || !effectId) return { ok: false, error: "Missing session or Point choice." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: stateRow, error: stateErr } = await supabase
    .from("session_state")
    .select("support_effects")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stateErr) return { ok: false, error: stateErr.message };
  if (!stateRow) return { ok: false, error: "Session state not found." };

  let found = false;
  const nowIso = new Date().toISOString();
  const next = normalizePointSupportEffects((stateRow as any)?.support_effects).map((row) => {
    if (row.id !== effectId) return row;
    if (row.target_character_id !== characterId || row.status !== "pending_choice") return row;
    const chosenOption =
      choice === "next_attack_roll"
        ? row.options.find((opt) => opt.trigger === "next_attack_roll" && opt.grant_advantage)
        : choice === "next_damage_roll"
          ? row.options.find((opt) => opt.trigger === "next_damage_roll" && Number.isFinite(Number(opt.damage_bonus ?? NaN)))
          : choice === "next_skill_check"
            ? row.options.find((opt) => opt.trigger === "next_skill_check" && opt.grant_advantage)
            : row.options.find((opt) => opt.trigger === "reroll_next_roll");
    if (!chosenOption) return row;
    found = true;
    return {
      ...row,
      status: choice,
      damage_bonus: choice === "next_damage_roll" ? Number(chosenOption.damage_bonus ?? 0) : null,
      chosen_at: nowIso,
    };
  });
  if (!found) return { ok: false, error: "Point choice is no longer available." };

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ support_effects: next })
    .eq("session_id", sessionId);
  if (upErr) return { ok: false, error: upErr.message };
  revalidatePath("/player");
  return { ok: true };
}

export async function consumePointSupportEffectsAction(input: {
  sessionId: string;
  characterId: string;
  effectIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const sessionId = String(input.sessionId ?? "").trim();
  const characterId = String(input.characterId ?? "").trim();
  const effectIds = Array.from(new Set((Array.isArray(input.effectIds) ? input.effectIds : []).map((v) => String(v ?? "").trim()).filter(Boolean)));
  if (!sessionId || !characterId || !effectIds.length) return { ok: false, error: "Missing Point effect." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: stateRow, error: stateErr } = await supabase
    .from("session_state")
    .select("support_effects")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (stateErr) return { ok: false, error: stateErr.message };
  if (!stateRow) return { ok: false, error: "Session state not found." };

  const ids = new Set(effectIds);
  const nowIso = new Date().toISOString();
  let changed = false;
  const next = normalizePointSupportEffects((stateRow as any)?.support_effects).map((row) => {
    if (!ids.has(row.id)) return row;
    if (row.target_character_id !== characterId) return row;
    if (!["next_attack_roll", "next_damage_roll", "next_skill_check", "reroll_next_roll"].includes(row.status)) return row;
    changed = true;
    return {
      ...row,
      status: "consumed" as const,
      consumed_at: nowIso,
    };
  });
  if (!changed) return { ok: true };

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ support_effects: next })
    .eq("session_id", sessionId);
  if (upErr) return { ok: false, error: upErr.message };
  revalidatePath("/player");
  return { ok: true };
}

export async function claimNpcGearItemAction(input: {
  characterId: string;
  itemId: string;
}): Promise<{ ok: boolean; alreadyOwned?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const itemId = String(input.itemId ?? "").trim();
  if (!characterId || !itemId) return { ok: false, error: "Missing item or character." };

  const supabase = await supabaseServer();

  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!ch?.id || ch.user_id !== user.id) return { ok: false, error: "Character not found." };

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id,name,faith_required,is_active")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return { ok: false, error: itemErr.message };
  if (!item?.id || item.is_active === false) return { ok: false, error: "Item not available." };

  let faithAvailable = 0;
  const { data: cur } = await supabase
    .from("character_stats_current")
    .select("stat_block_current")
    .eq("character_id", characterId)
    .maybeSingle();
  const curFaith = Number((cur as any)?.stat_block_current?.resources?.faith_available ?? NaN);
  if (Number.isFinite(curFaith)) faithAvailable = curFaith;
  if (!Number.isFinite(curFaith)) {
    const fallbackFaith = Number((ch as any)?.stat_block?.resources?.faith_available ?? NaN);
    if (Number.isFinite(fallbackFaith)) faithAvailable = fallbackFaith;
  }
  const requiredFaith = Math.max(0, Number(item.faith_required ?? 0));
  if (faithAvailable < requiredFaith) {
    return { ok: false, error: `Requires ${requiredFaith} faith.` };
  }

  const { data: existing, error: exErr } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("character_id", characterId)
    .eq("item_id", itemId)
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, alreadyOwned: true };

  const { error: insErr } = await supabase.from("inventory_items").insert({
    character_id: characterId,
    item_id: itemId,
    name: item.name,
    quantity: 1,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/player");
  return { ok: true };
}

export async function claimNpcTrainingTraitAction(input: {
  characterId: string;
  traitId: string;
}): Promise<{ ok: boolean; alreadyOwned?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const traitId = String(input.traitId ?? "").trim();
  if (!characterId || !traitId) return { ok: false, error: "Missing trait or character." };

  const supabase = await supabaseServer();

  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!ch?.id || ch.user_id !== user.id) return { ok: false, error: "Character not found." };

  const { data: trait, error: traitErr } = await supabase
    .from("traits")
    .select("id,name,type,is_active")
    .eq("id", traitId)
    .maybeSingle();
  if (traitErr) return { ok: false, error: traitErr.message };
  if (!trait?.id || trait.is_active === false) return { ok: false, error: "Trait not available." };

  const { data: existing, error: exErr } = await supabase
    .from("player_trait_links")
    .select("id")
    .eq("character_id", characterId)
    .eq("trait_id", traitId)
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, alreadyOwned: true };

  const { error: insErr } = await supabase.from("player_trait_links").insert({
    player_id: user.id,
    character_id: characterId,
    trait_id: traitId,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/player");
  return { ok: true };
}

export async function claimNpcActionAction(input: {
  characterId: string;
  actionId: string;
}): Promise<{ ok: boolean; alreadyOwned?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const actionId = String(input.actionId ?? "").trim();
  if (!characterId || !actionId) return { ok: false, error: "Missing action or character." };

  const supabase = await supabaseServer();

  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!ch?.id || ch.user_id !== user.id) return { ok: false, error: "Character not found." };

  const { data: action, error: actionErr } = await supabase
    .from("actions")
    .select("id,is_active")
    .eq("id", actionId)
    .maybeSingle();
  if (actionErr) return { ok: false, error: actionErr.message };
  if (!action?.id || action.is_active === false) return { ok: false, error: "Action not available." };

  const { data: existing, error: exErr } = await supabase
    .from("player_action_links")
    .select("id")
    .eq("character_id", characterId)
    .eq("action_id", actionId)
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, alreadyOwned: true };

  const { error: insErr } = await supabase.from("player_action_links").insert({
    player_id: user.id,
    character_id: characterId,
    action_id: actionId,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/player");
  return { ok: true };
}

export async function startNpcQuestAction(input: {
  characterId: string;
  questId: string;
  questTitle?: string;
  taskIds?: string[];
  taskDefs?: Array<{
    id: string;
    title?: string;
    kind?: string;
    target_npc_block_id?: string | null;
    target_npc_name?: string | null;
    target_item_id?: string | null;
  }>;
  storytellerControlled?: boolean;
  rewardFaith?: number;
  rewardItemIds?: string[];
}): Promise<{ ok: boolean; status?: string; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  const questTitle = String(input.questTitle ?? "").trim();
  if (!characterId || !questId) return { ok: false, error: "Missing quest or character." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const taskIds = cleanQuestTaskIds(input.taskIds);
  const taskDefs = Array.isArray(input.taskDefs)
    ? normalizeQuestTaskDefs(input.taskDefs)
    : [];
  const rewardItemIds = Array.from(
    new Set(
      (Array.isArray(input.rewardItemIds) ? input.rewardItemIds : [])
        .map((v) => String(v ?? "").trim())
        .filter((v) => isUuid(v))
    )
  ).slice(0, 25);
  const rewardFaith = Math.max(0, Math.min(100, Math.floor(Number(input.rewardFaith ?? 0) || 0)));
  const storytellerControlled = Boolean(input.storytellerControlled);
  if (storytellerControlled) {
    return { ok: false, error: "Storyteller will assign this quest." };
  }

  const { data: existing, error: exErr } = await supabase
    .from("player_quest_progress")
    .select("id,status")
    .eq("character_id", characterId)
    .eq("quest_id", questId)
    .maybeSingle();
  if (exErr) {
    if (hasMissingTableError(exErr, "player_quest_progress")) {
      return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
    }
    return { ok: false, error: exErr.message };
  }
  if (existing?.status === "claimed") return { ok: true, status: "claimed" };
  if (existing?.id) return { ok: true, status: String(existing.status ?? "active") };

  const effectiveTaskIds = taskIds.length ? taskIds : taskDefs.map((t) => t.id);
  const autoDone = await getAutoCompletedItemTaskIds(supabase, characterId, taskDefs);
  const nextDone = Array.from(new Set(autoDone.map((v) => String(v).trim()).filter(Boolean)));
  const nextStatus =
    effectiveTaskIds.length > 0 && effectiveTaskIds.every((id) => nextDone.includes(id))
      ? "completed"
      : "active";

  const { error: insErr } = await supabase.from("player_quest_progress").insert({
    player_id: user.id,
    character_id: characterId,
    quest_id: questId,
    quest_title: questTitle || null,
    status: nextStatus,
    completed_task_ids: nextDone,
    completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    reward_meta: {
      faith: rewardFaith,
      item_ids: rewardItemIds,
      task_ids: effectiveTaskIds,
      task_defs: taskDefs,
      storyteller_controlled: storytellerControlled,
    },
  });
  if (insErr) {
    if (hasMissingTableError(insErr, "player_quest_progress")) {
      return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
    }
    return { ok: false, error: insErr.message };
  }

  await appendGameLogSafe(supabase, {
    userId: user.id,
    characterId,
    eventType: "quest_started",
    title: `Quest Started: ${questTitle || questId}`,
    summary: "Quest accepted.",
  });

  revalidatePath("/player");
  return { ok: true, status: nextStatus };
}

export async function completeNpcQuestTaskAction(input: {
  characterId: string;
  questId: string;
  questTitle?: string;
  taskId: string;
  allTaskIds?: string[];
  taskDefs?: Array<{
    id: string;
    title?: string;
    kind?: string;
    target_npc_block_id?: string | null;
    target_npc_name?: string | null;
    target_item_id?: string | null;
  }>;
}): Promise<{ ok: boolean; status?: string; completedTaskIds?: string[]; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  const taskId = String(input.taskId ?? "").trim();
  if (!characterId || !questId || !taskId) return { ok: false, error: "Missing quest task details." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const allTaskIds = cleanQuestTaskIds(input.allTaskIds);
  const { data: row, error: rowErr } = await supabase
    .from("player_quest_progress")
    .select("id,status,completed_task_ids,reward_meta")
    .eq("character_id", characterId)
    .eq("quest_id", questId)
    .maybeSingle();
  if (rowErr) {
    if (hasMissingTableError(rowErr, "player_quest_progress")) {
      return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
    }
    return { ok: false, error: rowErr.message };
  }

  const currentDone = Array.isArray((row as any)?.completed_task_ids) ? (row as any).completed_task_ids : [];
  const storedTaskDefs = normalizeQuestTaskDefs(
    Array.isArray((row as any)?.reward_meta?.task_defs) ? (row as any).reward_meta.task_defs : []
  );
  const inputTaskDefs = normalizeQuestTaskDefs(Array.isArray(input.taskDefs) ? input.taskDefs : []);
  const taskDefById = new Map<string, any>();
  for (const t of [...storedTaskDefs, ...inputTaskDefs]) {
    const id = String(t?.id ?? "").trim();
    if (!id || taskDefById.has(id)) continue;
    taskDefById.set(id, t);
  }
  const taskDefs = Array.from(taskDefById.values());
  const autoDone = await getAutoCompletedItemTaskIds(supabase, characterId, taskDefs);
  const storytellerControlled = toBool((row as any)?.reward_meta?.storyteller_controlled, false);
  if (storytellerControlled) {
    return { ok: false, error: "Storyteller controls this quest's progress." };
  }
  const taskDef = taskDefById.get(taskId) ?? null;
  if (taskDef && String(taskDef.kind ?? "").trim().toLowerCase() === "have_item") {
    const requiredItemId = String(taskDef.target_item_id ?? "").trim().toLowerCase();
    if (requiredItemId && isUuidLike(requiredItemId)) {
      const { data: invRow, error: invErr } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("character_id", characterId)
        .eq("item_id", requiredItemId)
        .limit(1)
        .maybeSingle();
      if (invErr) return { ok: false, error: invErr.message };
      if (!invRow?.id) {
        return { ok: false, error: "You need the required quest item in your inventory first." };
      }
    }
  }
  const nextDone = Array.from(
    new Set([...currentDone.map((v: any) => String(v)), ...autoDone.map((v) => String(v)), taskId])
  );
  const isCompleted = allTaskIds.length > 0 && allTaskIds.every((id) => nextDone.includes(id));
  const nextStatus = (row as any)?.status === "claimed" ? "claimed" : isCompleted ? "completed" : "active";
  if ((row as any)?.status === "claimed") {
    return { ok: false, error: "Quest already claimed." };
  }

  if (!(row as any)?.id) {
    const { error: insErr } = await supabase.from("player_quest_progress").insert({
      player_id: user.id,
      character_id: characterId,
      quest_id: questId,
      quest_title: String(input.questTitle ?? "").trim() || null,
      status: nextStatus,
      completed_task_ids: nextDone,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
      reward_meta: { task_ids: allTaskIds },
      last_task_at: new Date().toISOString(),
    });
    if (insErr) {
      if (hasMissingTableError(insErr, "player_quest_progress")) {
        return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
      }
      return { ok: false, error: insErr.message };
    }
    if (nextStatus === "completed") {
      await appendGameLogSafe(supabase, {
        userId: user.id,
        characterId,
        eventType: "quest_complete",
        title: `Quest Ready: ${String(input.questTitle ?? questId)}`,
        summary: "All tasks completed. Claim your rewards.",
      });
    }
  } else {
    const { error: upErr } = await supabase
      .from("player_quest_progress")
      .update({
        completed_task_ids: nextDone,
        status: nextStatus,
        completed_at: nextStatus === "completed" ? new Date().toISOString() : (row as any)?.completed_at ?? null,
        last_task_at: new Date().toISOString(),
      })
      .eq("id", (row as any).id);
    if (upErr) return { ok: false, error: upErr.message };
    if ((row as any)?.status !== "completed" && nextStatus === "completed") {
      await appendGameLogSafe(supabase, {
        userId: user.id,
        characterId,
        eventType: "quest_complete",
        title: `Quest Ready: ${String(input.questTitle ?? questId)}`,
        summary: "All tasks completed. Claim your rewards.",
      });
    }
  }

  revalidatePath("/player");
  return { ok: true, status: nextStatus, completedTaskIds: nextDone };
}

export async function claimNpcQuestRewardsAction(input: {
  characterId: string;
  questId: string;
  questTitle?: string;
  allTaskIds?: string[];
  rewardFaith?: number;
  rewardItemIds?: string[];
}): Promise<{ ok: boolean; alreadyClaimed?: boolean; grantedItems?: number; faithAwarded?: number; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  if (!characterId || !questId) return { ok: false, error: "Missing quest or character." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const allTaskIds = cleanQuestTaskIds(input.allTaskIds);
  const fallbackRewardItemIds = Array.from(
    new Set(
      (Array.isArray(input.rewardItemIds) ? input.rewardItemIds : [])
        .map((v) => String(v ?? "").trim())
        .filter((v) => isUuid(v))
    )
  ).slice(0, 25);
  const fallbackRewardFaith = Math.max(0, Math.min(100, Math.floor(Number(input.rewardFaith ?? 0) || 0)));

  const { data: row, error: rowErr } = await supabase
    .from("player_quest_progress")
    .select("id,status,completed_task_ids,reward_meta")
    .eq("character_id", characterId)
    .eq("quest_id", questId)
    .maybeSingle();
  if (rowErr) {
    if (hasMissingTableError(rowErr, "player_quest_progress")) {
      return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
    }
    return { ok: false, error: rowErr.message };
  }

  if (!(row as any)?.id) {
    return { ok: false, error: "Start the quest first." };
  }
  if ((row as any)?.status === "claimed") return { ok: true, alreadyClaimed: true };

  const currentDone = Array.isArray((row as any)?.completed_task_ids) ? (row as any).completed_task_ids : [];
  const taskDefs = Array.isArray((row as any)?.reward_meta?.task_defs) ? (row as any).reward_meta.task_defs : [];
  const autoDone = await getAutoCompletedItemTaskIds(supabase, characterId, taskDefs);
  const doneSet = new Set(
    [...currentDone, ...autoDone].map((v: any) => String(v).trim()).filter(Boolean)
  );
  const effectiveTaskIds =
    allTaskIds.length > 0
      ? allTaskIds
      : cleanQuestTaskIds(
          Array.isArray((row as any)?.reward_meta?.task_ids)
            ? (row as any).reward_meta.task_ids
            : taskDefs.map((t: any) => String(t?.id ?? ""))
        );
  const canComplete = effectiveTaskIds.length > 0 ? effectiveTaskIds.every((id) => doneSet.has(id)) : true;
  if (!canComplete) return { ok: false, error: "Complete all quest tasks first." };

  const rewardMeta = ((row as any)?.reward_meta ?? {}) as any;
  const rewardFaith = Math.max(
    0,
    Math.min(100, Math.floor(Number(rewardMeta?.faith ?? fallbackRewardFaith) || 0))
  );
  const rewardItemIds = Array.from(
    new Set(
      (Array.isArray(rewardMeta?.item_ids) ? rewardMeta.item_ids : fallbackRewardItemIds)
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  ).slice(0, 25);

  const rewardTaskDefs = normalizeQuestTaskDefs(Array.isArray(rewardMeta?.task_defs) ? rewardMeta.task_defs : []);
  const requiredTurnInItemIds = Array.from(
    new Set(
      rewardTaskDefs
        .map((t: any) => {
          const kind = String(t?.kind ?? "").trim().toLowerCase();
          if (!["have_item", "item", "requires_item", "task"].includes(kind)) return null;
          return extractTaskItemId(t);
        })
        .filter((v: unknown): v is string => typeof v === "string" && Boolean(v) && isUuid(v))
    )
  );

  // Consume required quest items (turn-in) once the quest is being claimed.
  for (const itemId of requiredTurnInItemIds) {
    const { data: invRow, error: invErr } = await supabase
      .from("inventory_items")
      .select("id,quantity")
      .eq("character_id", characterId)
      .eq("item_id", itemId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (invErr) return { ok: false, error: invErr.message };
    if (!invRow?.id) {
      return { ok: false, error: "Required quest item is missing from inventory." };
    }
    const qty = Math.max(1, Number((invRow as any).quantity ?? 1));
    if (qty > 1) {
      const { error: upErr } = await supabase
        .from("inventory_items")
        .update({ quantity: qty - 1 })
        .eq("id", String((invRow as any).id));
      if (upErr) return { ok: false, error: upErr.message };
    } else {
      const { error: delErr } = await supabase
        .from("inventory_items")
        .delete()
        .eq("id", String((invRow as any).id));
      if (delErr) return { ok: false, error: delErr.message };
    }
  }

  let grantedItems = 0;
  if (rewardItemIds.length) {
    const { data: itemRows, error: itemErr } = await supabase
      .from("items")
      .select("id,name,is_active,stackable,max_stack")
      .in("id", rewardItemIds);
    if (itemErr) return { ok: false, error: itemErr.message };
    const validItems = (itemRows ?? []).filter((row: any) => row?.id && row.is_active !== false);
    for (const it of validItems as any[]) {
      const itemId = String(it.id);
      const isStackable = Boolean((it as any).stackable ?? true);
      const maxStack = Number((it as any).max_stack ?? NaN);
      const stackCap = Number.isFinite(maxStack) && maxStack > 0 ? Math.floor(maxStack) : null;
      const { data: existing, error: exErr } = await supabase
        .from("inventory_items")
        .select("id,quantity")
        .eq("character_id", characterId)
        .eq("item_id", itemId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (exErr) return { ok: false, error: exErr.message };
      if (existing?.id && isStackable) {
        const qty = Math.max(1, Number((existing as any).quantity ?? 1));
        if (stackCap && qty >= stackCap) {
          continue;
        }
        const { error: upErr } = await supabase
          .from("inventory_items")
          .update({ quantity: stackCap ? Math.min(stackCap, qty + 1) : qty + 1 })
          .eq("id", (existing as any).id);
        if (upErr) return { ok: false, error: upErr.message };
      } else {
        const { error: insErr } = await supabase.from("inventory_items").insert({
          character_id: characterId,
          item_id: itemId,
          name: String((it as any).name ?? "Quest Reward"),
          quantity: 1,
        });
        if (insErr) return { ok: false, error: insErr.message };
      }
      grantedItems += 1;
    }
  }

  if (rewardFaith > 0) {
    const { data: cur, error: curErr } = await supabase
      .from("character_stats_current")
      .select("id,stat_block_current")
      .eq("character_id", characterId)
      .maybeSingle();
    if (curErr) return { ok: false, error: curErr.message };

    if (cur?.id) {
      const sb = ((cur as any).stat_block_current ?? {}) as any;
      const resources = { ...(sb.resources ?? {}) };
      const before = Number(resources.faith_available ?? 0);
      resources.faith_available = (Number.isFinite(before) ? before : 0) + rewardFaith;
      const nextStat = { ...sb, resources };
      const { error: upErr } = await supabase
        .from("character_stats_current")
        .update({ stat_block_current: nextStat })
        .eq("id", (cur as any).id);
      if (upErr) return { ok: false, error: upErr.message };
    } else {
      const sb = ((owner as any).character?.stat_block ?? {}) as any;
      const resources = { ...(sb.resources ?? {}) };
      const before = Number(resources.faith_available ?? 0);
      resources.faith_available = (Number.isFinite(before) ? before : 0) + rewardFaith;
      const nextStat = { ...sb, resources };
      const { error: upErr } = await supabase
        .from("characters")
        .update({ stat_block: nextStat })
        .eq("id", characterId);
      if (upErr) return { ok: false, error: upErr.message };
    }
  }

  const { error: claimErr } = await supabase
    .from("player_quest_progress")
    .update({
      quest_title: String(input.questTitle ?? "").trim() || null,
      status: "claimed",
      completed_at: new Date().toISOString(),
      claimed_at: new Date().toISOString(),
      reward_meta: {
        ...rewardMeta,
        faith: rewardFaith,
        item_ids: rewardItemIds,
        task_ids: effectiveTaskIds.length ? effectiveTaskIds : rewardMeta?.task_ids ?? [],
      },
      completed_task_ids: Array.from(doneSet),
    })
    .eq("id", (row as any).id);
  if (claimErr) return { ok: false, error: claimErr.message };

  const questTitle = String(input.questTitle ?? "").trim() || questId;
  await appendGameLogSafe(supabase, {
    userId: user.id,
    characterId,
    eventType: "quest_complete",
    title: `Quest Completed: ${questTitle}`,
    summary: "Rewards claimed.",
  });
  if (rewardFaith > 0) {
    await appendGameLogSafe(supabase, {
      userId: user.id,
      characterId,
      eventType: "faith_earned",
      title: `Faith Earned: +${rewardFaith}`,
      summary: `From quest: ${questTitle}`,
    });
  }
  if (rewardItemIds.length) {
    const { data: rewardItems } = await supabase
      .from("items")
      .select("id,name")
      .in("id", rewardItemIds);
    for (const itemId of rewardItemIds) {
      const itemIdStr = String(itemId);
      const itemName =
        (rewardItems ?? []).find((it: any) => String(it?.id) === itemIdStr)?.name ?? itemIdStr;
      await appendGameLogSafe(supabase, {
        userId: user.id,
        characterId,
        eventType: "item_acquired",
        title: `Item Acquired: ${String(itemName)}`,
        summary: `Quest reward from ${questTitle}`,
        itemId: itemIdStr,
      });
    }
  }

  revalidatePath("/player");
  return { ok: true, grantedItems, faithAwarded: rewardFaith };
}

export async function abandonNpcQuestAction(input: {
  characterId: string;
  questId: string;
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const questId = String(input.questId ?? "").trim();
  if (!characterId || !questId) return { ok: false, error: "Missing quest or character." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: row, error: rowErr } = await supabase
    .from("player_quest_progress")
    .select("id,status,quest_title")
    .eq("character_id", characterId)
    .eq("quest_id", questId)
    .maybeSingle();
  if (rowErr) {
    if (hasMissingTableError(rowErr, "player_quest_progress")) {
      return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
    }
    return { ok: false, error: rowErr.message };
  }
  if (!(row as any)?.id) return { ok: false, error: "Quest not found on this character." };

  const status = String((row as any)?.status ?? "").trim().toLowerCase();
  if (status === "claimed") {
    return { ok: false, error: "Claimed quests cannot be abandoned." };
  }

  const { error: delErr } = await supabase
    .from("player_quest_progress")
    .delete()
    .eq("id", String((row as any).id));
  if (delErr) return { ok: false, error: delErr.message };

  await appendGameLogSafe(supabase, {
    userId: user.id,
    characterId,
    eventType: "quest_abandoned",
    title: `Quest Abandoned: ${String((row as any)?.quest_title ?? questId)}`,
    summary: "Player abandoned this quest.",
  });

  revalidatePath("/player");
  return { ok: true };
}

export async function useInventoryItemAction(input: {
  characterId: string;
  inventoryItemId: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const inventoryItemId = String(input.inventoryItemId ?? "").trim();
  if (!characterId || !inventoryItemId) return { ok: false, error: "Missing item or character." };

  const supabase = await supabaseServer();
  const owner = await requireOwnedCharacter(supabase, user.id, characterId);
  if (!owner.ok) return { ok: false, error: owner.error };

  const { data: invRow, error: invErr } = await supabase
    .from("inventory_items")
    .select("id,character_id,item_id,name,quantity")
    .eq("id", inventoryItemId)
    .eq("character_id", characterId)
    .maybeSingle();
  if (invErr) return { ok: false, error: invErr.message };
  if (!invRow?.id) return { ok: false, error: "Inventory item not found." };

  const itemId = String((invRow as any).item_id ?? "").trim();
  if (!itemId) return { ok: false, error: "This item cannot be used." };

  const { data: itemRow, error: itemErr } = await supabase
    .from("items")
    .select("id,name")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return { ok: false, error: itemErr.message };
  if (!itemRow?.id) return { ok: false, error: "Item record missing." };

  const { data: effects, error: effectsErr } = await supabase
    .from("item_effects")
    .select("effect_type,effect_key,mode,notes")
    .eq("item_id", itemId);
  if (effectsErr) return { ok: false, error: effectsErr.message };

  const classPkgEffect = (effects ?? []).find(
    (e: any) =>
      String(e?.effect_type ?? "").trim().toLowerCase() === "special" &&
      String(e?.effect_key ?? "").trim().toLowerCase() === "class_package"
  ) as any;
  if (!classPkgEffect) {
    return { ok: false, error: "This item has no usable class package configured." };
  }

  let cfg: any = null;
  try {
    cfg = JSON.parse(String(classPkgEffect?.notes ?? "{}"));
  } catch {
    return { ok: false, error: "Class package JSON is invalid on this item." };
  }

  const packageId = String(cfg?.package_id ?? itemId).trim();
  const className = String(cfg?.class_name ?? "").trim();
  const replaceStatBlock =
    cfg && typeof cfg.replace_stat_block === "object" && cfg.replace_stat_block
      ? normalizeStatBlockShape(cfg.replace_stat_block as Record<string, any>)
      : null;
  const grantItemIds: string[] = Array.from(
    new Set(
      (Array.isArray(cfg?.grant_item_ids) ? cfg.grant_item_ids : [])
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  );
  const grantTraitIds: string[] = Array.from(
    new Set(
      (Array.isArray(cfg?.grant_trait_ids) ? cfg.grant_trait_ids : [])
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  );
  const grantActionIds: string[] = Array.from(
    new Set(
      (Array.isArray(cfg?.grant_action_ids) ? cfg.grant_action_ids : [])
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  );
  const consumeOnUse = Boolean(cfg?.consume_on_use);
  const fallbackInput = {
    userId: user.id,
    characterId,
    inventoryItemId,
    packageId,
    className,
    replaceStatBlock,
    grantItemIds,
    grantTraitIds,
    grantActionIds,
    consumeOnUse,
  };

  let result:
    | { ok: true; alreadyApplied: boolean; warning?: string }
    | { ok: false; error: string };

  const { data: rpcData, error: rpcErr } = await supabase.rpc("apply_class_package_from_inventory", {
    p_character_id: characterId,
    p_inventory_item_id: inventoryItemId,
    p_package_id: packageId,
    p_class_name: className || null,
    p_replace_stat_block: replaceStatBlock ?? null,
    p_grant_item_ids: grantItemIds,
    p_grant_trait_ids: grantTraitIds,
    p_grant_action_ids: grantActionIds,
    p_consume_on_use: consumeOnUse,
  });

  if (rpcErr && !hasMissingFunctionError(rpcErr, "apply_class_package_from_inventory")) {
    return { ok: false, error: rpcErr.message || "Failed to apply class package." };
  }

  if (rpcErr) {
    result = await applyClassPackageFallback(supabase, fallbackInput);
  } else {
    const rpcResult = rpcData && typeof rpcData === "object" ? (rpcData as Record<string, any>) : {};
    const alreadyApplied = Boolean(rpcResult.already_applied);
    const nextStatBlock = buildClassPackageStatBlock(
      normalizeStatBlockShape((owner.character as any)?.stat_block ?? {}),
      replaceStatBlock,
      packageId,
      alreadyApplied
    );
    const syncErr = await syncCharacterStatsCurrent(supabase, characterId, nextStatBlock);
    result = syncErr.ok
      ? { ok: true, alreadyApplied }
      : {
          ok: true,
          alreadyApplied,
          warning: syncErr.error,
        };

    if (alreadyApplied) {
      const repairResult = await applyClassPackageFallback(supabase, fallbackInput);
      if (!repairResult.ok) {
        return {
          ok: false,
          error: repairResult.error || "Failed to repair class package state.",
        };
      }
      result = {
        ok: true,
        alreadyApplied: true,
        warning: result.warning,
      };
    }
  }

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "Failed to apply class package.",
    };
  }
  const resultMessage = result.alreadyApplied ? "Class package already applied." : "Class package applied.";

  await appendGameLogSafe(supabase, {
    userId: user.id,
    characterId,
    eventType: "class_package_applied",
    title: `Class package applied: ${className || String(itemRow?.name ?? "Class Item")}`,
    summary: `Used item: ${String(itemRow?.name ?? itemId)}`,
    itemId,
  });

  revalidatePath("/player");
  return {
    ok: true,
    message: result.warning ? `${resultMessage} Current stat sync warning: ${result.warning}` : resultMessage,
  };
}
