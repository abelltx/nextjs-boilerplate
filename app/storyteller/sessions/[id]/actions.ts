"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

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
