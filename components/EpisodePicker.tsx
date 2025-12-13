"use client";

import { useMemo, useState, useTransition } from "react";
import { loadEpisodeToSessionAction } from "@/app/actions/episodes";

type Episode = {
  id: string;
  title: string;
  episode_code: string | null;
  tags?: string[] | null;
};

export function EpisodePicker({
  sessionId,
  episodes,
}: {
  sessionId: string;
  episodes: Episode[];
}) {
  const [selectedId, setSelectedId] = useState<string>(episodes[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  const selected = useMemo(
    () => episodes.find((e) => e.id === selectedId),
    [episodes, selectedId]
  );

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="font-semibold">Load an Episode</div>

      <div className="flex flex-col gap-2">
        <select
          className="border rounded-lg p-2"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={isPending || episodes.length === 0}
        >
          {episodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}{e.episode_code ? ` (${e.episode_code})` : ""}
            </option>
          ))}
        </select>

        {selected?.tags?.length ? (
          <div className="text-sm opacity-75">
            Tags: {selected.tags.join(", ")}
          </div>
        ) : null}

        <button
          className="rounded-lg bg-black text-white px-4 py-2 disabled:opacity-50"
          disabled={!selectedId || isPending}
          onClick={() => {
            startTransition(async () => {
              await loadEpisodeToSessionAction(sessionId, selectedId);
            });
          }}
        >
          {isPending ? "Loading..." : "Load Episode"}
        </button>

        <div className="text-xs opacity-70">
          Loads story text + resets timer/encounters/roll prompts for this session.
        </div>
      </div>
    </div>
  );
}
