"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type SessionState = {
  session_id: string;

  // Timer
  timer_status: "running" | "paused" | "stopped" | null;
  remaining_seconds: number | null;
  updated_at?: string | null; // if you have it

  // Rolls
  roll_open: boolean | null;
  roll_die: string | null; // "d20", etc
  roll_prompt: string | null;
  roll_target: string | null;
};

function clamp0(n: number) {
  return n < 0 ? 0 : n;
}

function formatMMSS(totalSeconds: number) {
  const s = clamp0(Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function PlayerSessionRealtime({
  sessionId,
  initialState,
}: {
  sessionId: string;
  initialState: any;
}) {
  const [state, setState] = useState<SessionState>(() => initialState as SessionState);

  // local ticking for timer UI (so it counts down smoothly even if DB updates are sparse)
  const [displayRemaining, setDisplayRemaining] = useState<number>(() => initialState?.remaining_seconds ?? 0);

  const lastStateRef = useRef<SessionState>(initialState as SessionState);

  // Keep displayRemaining synced whenever state changes from server/realtime/poll
  useEffect(() => {
    const next = Number(state?.remaining_seconds ?? 0);
    setDisplayRemaining(next);
  }, [state?.remaining_seconds]);

  // Smooth countdown tick when running
  useEffect(() => {
    if (state?.timer_status !== "running") return;

    const tick = setInterval(() => {
      setDisplayRemaining((prev) => clamp0(prev - 1));
    }, 1000);

    return () => clearInterval(tick);
  }, [state?.timer_status]);

  // Unified updater to avoid rerenders when nothing changes
  const applyNewState = (next: SessionState) => {
    const prev = lastStateRef.current;

    const changed =
      prev?.timer_status !== next?.timer_status ||
      prev?.remaining_seconds !== next?.remaining_seconds ||
      prev?.roll_open !== next?.roll_open ||
      prev?.roll_die !== next?.roll_die ||
      prev?.roll_prompt !== next?.roll_prompt ||
      prev?.roll_target !== next?.roll_target;

    if (changed) {
      lastStateRef.current = next;
      setState(next);
    }
  };

  useEffect(() => {
    const supabase = supabaseBrowser();
    let channel: any;
    let pollId: any;

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from("session_state")
        .select("session_id,timer_status,remaining_seconds,updated_at,roll_open,roll_die,roll_prompt,roll_target")
        .eq("session_id", sessionId)
        .single();

      if (!error && data) {
        applyNewState(data as any);
      }
    };

    (async () => {
      await supabase.auth.getSession();

      channel = supabase
        .channel(`state:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "session_state",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            const next = payload.new as any as SessionState;
            if (next) applyNewState(next);
          }
        )
        .subscribe();
    })();

    // Poll fallback (covers realtime flakiness)
    pollId = setInterval(fetchLatest, 1000);
    fetchLatest(); // sync immediately

    return () => {
      if (pollId) clearInterval(pollId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const timerLabel = useMemo(() => {
    const status = state?.timer_status ?? "stopped";
    const secs = Number(displayRemaining ?? 0);
    return { status, mmss: formatMMSS(secs) };
  }, [state?.timer_status, displayRemaining]);

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase" }}>Timer</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{String(timerLabel.status).toUpperCase()}</div>
      </div>

      <div style={{ fontSize: 34, fontWeight: 900, marginTop: 6 }}>{timerLabel.mmss}</div>

      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #eee" }}>
        <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase" }}>Roll</div>

        {state?.roll_open ? (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {state.roll_die ? `Roll ${state.roll_die.toUpperCase()}` : "Roll"}
            </div>
            <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>
              {state.roll_prompt ?? "Roll now."}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              Target: <b>{state.roll_target ?? "all"}</b>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 6, opacity: 0.7 }}>(No roll request.)</div>
        )}
      </div>
    </div>
  );
}
