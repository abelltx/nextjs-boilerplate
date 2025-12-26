"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function dieSides(die: string): number | null {
  const m = String(die || "").toLowerCase().match(/^d(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 1 ? n : null;
}

export async function submitPlayerRollAction(sessionId: string, playerId: string, fd: FormData) {
  const val = Number(fd.get("roll_value"));
  if (!Number.isFinite(val)) return;

  const supabase = await supabaseServer();

  const { data: st, error: e1 } = await supabase
    .from("session_state")
    .select("roll_open,roll_round_id,roll_results")
    .eq("session_id", sessionId)
    .single();

  if (e1) throw new Error(e1.message);
  if (!st?.roll_open) return;

  const roundId = String((st as any).roll_round_id ?? "");
  const prev = ((st as any)?.roll_results ?? {}) as Record<string, any>;

  // ✅ one submission per round
  if (prev[playerId]?.round_id && prev[playerId].round_id === roundId) {
    redirect(`/player/sessions/${sessionId}`);
  }

  const next = {
    ...prev,
    [playerId]: {
      value: val,
      source: "player",
      round_id: roundId,
      submitted_at: new Date().toISOString(),
    },
  };

  const { error: e2 } = await supabase
    .from("session_state")
    .update({ roll_results: next })
    .eq("session_id", sessionId);

  if (e2) throw new Error(e2.message);

  redirect(`/player/sessions/${sessionId}`);
}

export async function submitDigitalRollAction(sessionId: string, playerId: string) {
  const supabase = await supabaseServer();

  const { data: st, error: e1 } = await supabase
    .from("session_state")
    .select("roll_open,roll_die,roll_round_id,roll_results")
    .eq("session_id", sessionId)
    .single();

  if (e1) throw new Error(e1.message);
  if (!st?.roll_open) return;

  const die = String((st as any).roll_die ?? "");
  const sides = dieSides(die);
  if (!sides) return;

  const roundId = String((st as any).roll_round_id ?? "");
  const prev = ((st as any)?.roll_results ?? {}) as Record<string, any>;

  // ✅ one roll per round (server enforced)
  if (prev[playerId]?.round_id && prev[playerId].round_id === roundId) {
    redirect(`/player/sessions/${sessionId}`);
  }

  const value = Math.floor(Math.random() * sides) + 1;

  const next = {
    ...prev,
    [playerId]: {
      value,
      source: "digital",
      round_id: roundId,
      submitted_at: new Date().toISOString(),
    },
  };

  const { error: e2 } = await supabase
    .from("session_state")
    .update({ roll_results: next })
    .eq("session_id", sessionId);

  if (e2) throw new Error(e2.message);

  redirect(`/player/sessions/${sessionId}`);
}
