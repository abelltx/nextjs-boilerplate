import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import PlayerHubClient from "./_components/PlayerHubClient";
import { parsePassiveEffectNotes } from "@/lib/passiveEffectNotes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

type ItemEffectRow = {
  item_id?: string | null;
  effect_type: string | null;
  effect_key: string | null;
  mode: string | null;
  value: number | null;
  notes: string | null;
};
type AdvantageMap = Record<string, string[]>;
type TraitEffectRow = {
  effect_type: string | null;
  effect_key: string | null;
  mode: string | null;
  value: number | null;
  notes: string | null;
};
type PlayerActionRow = {
  id: string;
  name: string;
  type: string | null;
  summary: string | null;
  rules_text?: string | null;
  range_normal?: number | null;
  range_max?: number | null;
  uses_attack_roll?: boolean | null;
  save_ability?: string | null;
  save_dc_override?: number | null;
  damage_dice?: string | null;
  attack_bonus_override?: number | null;
  damage_bonus?: number | null;
  damage_type?: string | null;
  on_fail?: string | null;
  on_success?: string | null;
};
type QuestProgressRow = {
  quest_id: string | null;
  quest_title: string | null;
  status: string | null;
  completed_task_ids: string[] | null;
  claimed_at: string | null;
  reward_meta?: any;
};
type QuestTaskView = {
  id: string;
  title: string;
  kind?: string;
  target_npc_block_id?: string | null;
  target_npc_name?: string | null;
};

function n(v: unknown, fallback = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : fallback;
}

function toSaveKey(raw: string): AbilityKey | null {
  const key = raw.replace(/_save$/i, "").trim().toLowerCase();
  if (["str", "dex", "con", "int", "wis", "cha"].includes(key)) return key as AbilityKey;
  return null;
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

function applyEffects(
  baseStat: any,
  effects: Array<ItemEffectRow | TraitEffectRow>,
  itemNameById: Record<string, string> = {},
  equippedItemIds: Set<string> = new Set()
) {
  const stat = { ...(baseStat ?? {}) } as any;
  const abilities = { ...(stat.abilities ?? {}) } as Record<string, number>;
  const baseAbilities = { ...abilities } as Record<string, number>;
  const saves = { ...(stat.saves ?? {}) } as Record<string, number>;
  const skills = { ...(stat.skills ?? {}) } as Record<string, number>;
  const derived = { ...(stat.derived ?? {}) } as Record<string, number>;
  const statusEffects = Array.isArray(stat.effects) ? [...stat.effects] : [];
  const passiveNotes = Array.isArray(stat.passiveNotes) ? [...stat.passiveNotes] : [];
  const advantages: AdvantageMap = { ...(stat.advantages ?? {}) };

  for (const e of effects) {
    const type = String(e.effect_type ?? "").trim().toLowerCase();
    const key = String(e.effect_key ?? "").trim().toLowerCase();
    const mode = String(e.mode ?? "").trim().toLowerCase();
    const value = n(e.value, 0);

    if (!type || !key) continue;

    if (type === "ability" && ["str", "dex", "con", "int", "wis", "cha"].includes(key)) {
      const cur = n(abilities[key], 10);
      abilities[key] = mode === "set" ? value : cur + value;
      continue;
    }

    if (type === "ac") {
      const cur = n(derived.defense, 0);
      derived.defense = mode === "set" ? value : cur + value;
      continue;
    }

    if (type === "speed") {
      const cur = n(derived.speed, 0);
      derived.speed = mode === "set" ? value : cur + value;
      continue;
    }

    if (type === "skill") {
      const cur = n(skills[key], 0);
      skills[key] = mode === "set" ? value : cur + value;
      continue;
    }

    if (type === "save") {
      const saveKey = toSaveKey(key);
      if (!saveKey) continue;
      const cur = n(saves[saveKey], 0);
      saves[saveKey] = mode === "set" ? value : cur + value;
      continue;
    }

    if (type === "resistance" || type === "immunity" || type === "advantage") {
      const sourceId = String((e as ItemEffectRow)?.item_id ?? "").trim();
      const sourceName =
        (sourceId ? itemNameById[sourceId] : "") ||
        (type === "advantage" ? "Feature" : "Effect");
      if (type === "advantage") {
        const advKey = key;
        const existing = Array.isArray(advantages[advKey]) ? advantages[advKey] : [];
        if (!existing.includes(sourceName)) advantages[advKey] = [...existing, sourceName];
      }
      statusEffects.push({
        name: `${type}: ${key}${type === "advantage" ? ` (${sourceName})` : ""}`,
        kind: "buff",
      });
      continue;
    }

    if (type === "special") {
      statusEffects.push({
        name: e.notes?.trim() || "special item effect",
        kind: "buff",
      });
      continue;
    }

    if (type === "passive") {
      const sourceId = String((e as ItemEffectRow)?.item_id ?? "").trim();
      const activationMode = String(e.mode ?? "").trim().toLowerCase();
      const activeWhenOwned = activationMode === "owned" || activationMode === "always";
      const activeWhenEquipped = !activeWhenOwned;
      if (activeWhenEquipped && (!sourceId || !equippedItemIds.has(sourceId))) continue;
      const sourceName =
        (sourceId ? itemNameById[sourceId] : "") ||
        String(e.effect_key ?? "").trim() ||
        "Item";
      const parsed = parsePassiveEffectNotes(e.notes);
      const text = parsed.playerText;
      if (text) passiveNotes.push({ source: sourceName, text });
    }
  }

  stat.abilities = abilities;
  stat.saves = saves;
  stat.skills = skills;
  stat.derived = derived;
  stat.effects = statusEffects;
  stat.passiveNotes = passiveNotes;
  stat.advantages = advantages;
  stat._breakdown = {
    ...(stat._breakdown ?? {}),
    abilities: {
      str: {
        base: n(baseAbilities.str, 10),
        gear: n(abilities.str, 10) - n(baseAbilities.str, 10),
        final: n(abilities.str, 10),
      },
      dex: {
        base: n(baseAbilities.dex, 10),
        gear: n(abilities.dex, 10) - n(baseAbilities.dex, 10),
        final: n(abilities.dex, 10),
      },
      con: {
        base: n(baseAbilities.con, 10),
        gear: n(abilities.con, 10) - n(baseAbilities.con, 10),
        final: n(abilities.con, 10),
      },
      int: {
        base: n(baseAbilities.int, 10),
        gear: n(abilities.int, 10) - n(baseAbilities.int, 10),
        final: n(abilities.int, 10),
      },
      wis: {
        base: n(baseAbilities.wis, 10),
        gear: n(abilities.wis, 10) - n(baseAbilities.wis, 10),
        final: n(abilities.wis, 10),
      },
      cha: {
        base: n(baseAbilities.cha, 10),
        gear: n(abilities.cha, 10) - n(baseAbilities.cha, 10),
        final: n(abilities.cha, 10),
      },
    },
  };
  return stat;
}

export default async function PlayerPage() {
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();

  const accessLabel = profile
    ? `${profile.is_admin ? "admin " : ""}${profile.is_storyteller ? "storyteller " : ""}player`.trim()
    : "player";

  // ---- Character (MVP: first character) ----
  const { data: chars, error: charReadErr } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (charReadErr) throw new Error(`Failed to load character: ${charReadErr.message}`);

  let character = chars?.[0] ?? null;

  if (!character) {
    const { data: created, error: charCreateErr } = await supabase
      .from("characters")
      .insert({ user_id: user.id, name: "Neweyes Adventurer", class: "Pilgrim", level: 1 })
      .select("*")
      .single();

    if (charCreateErr) throw new Error(`Failed to create character: ${charCreateErr.message}`);
    character = created;
  }

  // ---- Inventory ----
  const { data: inventory, error: invErr } = await supabase
    .from("inventory_items")
    .select("id,item_id,name,quantity,created_at")
    .eq("character_id", character.id)
    .order("created_at", { ascending: true });

  if (invErr) throw new Error(`Failed to load inventory: ${invErr.message}`);

  // ---- Sessions joined ----
  let sessions: any[] = [];
  let sessionStates: Record<string, any> = {};

  const { data: joins, error: joinErr } = await supabase
    .from("session_players")
    .select("session_id, joined_at")
    .eq("player_id", user.id)
    .order("joined_at", { ascending: false });

  if (joinErr) throw new Error(`Failed to load session joins: ${joinErr.message}`);

  if (joins?.length) {
    const sessionIds = joins.map((j: any) => j.session_id).filter(Boolean);

    const { data: sData, error: sErr } = await supabase
      .from("sessions")
      .select("id,name,episode_id,story_text,created_at")
      .in("id", sessionIds);

    if (sErr) throw new Error(`Failed to load sessions: ${sErr.message}`);
    sessions = sData ?? [];

    const { data: stData, error: stErr } = await supabase
      .from("session_state")
      .select("*")
      .in("session_id", sessionIds);

    if (stErr) throw new Error(`Failed to load session state: ${stErr.message}`);

    for (const row of stData ?? []) sessionStates[row.session_id] = row;
  }

  // ---- Presented blocks lookup (for stage) ----
  const presentedIds = Array.from(
    new Set(
      Object.values(sessionStates)
        .map((st: any) => st?.presented_block_id)
        .filter((id: any) => typeof id === "string" && id.length > 0)
    )
  );

  let presentedBlocks: Record<string, any> = {};
  if (presentedIds.length) {
    const { data: blocks, error: bErr } = await supabase
      .from("episode_blocks")
      .select("id,sort_order,block_type,audience,mode,title,body,image_url,meta")
      .in("id", presentedIds);

    if (bErr) throw new Error(`Failed to load presented blocks: ${bErr.message}`);

    for (const b of blocks ?? []) presentedBlocks[b.id] = b;
  }

  // ---- Journey Log ----
  let gameLog: any[] = [];
  const { data: logData, error: logErr } = await supabase
    .from("game_log")
    .select("id,event_type,title,summary,session_id,episode_id,created_at")
    .eq("user_id", user.id)
    .eq("character_id", character.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (logErr) throw new Error(`Failed to load game log: ${logErr.message}`);
  gameLog = logData ?? [];

  const { data: curRow, error: curErr } = await supabase
    .from("character_stats_current")
    .select("stat_block_current")
    .eq("character_id", character.id)
    .single();

  if (curErr) throw new Error(`Failed to load current stats: ${curErr.message}`);

  const { data: equippedRows, error: equippedErr } = await supabase
    .from("inventory_items")
    .select("item_id")
    .eq("character_id", character.id)
    .eq("equipped", true)
    .not("item_id", "is", null);

  if (equippedErr) throw new Error(`Failed to load equipped items: ${equippedErr.message}`);

  const equippedItemIds = Array.from(
    new Set(
      (equippedRows ?? [])
        .map((r: { item_id: string | null }) => r.item_id)
        .filter((id: string | null): id is string => Boolean(id))
    )
  );
  const ownedItemIds = Array.from(
    new Set(
      (inventory ?? [])
        .map((r: any) => String(r?.item_id ?? "").trim())
        .filter(Boolean)
    )
  );

  let itemEffects: ItemEffectRow[] = [];
  if (equippedItemIds.length) {
    const { data: effectsRows, error: effectsErr } = await supabase
      .from("item_effects")
      .select("item_id,effect_type,effect_key,mode,value,notes,sort_order,created_at")
      .in("item_id", equippedItemIds)
      .neq("effect_type", "passive")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (effectsErr) throw new Error(`Failed to load item effects: ${effectsErr.message}`);
    itemEffects = (effectsRows ?? []) as ItemEffectRow[];
  }
  let passiveItemEffects: ItemEffectRow[] = [];
  if (ownedItemIds.length) {
    const { data: passiveRows, error: passiveErr } = await supabase
      .from("item_effects")
      .select("item_id,effect_type,effect_key,mode,value,notes,sort_order,created_at")
      .in("item_id", ownedItemIds)
      .eq("effect_type", "passive")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (passiveErr) throw new Error(`Failed to load passive item effects: ${passiveErr.message}`);
    passiveItemEffects = (passiveRows ?? []) as ItemEffectRow[];
  }
  const { data: traitLinks, error: traitLinksErr } = await supabase
    .from("player_trait_links")
    .select("trait_id")
    .eq("character_id", character.id);
  if (traitLinksErr && !String(traitLinksErr.message ?? "").toLowerCase().includes("does not exist")) {
    throw new Error(`Failed to load player traits: ${traitLinksErr.message}`);
  }
  const learnedTraitIds = Array.from(
    new Set(
      (traitLinks ?? [])
        .map((r: { trait_id: string | null }) => r.trait_id)
        .filter((id: string | null): id is string => Boolean(id))
    )
  );
  const { data: actionLinks, error: actionLinksErr } = await supabase
    .from("player_action_links")
    .select("action_id")
    .eq("character_id", character.id);
  if (actionLinksErr && !String(actionLinksErr.message ?? "").toLowerCase().includes("does not exist")) {
    throw new Error(`Failed to load player actions: ${actionLinksErr.message}`);
  }
  const learnedActionIds = Array.from(
    new Set(
      (actionLinks ?? [])
        .map((r: { action_id: string | null }) => r.action_id)
        .filter((id: string | null): id is string => Boolean(id))
    )
  );
  let learnedActions: PlayerActionRow[] = [];
  if (learnedActionIds.length) {
    const { data: actionRows, error: learnedActionsErr } = await supabase
      .from("actions")
      .select("*")
      .in("id", learnedActionIds)
      .order("name", { ascending: true });
    if (learnedActionsErr) throw new Error(`Failed to load action details: ${learnedActionsErr.message}`);
    learnedActions = (actionRows ?? []).map((r: any) => ({
      id: String(r.id),
      name: String(r.name ?? "Action"),
      type: r.type ?? null,
      summary: r.summary ?? null,
      rules_text: r.rules_text ?? null,
      range_normal: Number.isFinite(Number(r.range_normal)) ? Number(r.range_normal) : null,
      range_max: Number.isFinite(Number(r.range_max)) ? Number(r.range_max) : null,
      uses_attack_roll: typeof r.uses_attack_roll === "boolean" ? r.uses_attack_roll : null,
      save_ability: r.save_ability ?? null,
      save_dc_override: Number.isFinite(Number(r.save_dc_override)) ? Number(r.save_dc_override) : null,
      damage_dice: r.damage_dice ?? null,
      attack_bonus_override: Number.isFinite(Number(r.attack_bonus_override)) ? Number(r.attack_bonus_override) : null,
      damage_bonus: Number.isFinite(Number(r.damage_bonus)) ? Number(r.damage_bonus) : null,
      damage_type: r.damage_type ?? null,
      on_fail: r.on_fail ?? null,
      on_success: r.on_success ?? null,
    })) as PlayerActionRow[];
  }
  let learnedTraits: Array<{ id: string; name: string; summary: string | null; type: string | null }> = [];
  if (learnedTraitIds.length) {
    const { data: traitRows, error: learnedTraitsErr } = await supabase
      .from("traits")
      .select("id,name,summary,type")
      .in("id", learnedTraitIds)
      .order("name", { ascending: true });
    if (learnedTraitsErr) throw new Error(`Failed to load trait details: ${learnedTraitsErr.message}`);
    learnedTraits = (traitRows ?? []) as any[];
  }
  let traitEffects: TraitEffectRow[] = [];
  if (learnedTraitIds.length) {
    const { data: traitEffectRows, error: traitEffectsErr } = await supabase
      .from("trait_effects")
      .select("effect_type,effect_key,mode,value,notes,sort_order,created_at")
      .in("trait_id", learnedTraitIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (traitEffectsErr && !String(traitEffectsErr.message ?? "").toLowerCase().includes("does not exist")) {
      throw new Error(`Failed to load trait effects: ${traitEffectsErr.message}`);
    }
    traitEffects = (traitEffectRows ?? []) as TraitEffectRow[];
  }
  let questProgressById: Record<
    string,
    { status: "available" | "active" | "completed" | "claimed"; completedTaskIds: string[]; claimedAt?: string | null }
  > = {};
  let questEntries: Array<{
    questId: string;
    title: string;
    status: "available" | "active" | "completed" | "claimed";
    completedTaskIds: string[];
    claimedAt?: string | null;
    tasks?: Array<QuestTaskView>;
    rewards?: { faith?: number; itemIds?: string[] };
    storytellerControlled?: boolean;
  }> = [];
  const { data: questProgressRows, error: questProgressErr } = await supabase
    .from("player_quest_progress")
    .select("quest_id,quest_title,status,completed_task_ids,claimed_at,reward_meta,created_at")
    .eq("character_id", character.id);
  if (questProgressErr) {
    // Never block /player render for optional quest-progress data.
    console.error("Quest progress load skipped:", questProgressErr.message);
  } else {
    const talkTargetIds = Array.from(
      new Set(
        (questProgressRows ?? [])
          .flatMap((row: any) =>
            Array.isArray(row?.reward_meta?.task_defs) ? row.reward_meta.task_defs : []
          )
          .map((t: any) => String(t?.target_npc_block_id ?? "").trim())
          .filter((v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
      )
    );
    let npcNameById = new Map<string, string>();
    if (talkTargetIds.length) {
      const { data: npcRows, error: npcErr } = await supabase
        .from("npcs")
        .select("id,name")
        .in("id", talkTargetIds);
      if (!npcErr) {
        npcNameById = new Map<string, string>(
          (npcRows ?? [])
            .map((n: any) => [String(n?.id ?? "").trim().toLowerCase(), String(n?.name ?? "").trim()] as const)
            .filter(([id, name]) => Boolean(id && name))
        );
      }
      // Resolve cases where task target uses episode_block_id.
      const { data: bindingRows, error: bindErr } = await supabase
        .from("episode_npc_bindings")
        .select("episode_block_id,npc_id")
        .in("episode_block_id", talkTargetIds);
      if (!bindErr && (bindingRows ?? []).length) {
        const blockToNpc = new Map<string, string>(
          (bindingRows ?? [])
            .map((b: any) => [String(b?.episode_block_id ?? "").trim().toLowerCase(), String(b?.npc_id ?? "").trim()] as const)
            .filter(([blockId, npcId]) => Boolean(blockId && npcId))
        );
        const unresolvedNpcIds = Array.from(
          new Set(
            talkTargetIds
              .map((id) => {
                const lower = id.toLowerCase();
                if (npcNameById.has(lower)) return null;
                return blockToNpc.get(lower) ?? null;
              })
              .filter((v): v is string => Boolean(v))
          )
        );
        if (unresolvedNpcIds.length) {
          const { data: linkedNpcRows, error: linkedNpcErr } = await supabase
            .from("npcs")
            .select("id,name")
            .in("id", unresolvedNpcIds);
          if (!linkedNpcErr) {
            const linkedNameByNpcId = new Map<string, string>(
              (linkedNpcRows ?? [])
                .map((n: any) => [String(n?.id ?? "").trim().toLowerCase(), String(n?.name ?? "").trim()] as const)
                .filter(([id, name]) => Boolean(id && name))
            );
            for (const rawTargetId of talkTargetIds) {
              const targetId = rawTargetId.toLowerCase();
              if (npcNameById.has(targetId)) continue;
              const npcId = blockToNpc.get(targetId);
              if (!npcId) continue;
              const linkedName = linkedNameByNpcId.get(npcId.toLowerCase());
              if (linkedName) npcNameById.set(targetId, linkedName);
            }
          }
        }
      }
    }
    for (const row of (questProgressRows ?? []) as QuestProgressRow[]) {
      const questId = String(row.quest_id ?? "").trim();
      if (!questId) continue;
      const statusRaw = String(row.status ?? "available").trim().toLowerCase();
      const status =
        statusRaw === "active" || statusRaw === "completed" || statusRaw === "claimed"
          ? (statusRaw as "active" | "completed" | "claimed")
          : ("available" as const);
      questProgressById[questId] = {
        status,
        completedTaskIds: Array.isArray(row.completed_task_ids)
          ? row.completed_task_ids.map((v) => String(v ?? "").trim()).filter(Boolean)
          : [],
        claimedAt: row.claimed_at ?? null,
      };
      questEntries.push({
        questId,
        title: String(row.quest_title ?? "").trim() || questId,
        status,
        completedTaskIds: Array.isArray(row.completed_task_ids)
          ? row.completed_task_ids.map((v) => String(v ?? "").trim()).filter(Boolean)
          : [],
        claimedAt: row.claimed_at ?? null,
        tasks: Array.isArray((row as any)?.reward_meta?.task_defs)
          ? (row as any).reward_meta.task_defs
              .map((t: any) => {
                const id = String(t?.id ?? "").trim();
                const kind = String(t?.kind ?? "").trim().toLowerCase() || "task";
                const targetNpcId = String(t?.target_npc_block_id ?? "").trim();
                const explicitName = String(t?.target_npc_name ?? "").trim();
                const lookupName = targetNpcId ? npcNameById.get(targetNpcId.toLowerCase()) ?? "" : "";
                const npcName = explicitName || lookupName;
                const fallbackTitle =
                  kind === "talk_to_npc" && targetNpcId
                    ? npcName
                      ? `Talk to ${npcName}`
                      : `Talk to NPC (${targetNpcId.slice(0, 8)}...)`
                    : id;
                const resolvedTitle =
                  kind === "talk_to_npc" && npcName
                    ? `Talk to ${npcName}`
                    : String(t?.title ?? "").trim() || fallbackTitle;
                return {
                  id,
                  title: resolvedTitle,
                  kind,
                  target_npc_block_id: targetNpcId || null,
                  target_npc_name: npcName || null,
                };
              })
              .filter((t: any) => t.id.length > 0)
          : Array.isArray((row as any)?.reward_meta?.task_ids)
            ? (row as any).reward_meta.task_ids
                .map((id: any) => ({
                  id: String(id ?? "").trim(),
                  title: String(id ?? "").trim(),
                  kind: "task",
                }))
                .filter((t: any) => t.id.length > 0)
            : [],
        rewards: {
          faith: Math.max(0, Number((row as any)?.reward_meta?.faith ?? 0) || 0),
          itemIds: Array.isArray((row as any)?.reward_meta?.item_ids)
            ? (row as any).reward_meta.item_ids.map((v: any) => String(v ?? "").trim()).filter(Boolean)
            : [],
        },
        storytellerControlled: toBool((row as any)?.reward_meta?.storyteller_controlled, false),
      });
    }
  }

  const baseStatBlock = curRow?.stat_block_current ?? character.stat_block ?? {};
  const itemNameById: Record<string, string> = {};
  for (const row of inventory ?? []) {
    const id = String((row as any)?.item_id ?? "").trim();
    const name = String((row as any)?.name ?? "").trim();
    if (id && name && !itemNameById[id]) itemNameById[id] = name;
  }
  const mergedStatBlock = applyEffects(
    baseStatBlock,
    [...itemEffects, ...traitEffects, ...passiveItemEffects],
    itemNameById,
    new Set(equippedItemIds)
  );

  character = { ...character, stat_block: mergedStatBlock };

  return (
    <PlayerHubClient
      userId={user.id}
      userEmail={user.email ?? ""}
      accessLabel={accessLabel}
      character={character}
      inventory={inventory ?? []}
      sessions={sessions ?? []}
      sessionStates={sessionStates ?? {}}
      presentedBlocks={presentedBlocks ?? {}}
      gameLog={gameLog ?? []}
      playerTraitIds={learnedTraitIds}
      playerTraits={learnedTraits}
      playerActionIds={learnedActionIds}
      playerActions={learnedActions}
      questProgress={questProgressById}
      questEntries={questEntries}
    />
  );
}
