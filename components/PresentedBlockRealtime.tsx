"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type PresentedState = {
  // from session_state
  presented_block_id?: string | null;
  presented_title?: string | null;
  presented_body?: string | null;
  presented_image_url?: string | null;
  presented_updated_at?: string | null;

  // other fields may exist; we keep it loose
  [key: string]: any;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PresentedBlockRealtime({
  sessionId,
  initialState,
  presentableIds,
}: {
  sessionId: string;
  initialState: PresentedState;
  presentableIds?: string[]; // ✅ FIX: allow player page to pass this
}) {
  const [state, setState] = useState<PresentedState>(initialState);

  // Realtime subscription to session_state row for this session
  useEffect(() => {
    const channel = supabase
      .channel(`presented-block-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          setState(payload.new as PresentedState);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Optional: compute episode position if you pass presentableIds
  const progress = useMemo(() => {
    if (!presentableIds?.length) return null;
    const idx = state.presented_block_id
      ? presentableIds.findIndex((id) => id === state.presented_block_id)
      : -1;
    const human = idx >= 0 ? idx + 1 : 0;
    return { human, total: presentableIds.length };
  }, [presentableIds, state.presented_block_id]);

  const hasPresented =
    !!state.presented_title || !!state.presented_body || !!state.presented_image_url;

  if (!hasPresented) {
    // Still show progress bar if available
    return progress ? (
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          background: "#fafafa",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6 }}>
          EPISODE PROGRESS
        </div>
        <div style={{ marginTop: 6, fontSize: 14 }}>
          Block <b>{progress.human}</b> / <b>{progress.total}</b>
        </div>
      </div>
    ) : null;
  }

  return (
    <div
      style={{
        border: "1px solid #ccc",
        borderRadius: 10,
        padding: 14,
        marginBottom: 16,
        background: "#fafafa",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6 }}>
          PRESENTED BY STORYTELLER
        </div>

        {progress ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Block <b>{progress.human}</b> / <b>{progress.total}</b>
          </div>
        ) : null}
      </div>

      {state.presented_title ? (
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 8, marginBottom: 8 }}>
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
          style={{
            marginTop: 12,
            maxWidth: "100%",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
      ) : null}
    </div>
  );
}
