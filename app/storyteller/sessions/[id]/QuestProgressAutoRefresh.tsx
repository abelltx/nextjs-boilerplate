"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export default function QuestProgressAutoRefresh(props: {
  sessionId: string;
  characterIds: string[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const ids = useMemo(
    () =>
      new Set(
        (props.characterIds ?? [])
          .map((v) => String(v ?? "").trim().toLowerCase())
          .filter(Boolean)
      ),
    [props.characterIds]
  );
  const lastRefreshRef = useRef<number>(0);

  useEffect(() => {
    if (!ids.size) return;
    const maybeRefresh = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < 350) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    const channel = supabase
      .channel(`quest-progress:${props.sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "player_quest_progress" },
        (payload) => {
          const nextId = String((payload as any)?.new?.character_id ?? "").trim().toLowerCase();
          const prevId = String((payload as any)?.old?.character_id ?? "").trim().toLowerCase();
          if ((nextId && ids.has(nextId)) || (prevId && ids.has(prevId))) {
            maybeRefresh();
          }
        }
      )
      .subscribe();
    const stateChannel = supabase
      .channel(`session-state:${props.sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session_state",
          filter: `session_id=eq.${props.sessionId}`,
        },
        () => {
          maybeRefresh();
        }
      )
      .subscribe();

    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") maybeRefresh();
    }, 5000);

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
      void supabase.removeChannel(stateChannel);
    };
  }, [supabase, router, props.sessionId, ids]);

  return null;
}
