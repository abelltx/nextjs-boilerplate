"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type SessionState = {
  session_id: string;
  presented_block_id: string | null;
};

type Block = {
  id: string;
  block_type: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
};

export default function PresentedBlockRealtime({
  sessionId,
  initialState,
}: {
  sessionId: string;
  initialState: any;
}) {
  const [presentedId, setPresentedId] = useState<string | null>(initialState?.presented_block_id ?? null);
  const [block, setBlock] = useState<Block | null>(null);

  // Fetch block when presentedId changes
  useEffect(() => {
    const supabase = supabaseBrowser();

    let cancelled = false;

    async function load() {
      if (!presentedId) {
        setBlock(null);
        return;
      }
      const { data, error } = await supabase
        .from("episode_blocks")
        .select("id,block_type,title,body,image_url")
        .eq("id", presentedId)
        .single();

      if (!cancelled) {
        if (error) {
          console.error("Failed to load presented block:", error.message);
          setBlock(null);
        } else {
          setBlock(data as any);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [presentedId]);

  // Subscribe to state changes (THIS is where filter mistakes kill everything)
  useEffect(() => {
    const supabase = supabaseBrowser();

    const channel = supabase
      .channel(`presented:${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${sessionId}`, // ✅ must be session_id
        },
        (payload) => {
          const next = (payload.new as SessionState)?.presented_block_id ?? null;
          setPresentedId(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  if (!presentedId) return <div style={{ opacity: 0.7 }}>(Nothing presented yet.)</div>;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.7, textTransform: "uppercase" }}>Live</div>
      <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>
        {block?.title || block?.block_type || "Presented"}
      </div>
      {block?.body ? <div style={{ whiteSpace: "pre-wrap", marginTop: 8 }}>{block.body}</div> : null}
      {block?.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={block.image_url} alt="Presented" style={{ width: "100%", borderRadius: 12, marginTop: 10 }} />
      ) : null}
    </div>
  );
}
