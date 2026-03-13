"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Track = { id: string; title: string; url: string };

export default function SceneAudioPlayer(props: {
  sceneId: string;
  tracks: Track[];
}) {
  const tracks = useMemo(
    () =>
      (props.tracks ?? [])
        .map((t) => ({
          id: String(t?.id ?? ""),
          title: String(t?.title ?? "").trim() || "Track",
          url: String(t?.url ?? "").trim(),
        }))
        .filter((t) => t.id && t.url),
    [props.tracks]
  );
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIdx(0);
    setPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [props.sceneId]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      void a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  }, [playing, idx]);

  if (!tracks.length) return null;
  const current = tracks[Math.max(0, Math.min(idx, tracks.length - 1))];

  return (
    <div className="rounded border bg-white p-2 space-y-2">
      <div className="text-[11px] uppercase text-gray-500">Scene Music</div>
      <div className="text-xs font-semibold truncate">{current.title}</div>
      <audio
        ref={audioRef}
        src={current.url}
        preload="none"
        onEnded={() => {
          if (idx < tracks.length - 1) {
            setIdx((v) => Math.min(tracks.length - 1, v + 1));
            setPlaying(true);
          } else {
            setPlaying(false);
          }
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => setPlaying((v) => !v)}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => {
            setIdx((v) => Math.max(0, v - 1));
            setPlaying(false);
          }}
          disabled={idx <= 0}
        >
          Prev
        </button>
        <button
          type="button"
          className="rounded border px-2 py-1 text-xs"
          onClick={() => {
            setIdx((v) => Math.min(tracks.length - 1, v + 1));
            setPlaying(false);
          }}
          disabled={idx >= tracks.length - 1}
        >
          Next
        </button>
        <span className="text-[11px] text-gray-600">
          {idx + 1}/{tracks.length}
        </span>
      </div>
      <div className="text-[11px] text-gray-500 truncate">{current.url}</div>
    </div>
  );
}

