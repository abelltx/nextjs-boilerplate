"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

type Props = {
  sessionId: string;
  initialStoryText: string;
};

export default function StoryRealtime({ sessionId, initialStoryText }: Props) {
  const [storyText, setStoryText] = useState(initialStoryText);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
    return createBrowserClient(url, anon);
  }, []);

  useEffect(() => {
    setStoryText(initialStoryText);
  }, [initialStoryText]);

  useEffect(() => {
    if (!sessionId) return;

    const channel = supabase
      .channel(`sessions-story-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const next = (payload.new as any)?.story_text;
          if (typeof next === "string") setStoryText(next);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  return (
    <div
      style={{
        whiteSpace: "pre-wrap",
        lineHeight: 1.5,
        padding: 12,
        borderRadius: 10,
        border: "1px solid #ccc",
      }}
    >
      {storyText || "Storyteller hasn’t posted story text yet."}
    </div>
  );
}
