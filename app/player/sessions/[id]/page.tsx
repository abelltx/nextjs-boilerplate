export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import PlayerSessionRealtime from "@/components/PlayerSessionRealtime";
import StoryRealtime from "@/components/StoryRealtime";
import PresentedBlockRealtime from "@/components/PresentedBlockRealtime";

function isUuid(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default async function PlayerSessionPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const p = await Promise.resolve(params);
  const rawSessionId = p?.id;

  if (!rawSessionId || rawSessionId === "undefined" || !isUuid(rawSessionId)) {
    redirect("/player/join");
  }

  const sessionId = rawSessionId.trim();

  const { user } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();

  // session
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id,name,story_text,episode_id")
    .eq("id", sessionId)
    .single();

  if (sErr) throw new Error(`Failed to load session: ${sErr.message}`);

  // state
  const { data: state, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", sessionId)
    .single();

  if (stErr) throw new Error(`Failed to load session state: ${stErr.message}`);

  return (
    <main style={{ maxWidth: 920, margin: "40px auto", padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{session.name}</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Live Session • Signed in as <b>{user.email}</b>
          </div>
        </div>

        {/* Timer + roll prompt update in realtime */}
        <div style={{ minWidth: 260 }}>
          <PlayerSessionRealtime sessionId={sessionId} initialState={state} />
        </div>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Story</h2>

        {/* Presented by Storyteller (LIVE) */}
        <PresentedBlockRealtime sessionId={sessionId} initialState={state} />

        {/* Announcement board (always-on) */}
        <StoryRealtime sessionId={sessionId} initialStoryText={session.story_text || ""} />

        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
          MVP note: read-only. Timer + rolls update live.
        </div>
      </section>
    </main>
  );
}
