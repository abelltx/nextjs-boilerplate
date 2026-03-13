"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Track = { title: string; url: string };

function safeName(name: string) {
  return String(name || "track.mp3").replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default function SceneAudioUploaderClient(props: {
  episodeId: string;
  initialTracks?: Track[];
  inputName?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tracks, setTracks] = useState<Track[]>(
    Array.isArray(props.initialTracks)
      ? props.initialTracks
          .map((t) => ({ title: String(t?.title ?? "").trim() || "Track", url: String(t?.url ?? "").trim() }))
          .filter((t) => t.url)
      : []
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("Upload audio directly to Supabase, then Save Scene.");
  const hiddenName = props.inputName ?? "scene_audio_urls";

  async function uploadFiles(files: FileList | null) {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    setBusy(true);
    setMsg(`Uploading ${list.length} file(s)...`);
    const added: Track[] = [];
    for (const file of list) {
      try {
        if (!file.size || file.size <= 0) continue;
        const path = `episode-audio/${props.episodeId}/${Date.now()}-${safeName(file.name)}`;
        const { error } = await supabase.storage.from("episode-assets").upload(path, file, {
          upsert: true,
          contentType: file.type || "audio/mpeg",
        });
        if (error) {
          setMsg(`Upload failed: ${error.message}`);
          continue;
        }
        const { data: pub } = supabase.storage.from("episode-assets").getPublicUrl(path);
        const url = String(pub?.publicUrl ?? "").trim();
        if (!url) continue;
        added.push({ title: file.name || `Track ${tracks.length + added.length + 1}`, url });
      } catch (e: any) {
        setMsg(`Upload error: ${String(e?.message ?? e)}`);
      }
    }
    setTracks((prev) => [...prev, ...added]);
    setBusy(false);
    setMsg(added.length ? `Uploaded ${added.length} track(s). Click Save Scene.` : "No tracks uploaded.");
  }

  const hiddenValue = tracks.map((t) => t.url).join("\n");

  return (
    <div className="rounded border p-2 space-y-2">
      <div className="text-xs uppercase text-gray-500">Scene Music (ST only)</div>
      <input
        type="file"
        accept="audio/*,.mp3,.wav,.m4a,.ogg"
        multiple
        className="w-full border rounded p-2 text-sm"
        disabled={busy}
        onChange={(e) => {
          void uploadFiles(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
      />
      <div className="text-[11px] text-gray-500">{msg}</div>

      {tracks.length ? (
        <div className="rounded border bg-gray-50 p-2 space-y-1">
          <div className="text-[11px] uppercase text-gray-500">Current Tracks</div>
          {tracks.map((t, i) => (
            <div key={`${t.url}-${i}`} className="flex items-center justify-between gap-2 text-xs">
              <div className="truncate">
                {i + 1}. {t.title}
              </div>
              <button
                type="button"
                className="rounded border px-2 py-0.5"
                onClick={() => setTracks((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-gray-500">No tracks yet.</div>
      )}

      <input type="hidden" name={hiddenName} value={hiddenValue} />
    </div>
  );
}

