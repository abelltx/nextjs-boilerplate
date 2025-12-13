"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function joinSession(formData: FormData) {
  const supabase = await supabaseServer();

  const join_code = String(formData.get("join_code") || "").trim().toUpperCase();
  if (!join_code) throw new Error("Missing join code");

  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id")
    .eq("join_code", join_code)
    .single();

  if (sErr || !session) throw new Error("Invalid join code");

  const { data: userRes, error: uErr } = await supabase.auth.getUser();
  if (uErr || !userRes.user) throw new Error("Not authenticated");

  const { error: jErr } = await supabase
    .from("session_players")
    .upsert(
      { session_id: session.id, player_id: userRes.user.id },
      { onConflict: "session_id,player_id" }
    );

  if (jErr) throw new Error(jErr.message);

  redirect(`/player/sessions/${session.id}`);
}
