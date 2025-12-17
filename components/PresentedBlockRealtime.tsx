"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const [state, setState] = useState<PresentedState>({
    presented_block_id: initialState?.presented_block_id ?? null,
    presented_title: initialState?.presented_title ?? null,
    presented_body: initialState?.presented_body ?? null,
    presented_image_url: initialState?.presented_image_url ?? null,
    presented_updated_at: initialState?.presented_updated_at ?? null,
  });

  useEffect(() => {
    const channel = supabase
      .channel(`presented-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const n: any = payload.new ?? {};
          setState({
            presented_block_id: n.presented_block_id ?? null,
            presented_title: n.presented_title ?? null,
            presented_body: n.presented_body ?? null,
            presented_image_url: n.presented_image_url ?? null,
            presented_updated_at: n.presented_updated_at ?? null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const total = presentableIds.length;
  const idx =
    state.presented_block_id && total > 0
      ? presentableIds.indexOf(state.presented_block_id)
      : -1;
  const human = idx >= 0 ? idx + 1 : 0;

  const show =
    !!state.presented_title || !!state.presented_body || !!state.presented_image_url;

  if (!show) return null;

  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 10, padding: 14, marginBottom: 16, background: "#fafafa" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6 }}>
          PRESENTED BY STORYTELLER
        </div>
        {total > 0 ? (
          <div style={{ fontSize: 11, opacity: 0.65 }}>
            Episode Progress: <b>{human}</b> / <b>{total}</b>
          </div>
        ) : null}
      </div>

      {state.presented_title ? (
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
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
    </div>
  );
}
