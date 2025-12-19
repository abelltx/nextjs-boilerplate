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
  const playerId = user.id;

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

  // (Optional but recommended) confirm this user is actually joined to the session
  const { data: joinRow } = await supabase
    .from("session_players")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("player_id", playerId)
    .maybeSingle();

  const isJoined = Boolean(joinRow?.player_id);

  const rollOpen = Boolean((state as any).roll_open);
  const rollDie = String((state as any).roll_die ?? "");
  const rollPrompt = String((state as any).roll_prompt ?? "");
  const rollTarget = String((state as any).roll_target ?? "all");

  const rollModes = (((state as any).roll_modes ?? {}) as Record<string, string>) || {};
  const myMode = rollModes[playerId] ?? "dm";

  const rollResults = (((state as any).roll_results ?? {}) as Record<string, any>) || {};
  const myExisting = rollResults[playerId] ?? null;

  const shouldShowPlayerEntry =
    isJoined &&
    rollOpen &&
    myMode === "player" &&
    (rollTarget === "all" || rollTarget === playerId);

  return (
    <main style={{ maxWidth: 920, margin: "40px auto", padding: 16, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>{session.name}</h1>
          <div style={{ opacity: 0.8, marginTop: 6 }}>
            Live Session • Signed in as <b>{user.email}</b>
          </div>
          <div style={{ opacity: 0.7, marginTop: 6, fontSize: 12 }}>
            Player ID: <span style={{ fontFamily: "monospace" }}>{playerId.slice(0, 8)}</span> • Joined:{" "}
            <b>{isJoined ? "Yes" : "No"}</b>
          </div>
        </div>

        {/* Timer + roll prompt update in realtime */}
        <div style={{ minWidth: 260 }}>
  <PlayerSessionRealtime sessionId={sessionId} initialState={state} />

  {/* Compact Mode 2: Player enters roll (inside the existing dice box) */}
  {(() => {
    const playerId = user.id;

    // joined check (optional but recommended: remove if you don't want it)
    // NOTE: If you don't have join enforcement yet, set isJoined = true;
    const isJoined = true;

    const rollOpen = Boolean((state as any).roll_open);
    const rollDie = String((state as any).roll_die ?? "");
    const rollPrompt = String((state as any).roll_prompt ?? "");
    const rollTarget = String((state as any).roll_target ?? "all");

    const rollModes = (((state as any).roll_modes ?? {}) as Record<string, string>) || {};
    const myMode = rollModes[playerId] ?? "dm";

    const rollResults = (((state as any).roll_results ?? {}) as Record<string, any>) || {};
    const myExisting = rollResults[playerId] ?? null;

    const shouldShow =
      isJoined &&
      rollOpen &&
      myMode === "player" &&
      (rollTarget === "all" || rollTarget === playerId);

    if (!shouldShow) return null;

    return (
      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
          {rollPrompt ? rollPrompt : `Enter your ${rollDie ? rollDie.toUpperCase() : "roll"}`}
        </div>

        <form
          action={async (fd) => {
            "use server";
            const val = Number(fd.get("roll_value"));
            if (!Number.isFinite(val)) return;

            const supabase = await supabaseServer();

            // Load latest roll_results to merge safely
            const { data: st, error: e1 } = await supabase
              .from("session_state")
              .select("roll_results")
              .eq("session_id", sessionId)
              .single();

            if (e1) throw new Error(e1.message);

            const prev = ((st as any)?.roll_results ?? {}) as Record<string, any>;
            const next = {
              ...prev,
              [playerId]: { value: val, source: "player", submitted_at: new Date().toISOString() },
            };

            const { error: e2 } = await supabase
              .from("session_state")
              .update({ roll_results: next })
              .eq("session_id", sessionId);

            if (e2) throw new Error(e2.message);

            redirect(`/player/sessions/${sessionId}`);
          }}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            name="roll_value"
            type="number"
            required
            placeholder={myExisting?.value ? String(myExisting.value) : "Roll"}
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ccc",
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              whiteSpace: "nowrap",
            }}
          >
            Submit
          </button>
        </form>

        {myExisting ? (
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
            Submitted: <span style={{ fontFamily: "monospace" }}>{String(myExisting.value ?? "—")}</span>
          </div>
        ) : null}
      </div>
    );
  })()}
</div>

      </header>

      {/* MODE 2: Player enters roll */}
      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Rolls</h2>

        {!isJoined ? (
          <div style={{ opacity: 0.8 }}>
            You are not registered to this session yet. (Missing row in <code>session_players</code>.)
          </div>
        ) : !rollOpen ? (
          <div style={{ opacity: 0.8 }}>No roll is currently open.</div>
        ) : myMode !== "player" ? (
          <div style={{ opacity: 0.8 }}>
            A roll is open, but your roll input is set to: <b>{myMode}</b>.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.85 }}>
              <b>Prompt:</b> {rollPrompt || `Roll your ${rollDie.toUpperCase() || "die"}`}
            </div>

            {myExisting ? (
              <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 10, background: "#fafafa" }}>
                <div style={{ fontWeight: 700 }}>Submitted</div>
                <div style={{ marginTop: 6, fontFamily: "monospace" }}>
                  value: {String(myExisting.value ?? "—")} • source: {String(myExisting.source ?? "—")}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  If you need to change it, submit again (it overwrites your previous entry).
                </div>
              </div>
            ) : null}

            {shouldShowPlayerEntry ? (
              <form
                action={async (fd) => {
                  "use server";

                  const val = Number(fd.get("roll_value"));
                  if (!Number.isFinite(val)) return;

                  const supabase = await supabaseServer();

                  // Load latest state to merge safely (avoid stomping)
                  const { data: st, error: e1 } = await supabase
                    .from("session_state")
                    .select("roll_results")
                    .eq("session_id", sessionId)
                    .single();

                  if (e1) throw new Error(e1.message);

                  const prev = ((st as any)?.roll_results ?? {}) as Record<string, any>;
                  const next = {
                    ...prev,
                    [playerId]: {
                      value: val,
                      source: "player",
                      submitted_at: new Date().toISOString(),
                    },
                  };

                  const { error: e2 } = await supabase
                    .from("session_state")
                    .update({ roll_results: next })
                    .eq("session_id", sessionId);

                  if (e2) throw new Error(e2.message);

                  redirect(`/player/sessions/${sessionId}`);
                }}
                style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
              >
                <input
                  name="roll_value"
                  type="number"
                  min={1}
                  max={999}
                  placeholder="Enter your roll"
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    minWidth: 220,
                    fontSize: 16,
                  }}
                  required
                />

                <button
                  type="submit"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontWeight: 700,
                  }}
                >
                  Submit Roll
                </button>
              </form>
            ) : (
              <div style={{ opacity: 0.8 }}>
                Roll is open, but it isn’t targeted to you right now.
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 10, opacity: 0.6, fontSize: 12 }}>
          Mode 2 MVP: player enters a number and submits. Digital dice (Mode 3) comes next.
        </div>
      </section>

      <section style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Story</h2>

        {/* Presented by Storyteller (LIVE) */}
        <PresentedBlockRealtime sessionId={sessionId} initialState={state} />

        {/* Announcement board (always-on) */}
        <StoryRealtime sessionId={sessionId} initialStoryText={session.story_text || ""} />

        <div style={{ marginTop: 8, opacity: 0.7, fontSize: 13 }}>
          MVP note: read-only. Timer + roll prompt update live. Roll submission writes to <code>session_state.roll_results</code>.
        </div>
      </section>
    </main>
  );
}
