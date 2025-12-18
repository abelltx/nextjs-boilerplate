"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

function fmt(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function PlayerSessionRealtime({
  sessionId,
  initialState,
}: {
  sessionId: string;
  initialState: any;
}) {
  const [state, setState] = useState(initialState);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`session-state-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setState(payload.new);
        }
      )
      .subscribe((status) => {
        console.log("[PlayerSessionRealtime] channel status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const baseMs = useMemo(() => new Date(state.updated_at).getTime(), [state.updated_at]);

  const liveRemaining =
    state.timer_status === "running"
      ? state.remaining_seconds - (nowMs - baseMs) / 1000
      : state.remaining_seconds;

  const pct =
    state.encounter_total > 0
      ? Math.round((state.encounter_current / state.encounter_total) * 100)
      : 0;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, display: "flex", gap: 10 }}>
        <div style={{ fontSize: 22 }}>⌛</div>
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>Session Timer</div>
          <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 900 }}>{fmt(liveRemaining)}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{state.timer_status}</div>
        </div>
      </div>

      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>Encounter</div>
        <div style={{ marginTop: 8, height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ height: 8, width: `${pct}%`, background: "#111" }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.8 }}>
          {state.encounter_total === 0 ? "No encounters set" : `${state.encounter_current} / ${state.encounter_total}`}
        </div>
      </div>

      {state.roll_open ? (
        <div style={{ border: "1px solid #111", borderRadius: 12, padding: 12, background: "#111", color: "#fff" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.8 }}>Roll Request</div>
          <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>
            {state.roll_prompt || "Roll now"}
          </div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
            Use real dice. Tell your Storyteller your result.
          </div>
        </div>
      ) : null}
    </div>
  );
}
