"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

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

export default function DmRollResultsRealtime({
  sessionId,
  joins,
  initialState,
}: {
  sessionId: string;
  joins: Array<{ player_id: string }>;
  initialState: AnyState;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [state, setState] = useState<AnyState>(initialState ?? {});

  // initial fetch (optional but helps when tab was open a while)
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

  // live subscribe
  useEffect(() => {
    const ch = supabase
      .channel(`dm_roll_results:${sessionId}`)
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
      supabase.removeChannel(ch);
    };
  }, [supabase, sessionId]);

  const rollOpen = Boolean(state.roll_open);
  const rollDie = String(state.roll_die ?? "");
  const rollRoundId = String(state.roll_round_id ?? "");

  const rollModes = asObject(state.roll_modes) as Record<string, string>;
  const rollResults = asObject(state.roll_results) as Record<string, any>;

  return (
    <div className="mt-2 space-y-1">
      <div className="text-[10px] uppercase text-gray-500">
        {rollOpen ? `Roll open ${rollDie ? `• ${rollDie}` : ""}` : "Roll closed"}
        {rollOpen && rollRoundId ? <span className="ml-1 font-mono opacity-60">({rollRoundId.slice(0, 6)})</span> : null}
      </div>

      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 6 }).map((_, i) => {
          const p = joins?.[i];
          const playerId = p?.player_id ?? null;
          const mode = playerId ? rollModes[playerId] ?? "dm" : "dm";
          const r = playerId ? rollResults[playerId] ?? null : null;

          return (
            <div key={i} className="border rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">Player {i + 1}</div>
              <div className="text-[11px] font-mono break-all">{playerId ? playerId.slice(0, 8) : "—"}</div>

              <div className="mt-1 text-[10px] text-gray-500">
                mode: <span className="font-mono">{mode}</span>
              </div>

              {rollOpen ? (
                r?.round_id === rollRoundId ? (
                  <div className="mt-1 text-sm font-bold">
                    {String(r?.value ?? "—")}
                    <span className="ml-1 text-[10px] font-normal text-gray-500">({String(r?.source ?? "—")})</span>
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-gray-400">—</div>
                )
              ) : (
                <div className="mt-1 text-[11px] text-gray-400">—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
