"use client";

import { useState } from "react";

const MAX_FILE_BYTES = 6 * 1024 * 1024; // 6MB safety for Server Action payloads.

function human(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SceneAudioUploadInput(props: { name?: string; multiple?: boolean }) {
  const [msg, setMsg] = useState("Upload MP3/audio files. After Save, the file picker clears (normal browser behavior).");
  const name = props.name ?? "scene_audio_files";
  const multiple = props.multiple ?? true;

  return (
    <div className="space-y-1">
      <input
        type="file"
        name={name}
        accept="audio/*,.mp3,.wav,.m4a,.ogg"
        multiple={multiple}
        className="w-full border rounded p-2 text-sm"
        onChange={(e) => {
          try {
            const files = Array.from(e.currentTarget.files ?? []);
            if (!files.length) {
              setMsg("No files selected.");
              return;
            }
            const tooLarge = files.filter((f) => f.size > MAX_FILE_BYTES);
            if (!tooLarge.length) {
              setMsg(`Ready: ${files.length} file(s).`);
              return;
            }
            // Avoid mutating input.files directly (can throw in some browser/runtime combos).
            e.currentTarget.value = "";
            setMsg(
              `One or more files were too large (${tooLarge
                .map((f) => `${f.name} ${human(f.size)}`)
                .join(", ")}). Max ${human(MAX_FILE_BYTES)} per file. Please reselect smaller files.`
            );
          } catch {
            e.currentTarget.value = "";
            setMsg(`Could not validate selected files. Please try smaller audio files (max ${human(MAX_FILE_BYTES)}).`);
          }
        }}
      />
      <div className="text-[11px] text-gray-500">{msg}</div>
    </div>
  );
}
