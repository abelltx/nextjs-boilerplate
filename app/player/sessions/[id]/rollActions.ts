"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function submitPlayerRollAction(sessionId: string, playerId: string, fd: FormData) {
  const val = Number(fd.get("roll_value"));
  if (!Number.isFinite(val)) return;

  const supabase = await supabaseServer();

  const { data: st, error: e1 } = await supabase
    .from("session_state")
    .select("roll_results")
    .eq("session_id", sessionId)
    .single();

  if (e1) throw new Error(e1.message);

  const prev = ((st as any)?.roll_results ?? {}) as Record<string, any>;
  const next = {
    ...prev,
    [playerId]: {
      value: val,
      source: "player",
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
