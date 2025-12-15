"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";

function requireUuid(id: string, label: string) {
  const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (!ok) throw new Error(`Invalid ${label}`);
}

export async function presentBlockToPlayersAction(sessionId: string, blockId: string) {
  requireUuid(sessionId, "sessionId");
  requireUuid(blockId, "blockId");

  const supabase = await createClient();

  const { error } = await supabase.rpc("present_episode_block", {
    p_session_id: sessionId,
    p_block_id: blockId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/storyteller/sessions/${sessionId}`);
  revalidatePath(`/player/sessions/${sessionId}`);
}

export async function clearPresentedAction(sessionId: string) {
  requireUuid(sessionId, "sessionId");

  const supabase = await createClient();

  const { error } = await supabase.rpc("clear_presented", {
    p_session_id: sessionId,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/storyteller/sessions/${sessionId}`);
  revalidatePath(`/player/sessions/${sessionId}`);
}
