"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function loadEpisodeToSessionAction(sessionId: string, episodeId: string) {
  const supabase = await createClient();

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) throw new Error("Not authenticated");

  const { error } = await supabase.rpc("load_episode_to_session", {
    p_session_id: sessionId,
    p_episode_id: episodeId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/storyteller/sessions/${sessionId}`);
  revalidatePath(`/storyteller/sessions`);
}
