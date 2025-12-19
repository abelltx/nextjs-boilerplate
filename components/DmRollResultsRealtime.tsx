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

  useEffect(() => {
    const channel = supabase
      .channel(`session_state:${sessionId}:dmrolls`)
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

  const rollDie = String(state.roll_die ?? "");
  const rollResults = asObject(state.roll_results) as Record<string, any>;

  return (
    <div className="grid grid-cols-6 gap-2">
      {Array.from({ length: 6 }).map((_, i) => {
        const p = joins[i];
        const playerId = p?.player_id ?? null;
        const r = playerId ? rollResults[playerId] : null;

        return (
          <div key={i} className="border rounded-lg p-2 text-center">
            <div className="text-xs text-gray-500">Player {i + 1}</div>
            <div className="text-[11px] font-mono break-all">
              {playerId ? playerId.slice(0, 8) : "—"}
            </div>

            <div className="mt-1 text-[11px] text-gray-700">
              {r?.value != null ? (
                <>
                  <span className="font-mono">{rollDie ? rollDie.toUpperCase() : "ROLL"}</span>:{" "}
                  <b>{String(r.value)}</b>{" "}
                  <span className="text-gray-500">({String(r.source ?? "—")})</span>
                </>
              ) : (
                <span className="text-gray-400">No roll yet</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
