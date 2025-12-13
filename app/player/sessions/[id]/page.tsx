import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth/getProfile";
import { supabaseServer } from "@/lib/supabase/server";
import PlayerSessionRealtime from "@/components/PlayerSessionRealtime";

export default async function PlayerSessionPage({ params }: { params: { id: string } }) {
  const { user } = await getProfile();
  if (!user) redirect("/login");

  const supabase = await supabaseServer();

  // session (story text)
  const { data: session, error: sErr } = await supabase
    .from("sessions")
    .select("id,name,story_text")
    .eq("id", params.id)
    .single();

  if (sErr) throw new Error(`Failed to load session: ${sErr.message}`);

  // state (timer, encounter, roll prompt)
  const { data: state, error: stErr } = await supabase
    .from("session_state")
    .select("*")
    .eq("session_id", params.id)
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
          <PlayerSessionRealtime sessionId={params.id} initialState={state} />
        </div>
      </header>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Story</h2>
        <div
          style={{
            whiteSpace: "pre-wrap",
            lineHeight: 1.5,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        >
          {session.story_text || "Storyteller hasn’t posted story text yet."}
        </div>
        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
          MVP note: read-only. Timer + rolls update live.
        </div>
      </section>
    </main>
  );
}
