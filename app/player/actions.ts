"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function joinSessionAction(joinCodeOrId: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();
  const token = joinCodeOrId.trim();

  // 1) Resolve session by join_code (preferred)
  // Assumes sessions.join_code exists. If it doesn’t, this query will fail; we catch and fallback.
  let sessionId: string | null = null;

  const tryJoinCode = async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("join_code", token)
      .maybeSingle();

    if (error) return null;
    return data?.id ?? null;
  };

  const tryId = async () => {
    if (!isUuid(token)) return null;
    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("id", token)
      .maybeSingle();

    if (error) return null;
    return data?.id ?? null;
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
      return { ok: true, sessionId };
    }
    return { ok: false, error: `Failed to join: ${insErr.message}` };
  }

  return { ok: true, sessionId };
}
