"use server";

import { supabaseServer } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth/getProfile";
import { revalidatePath } from "next/cache";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function joinSessionAction(
  joinCodeOrId: string
): Promise<{ ok: boolean; sessionId?: string; sessionName?: string; error?: string }> {
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();
  const token = joinCodeOrId.trim();

  // 1) Resolve session by join_code (preferred)
  // Assumes sessions.join_code exists. If it doesn't, this query will fail; we catch and fallback.
  let sessionId: string | null = null;
  let sessionName: string | null = null;

  const tryJoinCode = async () => {
    const { data, error } = await supabase
      .from("sessions")
      .select("id,name")
      .eq("join_code", token)
      .maybeSingle();

    if (error) return null;
    if (!data?.id) return null;
    sessionName = (data as any)?.name ?? null;
    return data.id;
  };

  const tryId = async () => {
    if (!isUuid(token)) return null;
    const { data, error } = await supabase
      .from("sessions")
      .select("id,name")
      .eq("id", token)
      .maybeSingle();

    if (error) return null;
    if (!data?.id) return null;
    sessionName = (data as any)?.name ?? null;
    return data.id;
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
      return { ok: true, sessionId, sessionName: sessionName ?? undefined };
    }
    return { ok: false, error: `Failed to join: ${insErr.message}` };
  }

  return { ok: true, sessionId, sessionName: sessionName ?? undefined };
}

export async function leaveSessionAction(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("session_players")
    .delete()
    .eq("session_id", sessionId)
    .eq("player_id", user.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function submitRollResultAction(input: {
  sessionId: string;
  rollValue: number;
  source: "manual" | "digital";
}): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const supabase = await supabaseServer();

  const { data: st, error: stErr } = await supabase
    .from("session_state")
    .select("roll_open,roll_target,roll_round_id,roll_results")
    .eq("session_id", input.sessionId)
    .single();

  if (stErr) return { ok: false, error: stErr.message };
  if (!st || !(st as any).roll_open) return { ok: false, error: "No open roll request." };

  const target = String((st as any).roll_target ?? "all");
  if (target !== "all" && target !== user.id) {
    return { ok: false, error: "This roll request targets a different player." };
  }

  const roundId = String((st as any).roll_round_id ?? "");

  const current = ((st as any)?.roll_results ?? {}) as Record<string, any>;
  if (current[user.id]?.round_id && current[user.id].round_id === roundId) {
    return { ok: false, error: "You already submitted a roll for this request." };
  }

  const next = {
    ...current,
    [user.id]: {
      value: input.rollValue,
      source: input.source,
      round_id: roundId,
      submitted_at: new Date().toISOString(),
    },
  };

  const { error: upErr } = await supabase
    .from("session_state")
    .update({ roll_results: next })
    .eq("session_id", input.sessionId);

  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}

export async function claimNpcGearItemAction(input: {
  characterId: string;
  itemId: string;
}): Promise<{ ok: boolean; alreadyOwned?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const itemId = String(input.itemId ?? "").trim();
  if (!characterId || !itemId) return { ok: false, error: "Missing item or character." };

  const supabase = await supabaseServer();

  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!ch?.id || ch.user_id !== user.id) return { ok: false, error: "Character not found." };

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("id,name,faith_required,is_active")
    .eq("id", itemId)
    .maybeSingle();
  if (itemErr) return { ok: false, error: itemErr.message };
  if (!item?.id || item.is_active === false) return { ok: false, error: "Item not available." };

  let faithAvailable = 0;
  const { data: cur } = await supabase
    .from("character_stats_current")
    .select("stat_block_current")
    .eq("character_id", characterId)
    .maybeSingle();
  const curFaith = Number((cur as any)?.stat_block_current?.resources?.faith_available ?? NaN);
  if (Number.isFinite(curFaith)) faithAvailable = curFaith;
  if (!Number.isFinite(curFaith)) {
    const fallbackFaith = Number((ch as any)?.stat_block?.resources?.faith_available ?? NaN);
    if (Number.isFinite(fallbackFaith)) faithAvailable = fallbackFaith;
  }
  const requiredFaith = Math.max(0, Number(item.faith_required ?? 0));
  if (faithAvailable < requiredFaith) {
    return { ok: false, error: `Requires ${requiredFaith} faith.` };
  }

  const { data: existing, error: exErr } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("character_id", characterId)
    .eq("item_id", itemId)
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, alreadyOwned: true };

  const { error: insErr } = await supabase.from("inventory_items").insert({
    character_id: characterId,
    item_id: itemId,
    name: item.name,
    quantity: 1,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/player");
  return { ok: true };
}

export async function claimNpcTrainingTraitAction(input: {
  characterId: string;
  traitId: string;
}): Promise<{ ok: boolean; alreadyOwned?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const traitId = String(input.traitId ?? "").trim();
  if (!characterId || !traitId) return { ok: false, error: "Missing trait or character." };

  const supabase = await supabaseServer();

  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!ch?.id || ch.user_id !== user.id) return { ok: false, error: "Character not found." };

  const { data: trait, error: traitErr } = await supabase
    .from("traits")
    .select("id,name,type,is_active")
    .eq("id", traitId)
    .maybeSingle();
  if (traitErr) return { ok: false, error: traitErr.message };
  if (!trait?.id || trait.is_active === false) return { ok: false, error: "Trait not available." };

  const { data: existing, error: exErr } = await supabase
    .from("player_trait_links")
    .select("id")
    .eq("character_id", characterId)
    .eq("trait_id", traitId)
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, alreadyOwned: true };

  const { error: insErr } = await supabase.from("player_trait_links").insert({
    player_id: user.id,
    character_id: characterId,
    trait_id: traitId,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/player");
  return { ok: true };
}

export async function claimNpcActionAction(input: {
  characterId: string;
  actionId: string;
}): Promise<{ ok: boolean; alreadyOwned?: boolean; error?: string }> {
  "use server";
  const { user } = await getProfile();
  if (!user) return { ok: false, error: "Not signed in." };

  const characterId = String(input.characterId ?? "").trim();
  const actionId = String(input.actionId ?? "").trim();
  if (!characterId || !actionId) return { ok: false, error: "Missing action or character." };

  const supabase = await supabaseServer();

  const { data: ch, error: chErr } = await supabase
    .from("characters")
    .select("id,user_id")
    .eq("id", characterId)
    .maybeSingle();
  if (chErr) return { ok: false, error: chErr.message };
  if (!ch?.id || ch.user_id !== user.id) return { ok: false, error: "Character not found." };

  const { data: action, error: actionErr } = await supabase
    .from("actions")
    .select("id,is_active")
    .eq("id", actionId)
    .maybeSingle();
  if (actionErr) return { ok: false, error: actionErr.message };
  if (!action?.id || action.is_active === false) return { ok: false, error: "Action not available." };

  const { data: existing, error: exErr } = await supabase
    .from("player_action_links")
    .select("id")
    .eq("character_id", characterId)
    .eq("action_id", actionId)
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };
  if (existing?.id) return { ok: true, alreadyOwned: true };

  const { error: insErr } = await supabase.from("player_action_links").insert({
    player_id: user.id,
    character_id: characterId,
    action_id: actionId,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/player");
  return { ok: true };
}
