"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browserClient";

type PresentedState = {
  presented_block_id?: string | null;
  presented_title?: string | null;
  presented_body?: string | null;
  presented_image_url?: string | null;
  presented_updated_at?: string | null;
};

export default function PresentedBlockRealtime({
  sessionId,
  initialState,
  presentableIds = [],
}: {
  sessionId: string;
  initialState: any;
  presentableIds?: string[];
}) {
  const [state, setState] = useState<PresentedState>(initialState);
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`presented-state-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setEventCount((n) => n + 1);
          setState(payload.new as any);
        }
      )
      .subscribe();

    return () => {
      supabaseBrowser.removeChannel(channel);
    };
  }, [sessionId]);

  const progress = useMemo(() => {
    if (!presentableIds.length) return { idx: 0, total: 0, pct: 0 };

    const currentId = state.presented_block_id ?? null;
    const i = currentId ? presentableIds.indexOf(currentId) : -1;
    const idx = i >= 0 ? i + 1 : 0;
    const total = presentableIds.length;
    const pct = total > 0 ? Math.round((idx / total) * 100) : 0;

    return { idx, total, pct };
  }, [presentableIds, state.presented_block_id]);

  const hasPresented =
    !!state.presented_title || !!state.presented_body || !!state.presented_image_url;

  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 12 }}>
      {/* DEBUG: if this stays 0 when you click Present, the subscription is not firing */}
      <div style={{ fontSize: 12, opacity: 0.6 }}>
        Presented realtime events: <b>{eventCount}</b>
      </div>

      {progress.total > 0 ? (
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", opacity: 0.7 }}>
            Episode Progress
          </div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800 }}>
            {progress.idx} / {progress.total}
          </div>
          <div style={{ marginTop: 8, height: 8, background: "#eee", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: 8, width: `${progress.pct}%`, background: "#111" }} />
          </div>
        </div>
      ) : null}

      {hasPresented ? (
        <div style={{ border: "1px solid #ccc", borderRadius: 12, padding: 14, background: "#fafafa" }}>
          <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, marginBottom: 6 }}>
            PRESENTED BY STORYTELLER
          </div>

          {state.presented_title ? (
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
              {state.presented_title}
            </div>
          ) : null}

          {state.presented_body ? (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {state.presented_body}
            </div>
          ) : null}

          {state.presented_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.presented_image_url}
              alt="Storyteller visual"
              style={{ marginTop: 12, maxWidth: "100%", borderRadius: 10, border: "1px solid #ddd" }}
            />
          ) : null}

          {state.presented_updated_at ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>
              Updated: {new Date(state.presented_updated_at).toLocaleString()}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
