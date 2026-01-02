import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import PlayerHubClient from "./_components/PlayerHubClient";


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlayerPage() {
  const { user, profile } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();

  const accessLabel = profile
    ? `${profile.is_admin ? "admin " : ""}${profile.is_storyteller ? "storyteller " : ""}player`.trim()
    : "player";

  // ---- Character (MVP: first character) ----
  const { data: chars, error: charReadErr } = await supabase
    .from("characters")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1);

  if (charReadErr) throw new Error(`Failed to load character: ${charReadErr.message}`);

  let character = chars?.[0] ?? null;

  if (!character) {
    const { data: created, error: charCreateErr } = await supabase
      .from("characters")
      .insert({ user_id: user.id, name: "Neweyes Adventurer", class: "Pilgrim", level: 1 })
      .select("*")
      .single();

    if (charCreateErr) throw new Error(`Failed to create character: ${charCreateErr.message}`);
    character = created;
  }

  // ---- Inventory ----
  const { data: inventory, error: invErr } = await supabase
    .from("inventory_items")
    .select("id,name,quantity,created_at")
    .eq("character_id", character.id)
    .order("created_at", { ascending: true });

  if (invErr) throw new Error(`Failed to load inventory: ${invErr.message}`);

  // ---- Sessions joined ----
  let sessions: any[] = [];
  let sessionStates: Record<string, any> = {};

  const { data: joins, error: joinErr } = await supabase
    .from("session_players")
    .select("session_id, joined_at")
    .eq("player_id", user.id)
    .order("joined_at", { ascending: false });

  if (joinErr) throw new Error(`Failed to load session joins: ${joinErr.message}`);

  if (joins?.length) {
    const sessionIds = joins.map((j: any) => j.session_id).filter(Boolean);

    const { data: sData, error: sErr } = await supabase
      .from("sessions")
      .select("id,name,episode_id,story_text,created_at")
      .in("id", sessionIds);

    if (sErr) throw new Error(`Failed to load sessions: ${sErr.message}`);
    sessions = sData ?? [];

    const { data: stData, error: stErr } = await supabase
      .from("session_state")
      .select("*")
      .in("session_id", sessionIds);

    if (stErr) throw new Error(`Failed to load session state: ${stErr.message}`);

    for (const row of stData ?? []) sessionStates[row.session_id] = row;
  }

  // ---- Presented blocks lookup (for stage) ----
  const presentedIds = Array.from(
    new Set(
      Object.values(sessionStates)
        .map((st: any) => st?.presented_block_id)
        .filter((id: any) => typeof id === "string" && id.length > 0)
    )
  );

  let presentedBlocks: Record<string, any> = {};
  if (presentedIds.length) {
    const { data: blocks, error: bErr } = await supabase
      .from("episode_blocks")
      .select("id,sort_order,block_type,audience,mode,title,body,image_url,meta")
      .in("id", presentedIds);

    if (bErr) throw new Error(`Failed to load presented blocks: ${bErr.message}`);

    for (const b of blocks ?? []) presentedBlocks[b.id] = b;
  }

  // ---- Journey Log ----
  let gameLog: any[] = [];
  const { data: logData, error: logErr } = await supabase
    .from("game_log")
    .select("id,event_type,title,summary,session_id,episode_id,created_at")
    .eq("user_id", user.id)
    .eq("character_id", character.id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (logErr) throw new Error(`Failed to load game log: ${logErr.message}`);
  gameLog = logData ?? [];

  return (
    <PlayerHubClient
      userEmail={user.email ?? ""}
      accessLabel={accessLabel}
      character={character}
      inventory={inventory ?? []}
      sessions={sessions ?? []}
      sessionStates={sessionStates ?? {}}
      presentedBlocks={presentedBlocks ?? {}}
      gameLog={gameLog ?? []}
    />
  );
}
