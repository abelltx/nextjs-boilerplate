import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";

function isUuid(value: string) {
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = (url.searchParams.get("session_id") ?? "").trim();
  if (!isUuid(sessionId)) return NextResponse.json({ ok: false, error: "Bad session_id" }, { status: 400 });

  const { user } = await getProfile();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });

  const supabase = await supabaseServer();

  // Confirm joined
  const { data: joinRow } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", user.id)
    .maybeSingle();

  if (!joinRow?.player_id) return NextResponse.json({ ok: false, error: "Not joined" }, { status: 403 });

  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id,name,story_text,episode_id")
    .eq("id", sessionId)
    .single();

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  const { data: state, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (stErr) return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });

  // Players list (for DM roll-entry UI)
  const { data: players } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId);

  // Presented block
  let block = null as any;
  const presentedId = (state as any)?.presented_block_id;
  if (typeof presentedId === "string" && presentedId.length) {
    const { data: b } = await supabase
      .from("episode_blocks")
      .select("id,block_type,title,body,image_url,meta")
      .eq("id", presentedId)
      .maybeSingle();
    block = b ?? null;
  }

  return NextResponse.json({
    ok: true,
    session,
    state,
    block,
    players: (players ?? []).map((p) => p.player_id),
  });
}
