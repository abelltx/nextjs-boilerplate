"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { revalidatePath } from "next/cache";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function hasMissingTableError(err: any, table: string) {
  const msg = String(err?.message ?? "").toLowerCase();
  return msg.includes(`relation "${table}" does not exist`) || msg.includes(`relation "public.${table}" does not exist`);
}

async function requireOwnedCharacter(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  userId: string,
  characterId: string
) {
  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id,stat_block")
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
  rollValue: number;
  source: "manual" | "digital";
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
  if (current[user.id]?.round_id && current[user.id].round_id === roundId) {
    return { ok: false, error: "You already submitted a roll for this request." };
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
    .update({ roll_results: next })
    .eq("session_id", input.sessionId);

  if (upErr) return { ok: false, error: upErr.message };
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
  const rewardItemIds = Array.from(
    new Set(
      (Array.isArray(input.rewardItemIds) ? input.rewardItemIds : [])
        .map((v) => String(v ?? "").trim())
        .filter((v) => isUuid(v))
    )
  ).slice(0, 25);
  const rewardFaith = Math.max(0, Math.min(100, Math.floor(Number(input.rewardFaith ?? 0) || 0)));

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

  const { error: insErr } = await supabase.from("player_quest_progress").insert({
    player_id: user.id,
    character_id: characterId,
    quest_id: questId,
    quest_title: questTitle || null,
    status: "active",
    completed_task_ids: [],
    reward_meta: {
      faith: rewardFaith,
      item_ids: rewardItemIds,
      task_ids: taskIds,
    },
  });
  if (insErr) {
    if (hasMissingTableError(insErr, "player_quest_progress")) {
      return { ok: false, error: "Quest table missing. Run scripts/player-quest-progress.sql in Supabase SQL editor." };
    }
    return { ok: false, error: insErr.message };
  }

  revalidatePath("/player");
  return { ok: true, status: "active" };
}

export async function completeNpcQuestTaskAction(input: {
  characterId: string;
  questId: string;
  questTitle?: string;
  taskId: string;
  allTaskIds?: string[];
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
  const nextDone = Array.from(new Set([...currentDone.map((v: any) => String(v)), taskId]));
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

  const doneSet = new Set(
    (Array.isArray((row as any)?.completed_task_ids) ? (row as any).completed_task_ids : []).map((v: any) =>
      String(v).trim()
    )
  );
  const canComplete = allTaskIds.length > 0 ? allTaskIds.every((id) => doneSet.has(id)) : true;
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

  let grantedItems = 0;
  if (rewardItemIds.length) {
    const { data: itemRows, error: itemErr } = await supabase
      .from("items")
      .select("id,name,is_active")
      .in("id", rewardItemIds);
    if (itemErr) return { ok: false, error: itemErr.message };
    const validItems = (itemRows ?? []).filter((row: any) => row?.id && row.is_active !== false);
    for (const it of validItems as any[]) {
      const itemId = String(it.id);
      const { data: existing, error: exErr } = await supabase
        .from("inventory_items")
        .select("id")
        .eq("character_id", characterId)
        .eq("item_id", itemId)
        .limit(1)
        .maybeSingle();
      if (exErr) return { ok: false, error: exErr.message };
      if (existing?.id) continue;
      const { error: insErr } = await supabase.from("inventory_items").insert({
        character_id: characterId,
        item_id: itemId,
        name: String((it as any).name ?? "Quest Reward"),
        quantity: 1,
      });
      if (insErr) return { ok: false, error: insErr.message };
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
        task_ids: allTaskIds.length ? allTaskIds : rewardMeta?.task_ids ?? [],
      },
    })
    .eq("id", (row as any).id);
  if (claimErr) return { ok: false, error: claimErr.message };

  revalidatePath("/player");
  return { ok: true, grantedItems, faithAwarded: rewardFaith };
}
