"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type PresentedState = {
  presented_block_id?: string | null;
  presented_title?: string | null;
  presented_body?: string | null;
  presented_image_url?: string | null;
  presented_block_type?: string | null;
  presented_updated_at?: string | null;
};

export default function PresentedBlockRealtime({
  sessionId,
  initialState,
}: {
  sessionId: string;
  initialState: PresentedState;
}) {
  const [presented, setPresented] = useState<PresentedState>({
    presented_block_id: initialState.presented_block_id ?? null,
    presented_title: initialState.presented_title ?? null,
    presented_body: initialState.presented_body ?? null,
    presented_image_url: initialState.presented_image_url ?? null,
    presented_block_type: initialState.presented_block_type ?? null,
    presented_updated_at: initialState.presented_updated_at ?? null,
  });

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`presented-block-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const row = payload.new as any;
          setPresented({
            presented_block_id: row.presented_block_id ?? null,
            presented_title: row.presented_title ?? null,
            presented_body: row.presented_body ?? null,
            presented_image_url: row.presented_image_url ?? null,
            presented_block_type: row.presented_block_type ?? null,
            presented_updated_at: row.presented_updated_at ?? null,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const hasPresented =
    !!presented.presented_block_id ||
    !!presented.presented_title ||
    !!presented.presented_body ||
    !!presented.presented_image_url;

  if (!hasPresented) {
    return (
      <div
        style={{
          border: "1px dashed #ccc",
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
          background: "#fff",
          opacity: 0.9,
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, marginBottom: 6 }}>
          PRESENTED BY STORYTELLER
        </div>
        <div style={{ fontSize: 14, opacity: 0.8 }}>Waiting for the storyteller…</div>
      </div>
    );
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
      <div style={{ fontSize: 11, letterSpacing: 1, opacity: 0.6, marginBottom: 6 }}>
        PRESENTED BY STORYTELLER
      </div>

      {(presented.presented_block_type || presented.presented_title) && (
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          {presented.presented_block_type ? `${presented.presented_block_type.toUpperCase()}` : ""}
          {presented.presented_title ? ` — ${presented.presented_title}` : ""}
        </div>
      )}

      {presented.presented_body && (
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
          {presented.presented_body}
        </div>
      )}

      {presented.presented_image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={presented.presented_image_url}
          alt="Storyteller visual"
          style={{
            marginTop: 12,
            maxWidth: "100%",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
      )}
    </div>
  );
}
