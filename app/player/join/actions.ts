"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function joinSessionAction(
  joinCodeOrId: string
): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();
  const token = joinCodeOrId.trim();

  let sessionId: string | null = null;

  const tryJoinCode = async () => {
    const { data, error } = await supabase.from("sessions").select("id").eq("join_code", token).maybeSingle();
    if (error) return null;
    return data?.id ?? null;
  };

  const tryId = async () => {
    if (!isUuid(token)) return null;
    const { data, error } = await supabase.from("sessions").select("id").eq("id", token).maybeSingle();
    if (error) return null;
    return data?.id ?? null;
  };

  sessionId = (await tryJoinCode()) ?? (await tryId());

  if (!sessionId) {
    return { ok: false, error: "Session not found. Check your join code." };
  }

  const { error: insErr } = await supabase
    .from("session_players")
    .insert({ session_id: sessionId, player_id: user.id });

  if (insErr) {
    const msg = insErr.message?.toLowerCase() ?? "";
    if (msg.includes("duplicate") || msg.includes("unique")) return { ok: true, sessionId };
    return { ok: false, error: `Failed to join: ${insErr.message}` };
  }

  return { ok: true, sessionId };
}

export async function leaveSessionAction(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!isUuid(sessionId)) return { ok: false, error: "Invalid session id." };

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
  playerId: string; // who this roll is for
  rollValue: number;
  source: "manual" | "digital";
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };
  if (!isUuid(input.sessionId) || !isUuid(input.playerId)) return { ok: false, error: "Bad ids." };
  if (!Number.isFinite(input.rollValue)) return { ok: false, error: "Invalid roll value." };

  const supabase = await supabaseServer();

  // Ensure the current user is joined (RLS should also enforce)
  const { data: joinRow } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", input.sessionId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (!joinRow?.player_id) return { ok: false, error: "Not joined to this session." };

  // Read current roll_results then merge (simple + safe for MVP)
  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("roll_results")
    .eq("session_id", input.sessionId)
    .single();

  if (stErr) return { ok: false, error: stErr.message };

  const current = ((st as any)?.roll_results ?? {}) as Record<string, any>;
  const next = {
    ...current,
    [input.playerId]: {
      roll_value: input.rollValue,
      source: input.source,
      updated_at: new Date().toISOString(),
      entered_by: user.id,
    },
  };

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ roll_results: next })
    .eq("session_id", input.sessionId);

  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
