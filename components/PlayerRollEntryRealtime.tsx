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

  const [pendingDigital, setPendingDigital] = useState(false);
  const [pendingManual, setPendingManual] = useState(false);

  // Fresh fetch once (helps after long-open tab)
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
  const rollDie = String(state.roll_die ?? "");
  const rollPrompt = String(state.roll_prompt ?? "");
  const rollTarget = String(state.roll_target ?? "all");
  const roundId = String(state.roll_round_id ?? "");

  const rollModes = asObject(state.roll_modes) as Record<string, string>;
  const myMode = rollModes[playerId] ?? "dm";

  const rollResults = asObject(state.roll_results) as Record<string, any>;
  const mine = rollResults[playerId] ?? null;

  const targetedToMe = rollTarget === "all" || rollTarget === playerId;

  // Only show UI for mode=player or mode=digital, and only if roll is open and targeted
  const shouldShow = rollOpen && targetedToMe && (myMode === "player" || myMode === "digital");
  if (!shouldShow) return null;

  const alreadyThisRound = Boolean(mine?.round_id && mine.round_id === roundId);

  // Clear pending flags once we have an answer (or roll closes/mode changes)
  useEffect(() => {
    if (!rollOpen) {
      setPendingDigital(false);
      setPendingManual(false);
      return;
    }
    if (alreadyThisRound) {
      setPendingDigital(false);
      setPendingManual(false);
      return;
    }
    // If DM switched your mode away while you were pending, clear it
    if (myMode !== "digital") setPendingDigital(false);
    if (myMode !== "player") setPendingManual(false);
  }, [rollOpen, alreadyThisRound, myMode]);

  const manualAction = submitPlayerRollAction.bind(null, sessionId, playerId);
  const digitalAction = submitDigitalRollAction.bind(null, sessionId, playerId);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>
        {rollPrompt ? rollPrompt : `Roll ${rollDie ? rollDie.toUpperCase() : ""}`}
      </div>

      {/* If already submitted this round, show result and lock */}
      {alreadyThisRound ? (
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          Submitted:{" "}
          <span style={{ fontFamily: "monospace", fontWeight: 800 }}>
            {String(mine?.value ?? "—")}
          </span>{" "}
          <span style={{ opacity: 0.7 }}>({String(mine?.source ?? "—")})</span>
        </div>
      ) : myMode === "digital" ? (
        /* DIGITAL (Option 3) */
        <form
          action={digitalAction}
          onSubmit={() => {
            setPendingDigital(true);
          }}
        >
          <button
            type="submit"
            disabled={pendingDigital}
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid #111",
              background: pendingDigital ? "#666" : "#111",
              color: "#fff",
              fontWeight: 800,
              fontSize: 13,
              cursor: pendingDigital ? "default" : "pointer",
            }}
          >
            {pendingDigital ? "Rolling…" : `Roll ${rollDie ? rollDie.toUpperCase() : ""}`}
          </button>
        </form>
      ) : (
        /* MANUAL (Option 2) */
        <form
          action={manualAction}
          onSubmit={() => {
            setPendingManual(true);
          }}
          style={{ display: "flex", gap: 8, alignItems: "center" }}
        >
          <input
            name="roll_value"
            type="number"
            required
            disabled={pendingManual}
            placeholder="Enter roll"
            style={{
              flex: 1,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #ccc",
              fontSize: 14,
              background: pendingManual ? "#f5f5f5" : "#fff",
            }}
          />

          <button
            type="submit"
            disabled={pendingManual}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #111",
              background: pendingManual ? "#666" : "#111",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              whiteSpace: "nowrap",
              cursor: pendingManual ? "default" : "pointer",
            }}
          >
            {pendingManual ? "Saving…" : "Submit"}
          </button>
        </form>
      )}

      {/* tiny hint while waiting */}
      {!alreadyThisRound && (pendingManual || pendingDigital) ? (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
          Waiting for confirmation…
        </div>
      ) : null}
    </div>
    
  );
}
