import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import PlayerHubClient from "./_components/PlayerHubClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

type ItemEffectRow = {
  effect_type: string | null;
  effect_key: string | null;
  mode: string | null;
  value: number | null;
  notes: string | null;
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

function applyItemEffects(baseStat: any, effects: ItemEffectRow[]) {
  const stat = { ...(baseStat ?? {}) } as any;
  const abilities = { ...(stat.abilities ?? {}) } as Record<string, number>;
  const baseAbilities = { ...abilities } as Record<string, number>;
  const saves = { ...(stat.saves ?? {}) } as Record<string, number>;
  const skills = { ...(stat.skills ?? {}) } as Record<string, number>;
  const derived = { ...(stat.derived ?? {}) } as Record<string, number>;
  const statusEffects = Array.isArray(stat.effects) ? [...stat.effects] : [];

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
      statusEffects.push({
        name: `${type}: ${key}`,
        kind: "buff",
      });
      continue;
    }

    if (type === "special") {
      statusEffects.push({
        name: e.notes?.trim() || "special item effect",
        kind: "buff",
      });
    }
  }

  stat.abilities = abilities;
  stat.saves = saves;
  stat.skills = skills;
  stat.derived = derived;
  stat.effects = statusEffects;
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
    .select("id,name,quantity,created_at")
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

  let itemEffects: ItemEffectRow[] = [];
  if (equippedItemIds.length) {
    const { data: effectsRows, error: effectsErr } = await supabase
      .from("item_effects")
      .select("effect_type,effect_key,mode,value,notes,sort_order,created_at")
      .in("item_id", equippedItemIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (effectsErr) throw new Error(`Failed to load item effects: ${effectsErr.message}`);
    itemEffects = (effectsRows ?? []) as ItemEffectRow[];
  }

  const baseStatBlock = curRow?.stat_block_current ?? character.stat_block ?? {};
  const mergedStatBlock = applyItemEffects(baseStatBlock, itemEffects);

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
    />
  );
}
