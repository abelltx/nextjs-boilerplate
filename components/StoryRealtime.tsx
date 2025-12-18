"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function StoryRealtime({
  sessionId,
  initialStoryText,
}: {
  sessionId: string;
  initialStoryText: string;
}) {
  const [text, setText] = useState(initialStoryText);
  const lastTextRef = useRef(initialStoryText);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let channel: any;
    let pollId: any;

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("story_text")
        .eq("id", sessionId)
        .single();

      if (!error) {
        const next = data?.story_text ?? "";
        if (next !== lastTextRef.current) {
          lastTextRef.current = next;
          setText(next);
        }
      }
    };

    // Start realtime subscription (best case)
    (async () => {
      await supabase.auth.getSession();

      channel = supabase
        .channel(`story:${sessionId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "sessions",
            filter: `id=eq.${sessionId}`,
          },
          (payload) => {
            const next = (payload.new as any)?.story_text ?? "";
            if (next !== lastTextRef.current) {
              lastTextRef.current = next;
              setText(next);
            }
          }
        )
        .subscribe();
    })();

    // Poll fallback (covers when realtime events never arrive)
    pollId = setInterval(fetchLatest, 1500);

    // Also fetch once immediately to sync fast
    fetchLatest();

    return () => {
      if (pollId) clearInterval(pollId);
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return (
    <div style={{ whiteSpace: "pre-wrap", fontFamily: "serif", fontSize: 16, lineHeight: 1.5 }}>
      {text || <span style={{ opacity: 0.6 }}>(No story text yet.)</span>}
    </div>
  );
}
