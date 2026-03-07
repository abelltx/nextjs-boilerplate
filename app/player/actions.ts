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
  taskDefs?: Array<{
    id: string;
    title?: string;
    kind?: string;
    target_npc_block_id?: string | null;
    target_npc_name?: string | null;
  }>;
  storytellerControlled?: boolean;
  rewardFaith?: number;
  rewardItemIds?: string[];
}): Promise<{ ok: boolean; status?: string; error?: string }> {
  "use server";
  const playerQuestControlLocked = true;
  if (playerQuestControlLocked) return { ok: false, error: "Storyteller assigns quests." };
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
    ? input.taskDefs
        .map((t: any) => ({
          id: String(t?.id ?? "").trim(),
          title: String(t?.title ?? "").trim(),
          kind: String(t?.kind ?? "").trim().toLowerCase() || "task",
          target_npc_block_id: String(t?.target_npc_block_id ?? "").trim() || null,
          target_npc_name: String(t?.target_npc_name ?? "").trim() || null,
        }))
        .filter((t) => t.id.length > 0)
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
  const playerQuestControlLocked = true;
  if (playerQuestControlLocked) return { ok: false, error: "Storyteller controls quest progress." };
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
  const storytellerControlled = Boolean((row as any)?.reward_meta?.storyteller_controlled);
  if (storytellerControlled) {
    return { ok: false, error: "Storyteller controls this quest's progress." };
  }
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
  const playerQuestControlLocked = true;
  if (playerQuestControlLocked) return { ok: false, error: "Storyteller assigns quest rewards." };
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
        task_ids: allTaskIds.length ? allTaskIds : rewardMeta?.task_ids ?? [],
      },
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
      ? (cfg.replace_stat_block as Record<string, any>)
      : null;
  const grantItemIds = Array.from(
    new Set(
      (Array.isArray(cfg?.grant_item_ids) ? cfg.grant_item_ids : [])
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  );
  const grantTraitIds = Array.from(
    new Set(
      (Array.isArray(cfg?.grant_trait_ids) ? cfg.grant_trait_ids : [])
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  );
  const grantActionIds = Array.from(
    new Set(
      (Array.isArray(cfg?.grant_action_ids) ? cfg.grant_action_ids : [])
        .map((v: any) => String(v ?? "").trim())
        .filter((v: string) => isUuid(v))
    )
  );
  const consumeOnUse = Boolean(cfg?.consume_on_use);
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
  if (rpcErr) {
    const msg = String(rpcErr?.message ?? "");
    if (msg.toLowerCase().includes("function public.apply_class_package_from_inventory")) {
      return {
        ok: false,
        error: "Class-package RPC is missing. Run scripts/class-package-rpc.sql in Supabase SQL editor.",
      };
    }
    return { ok: false, error: msg || "Failed to apply class package." };
  }

  const rpcObj = (rpcData && typeof rpcData === "object" && !Array.isArray(rpcData) ? rpcData : {}) as any;
  const alreadyApplied = Boolean(rpcObj?.already_applied);
  const resultMessage = String(rpcObj?.message ?? "").trim() || (alreadyApplied ? "Class package already applied." : "Class package applied.");

  await appendGameLogSafe(supabase, {
    userId: user.id,
    characterId,
    eventType: "class_package_applied",
    title: `Class package applied: ${className || String(itemRow?.name ?? "Class Item")}`,
    summary: `Used item: ${String(itemRow?.name ?? itemId)}`,
    itemId,
  });

  revalidatePath("/player");
  return { ok: true, message: resultMessage };
}
