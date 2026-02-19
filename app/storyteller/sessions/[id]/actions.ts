"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

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
    const { error } = await admin.from("player_quest_progress").upsert(
      {
        player_id: t.playerId,
        character_id: t.characterId,
        quest_id: questId,
        quest_title: String(input.questTitle ?? "").trim() || questId,
        status: "active",
        reward_meta: {
          faith: rewardFaith,
          item_ids: rewardItemIds,
          task_ids: taskIds,
          task_defs: taskDefs,
          storyteller_controlled: true,
        },
      },
      { onConflict: "character_id,quest_id" }
    );
    if (error) throw new Error(error.message);
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
    const { data: row, error: rowErr } = await admin
      .from("player_quest_progress")
      .select("id,status,completed_task_ids")
      .eq("character_id", t.characterId)
      .eq("quest_id", questId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    const currentDone = Array.isArray((row as any)?.completed_task_ids) ? (row as any).completed_task_ids : [];
    const nextDone = Array.from(new Set([...currentDone.map((v: any) => String(v)), taskId]));
    const isCompleted = allTaskIds.length > 0 && allTaskIds.every((id) => nextDone.includes(id));
    const nextStatus = (row as any)?.status === "claimed" ? "claimed" : isCompleted ? "completed" : "active";

    if (!(row as any)?.id) {
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
          completed_at: nextStatus === "completed" ? new Date().toISOString() : (row as any)?.completed_at ?? null,
          last_task_at: new Date().toISOString(),
        })
        .eq("id", (row as any).id);
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
    const { data: row, error: rowErr } = await admin
      .from("player_quest_progress")
      .select("id,status")
      .eq("character_id", t.characterId)
      .eq("quest_id", questId)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);

    if (!(row as any)?.id) {
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
    } else if ((row as any)?.status !== "claimed") {
      const { error: upErr } = await admin
        .from("player_quest_progress")
        .update({
          status: "completed",
          completed_task_ids: allTaskIds,
          completed_at: new Date().toISOString(),
          last_task_at: new Date().toISOString(),
        })
        .eq("id", (row as any).id);
      if (upErr) throw new Error(upErr.message);
    }
  }
}
