"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { submitPlayerRollAction } from "@/app/player/sessions/[id]/rollActions";

type AnyState = Record<string, any>;

export default function PlayerRollEntryRealtime({
  sessionId,
  playerId,
  initialState,
}: {
  sessionId: string;
  playerId: string;
  initialState: AnyState;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [state, setState] = useState<AnyState>(initialState ?? {});

  useEffect(() => {
    const channel = supabase
      .channel(`session_state:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload?.new) setState(payload.new as AnyState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  const rollOpen = Boolean(state.roll_open);
  const rollDie = String(state.roll_die ?? "");
  const rollPrompt = String(state.roll_prompt ?? "");
  const rollTarget = String(state.roll_target ?? "all");

  const rollModes = (state.roll_modes ?? {}) as Record<string, string>;
  const myMode = rollModes[playerId] ?? "dm";

  const rollResults = (state.roll_results ?? {}) as Record<string, any>;
  const mine = rollResults[playerId] ?? null;

  const shouldShow = rollOpen && myMode === "player" && (rollTarget === "all" || rollTarget === playerId);
  if (!shouldShow) return null;

  const action = submitPlayerRollAction.bind(null, sessionId, playerId);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        {rollPrompt ? rollPrompt : `Enter your ${rollDie ? rollDie.toUpperCase() : "roll"}`}
      </div>

      <form action={action} style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          name="roll_value"
          type="number"
          required
          placeholder={mine?.value ? String(mine.value) : "Roll"}
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

      {mine ? (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
          Submitted: <span style={{ fontFamily: "monospace" }}>{String(mine.value ?? "—")}</span>
        </div>
      ) : null}
    </div>
  );
}
