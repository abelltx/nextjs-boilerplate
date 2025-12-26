"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { submitPlayerRollAction, submitDigitalRollAction } from "@/app/player/sessions/[id]/rollActions";

type AnyState = Record<string, any>;

function asObject(v: any): Record<string, any> {
  if (!v) return {};
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export default function PlayerRollEntryRealtime({
  sessionId,
  playerId,
  initialState,
}: {
  sessionId: string;
  playerId: string;
  initialState: AnyState;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [state, setState] = useState<AnyState>(initialState ?? {});

  // Fresh fetch once
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("session_state")
        .select("*")
        .eq("session_id", sessionId)
        .single();
      if (!alive) return;
      if (!error && data) setState(data as any);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, sessionId]);

  // Live subscribe
  useEffect(() => {
    const channel = supabase
      .channel(`session_state:${sessionId}:playerroll`)
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
  if (!rollOpen) return null;

  const rollDie = String(state.roll_die ?? "");
  const rollPrompt = String(state.roll_prompt ?? "");
  const rollTarget = String(state.roll_target ?? "all");
  const roundId = String(state.roll_round_id ?? "");

  const rollModes = asObject(state.roll_modes) as Record<string, string>;
  const myMode = rollModes[playerId] ?? "dm";

  const rollResults = asObject(state.roll_results) as Record<string, any>;
  const mine = rollResults[playerId] ?? null;

  const targetedToMe = rollTarget === "all" || rollTarget === playerId;

  // Only show UI for mode=player or mode=digital
  const shouldShow =
    targetedToMe && (myMode === "player" || myMode === "digital");

  if (!shouldShow) return null;

  const alreadyThisRound = mine?.round_id && mine.round_id === roundId;

  const manualAction = submitPlayerRollAction.bind(null, sessionId, playerId);
  const digitalAction = submitDigitalRollAction.bind(null, sessionId, playerId);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        {rollPrompt ? rollPrompt : `Roll ${rollDie ? rollDie.toUpperCase() : ""}`}
      </div>

      {alreadyThisRound ? (
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          Submitted:{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 800 }}>
            {String(mine?.value ?? "—")}
          </span>{" "}
          <span style={{ opacity: 0.7 }}>({String(mine?.source ?? "—")})</span>
        </div>
      ) : myMode === "digital" ? (
        <form action={digitalAction}>
          <button
            type="submit"
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
            }}
          >
            Roll {rollDie ? rollDie.toUpperCase() : ""}
          </button>
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.7 }}>
            Digital dice is one-roll-only per request.
          </div>
        </form>
      ) : (
        <form action={manualAction} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            name="roll_value"
            type="number"
            required
            placeholder="Enter roll"
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
      )}
    </div>
  );
}
