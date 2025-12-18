"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
  const [presentedId, setPresentedId] = useState<string | null>(
    initialState?.presented_block_id ?? null
  );
  const [block, setBlock] = useState<Block | null>(null);

  const lastPresentedRef = useRef<string | null>(initialState?.presented_block_id ?? null);

  // Load block when presentedId changes
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

  useEffect(() => {
    const supabase = supabaseBrowser();
    let channel: any;
    let pollId: any;

    const fetchLatestPresented = async () => {
      const { data, error } = await supabase
        .from("session_state")
        .select("presented_block_id")
        .eq("session_id", sessionId)
        .single();

      if (!error) {
        const next = (data as any)?.presented_block_id ?? null;
        if (next !== lastPresentedRef.current) {
          lastPresentedRef.current = next;
          setPresentedId(next);
        }
      }
    };

    // Realtime subscription (best case)
    (async () => {
      await supabase.auth.getSession();

      channel = supabase
        .channel(`presented:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "session_state",
            filter: `session_id=eq.${sessionId}`,
          },
          (payload) => {
            const next = (payload.new as SessionState)?.presented_block_id ?? null;
            if (next !== lastPresentedRef.current) {
              lastPresentedRef.current = next;
              setPresentedId(next);
            }
          }
        )
        .subscribe();
    })();

    // Poll fallback
    pollId = setInterval(fetchLatestPresented, 1000);

    // Sync immediately
    fetchLatestPresented();

    return () => {
      if (pollId) clearInterval(pollId);
      if (channel) supabase.removeChannel(channel);
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
