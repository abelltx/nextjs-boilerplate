import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import PlayerSessionRealtime from "@/components/PlayerSessionRealtime";
import StoryRealtime from "@/components/StoryRealtime";

export default async function PlayerSessionPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  // ✅ Make params resilient in prod builds
  const p = await Promise.resolve(params);
  const sessionId = p?.id;
  console.error("PLAYER SESSION PARAM CHECK:", { params: p, sessionId });


  // ✅ Prevent uuid "undefined" crashes + send player to join screen
  if (!sessionId || sessionId === "undefined") redirect("/player/join");

  const { user } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();

  // session (story text)
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id,name,story_text")
    .eq("id", sessionId)
    .single();

  if (sErr) throw new Error(`Failed to load session: ${sErr.message}`);

  // state (timer, encounter, roll prompt)
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

        {/* Timer + encounter + roll prompt update in realtime */}
        <div style={{ minWidth: 260 }}>
          <PlayerSessionRealtime sessionId={sessionId} initialState={state} />
        </div>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
  <h2 style={{ marginTop: 0 }}>Story</h2>

  {/* 🔴 Presented by Storyteller (explicit visibility) */}
  {(state.presented_title || state.presented_body || state.presented_image_url) && (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
        background: "#fafafa",
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, marginBottom: 6 }}>
        PRESENTED BY STORYTELLER
      </div>

      {state.presented_title && (
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {state.presented_title}
        </div>
      )}

      {state.presented_body && (
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {state.presented_body}
        </div>
      )}

      {state.presented_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.presented_image_url}
          alt="Storyteller visual"
          style={{
            marginTop: 12,
            maxWidth: "100%",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
      )}
    </div>
  )}

  {/* 🟡 Baseline story feed (existing behavior) */}
  <StoryRealtime
    sessionId={sessionId}
    initialStoryText={session.story_text || ""}
  />

  <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
    MVP note: read-only. Timer + rolls update live.
  </div>
</section>

    </main>
  );
}
