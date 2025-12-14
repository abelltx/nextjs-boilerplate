"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

export async function presentBlockToPlayersAction(sessionId: string, blockId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("present_episode_block", {
    p_session_id: sessionId,
    p_block_id: blockId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/storyteller/sessions/${sessionId}`);
}

export async function clearPresentedAction(sessionId: string) {
  const supabase = await createClient();

  const { error } = await supabase.rpc("clear_presented", {
    p_session_id: sessionId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/storyteller/sessions/${sessionId}`);
}
