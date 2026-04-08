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

export default function DmPlayerRollLineRealtime({
  sessionId,
  playerId,
  initialState,
  quickRoll,
}: {
  sessionId: string;
  playerId: string | null;
  initialState: AnyState;
  quickRoll?: {
    label: string;
    total: number;
  } | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [state, setState] = useState<AnyState>(initialState ?? {});

  useEffect(() => {
    if (!playerId) return;

    const channel = supabase
      .channel(`session_state:${sessionId}:dmrollline`)
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
  }, [supabase, sessionId, playerId]);

  if (!playerId) return <div className="mt-1 text-[11px] text-gray-400">No roll yet</div>;

  const rollDie = String(state.roll_die ?? "");
  const rollResults = asObject(state.roll_results) as Record<string, any>;
  const mine = rollResults[playerId] ?? null;

  if (mine?.value || mine?.value === 0) {
    return (
      <div className="mt-1 text-[11px] text-gray-700">
        <span className="font-mono">{rollDie ? rollDie.toUpperCase() : "ROLL"}</span>:{" "}
        <span className="font-bold">{String(mine.value)}</span>{" "}
        <span className="text-gray-500">({String(mine.source ?? "-")})</span>
      </div>
    );
  }

  if (quickRoll && Number.isFinite(quickRoll.total)) {
    return (
      <div className="mt-1 text-[11px] text-gray-700">
        Last roll: <span className="font-mono">{quickRoll.label}</span>{" "}
        <span className="font-bold">{String(quickRoll.total)}</span>
      </div>
    );
  }

  return <div className="mt-1 text-[11px] text-gray-400">No roll yet</div>;
}
