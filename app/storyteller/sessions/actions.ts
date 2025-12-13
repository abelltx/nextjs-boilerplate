'use server';

import { supabaseServer } from "@/lib/supabase/server";

import { redirect } from 'next/navigation';

function makeCode(len = 6) {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function createSession(formData: FormData) {
  const supabase = await supabaseServer();
  const name = String(formData.get('name') || '').trim();
  if (!name) throw new Error('Missing session name');

  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes.user;
  if (!user) throw new Error('Not authenticated');

  // Retry join_code collisions
  for (let attempt = 0; attempt < 5; attempt++) {
    const join_code = makeCode(6);

    const { data, error } = await supabase
      .from('sessions')
      .insert({ name, join_code, storyteller_id: user.id })
      .select('id')
      .single();

    if (!error && data?.id) redirect(`/storyteller/sessions/${data.id}`);

    const msg = (error?.message || '').toLowerCase();
    if (!msg.includes('duplicate')) throw new Error(error?.message || 'Create failed');
  }

  throw new Error('Could not generate unique join code');
}

export async function getMySessions() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('sessions')
    .select('id,name,join_code,created_at')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
