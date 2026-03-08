"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { randomUUID } from "crypto";

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

function cleanIds(input: string[] | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(input) ? input : [])
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
    )
  );
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
