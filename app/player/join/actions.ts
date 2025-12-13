"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function joinSession(formData: FormData) {
  const supabase = await supabaseServer();

  const join_code = String(formData.get("join_code") || "")
    .trim()
    .toUpperCase();

  if (!join_code) {
    throw new Error("Missing join code");
  }

  const { data: sessionId, error } = await supabase.rpc("join_session", {
    p_join_code: join_code,
  });

  // ✅ hard guard — prevents /undefined redirects
  if (error || !sessionId || sessionId === "undefined") {
    console.error("join_session failed", { join_code, sessionId, error });
    throw new Error("Invalid join code");
  }

  redirect(`/player/sessions/${sessionId}`);
}
