'use server';

import { supabaseServer } from "@/lib/supabase/server";


export async function getDmSession(sessionId: string) {
  const supabase = await supabaseServer();

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id,name,join_code,story_text,storyteller_id')
    .eq('id', sessionId)
    .single();

  if (sErr) throw new Error(sErr.message);

  const { data: state, error: stErr } = await supabase
    .from('session_state')
    .select('*')
    .eq('session_id', sessionId)
    .single();

  if (stErr) throw new Error(stErr.message);

  const { data: joins } = await supabase
    .from('session_players')
    .select('player_id, joined_at')
    .eq('session_id', sessionId)
    .order('joined_at', { ascending: true });

  return { session, state, joins: joins ?? [] };
}

export async function updateStoryText(sessionId: string, formData: FormData) {
  const supabase = await supabaseServer();
  const story_text = String(formData.get('story_text') || '');

  const { error } = await supabase
    .from('sessions')
    .update({ story_text })
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

export async function updateState(sessionId: string, patch: any) {
  const supabase = await supabaseServer();

  // always bump updated_at so timer math works
  const { error } = await supabase
    .from('session_state')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('session_id', sessionId);

  if (error) throw new Error(error.message);
}
