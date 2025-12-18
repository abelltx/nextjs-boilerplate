"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function StoryRealtime({
  sessionId,
  initialStoryText,
}: {
  sessionId: string;
  initialStoryText: string;
}) {
  const [text, setText] = useState(initialStoryText);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let channel: any;

    (async () => {
      // IMPORTANT: ensure the browser client has loaded auth/session before subscribing
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
            setText((payload.new as any)?.story_text ?? "");
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [sessionId]);

  return (
    <div style={{ whiteSpace: "pre-wrap", fontFamily: "serif", fontSize: 16, lineHeight: 1.5 }}>
      {text || <span style={{ opacity: 0.6 }}>(No story text yet.)</span>}
    </div>
  );
}
