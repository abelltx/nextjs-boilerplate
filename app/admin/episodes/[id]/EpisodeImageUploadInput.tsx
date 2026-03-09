"use client";

import { useState } from "react";

const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;
const MAX_DIMENSION = 2200;

function humanBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function EpisodeImageUploadInput(props: { name?: string }) {
  const [hint, setHint] = useState<string>("Tip: large images are auto-compressed before upload.");
  const name = props.name ?? "image_file";

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setHint("Selected file is not an image.");
      return;
    }

    if (file.size <= MAX_UPLOAD_BYTES) {
      setHint(`Using original file (${humanBytes(file.size)}).`);
      return;
    }

    try {
      const img = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No 2D context");
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/webp", 0.82)
      );
      if (!blob) throw new Error("Compression failed");

      if (blob.size >= file.size) {
        setHint(
          `Could not reduce file enough (${humanBytes(file.size)}). Use Image URL field for very large images.`
        );
        return;
      }

      const out = new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp", { type: "image/webp" });
      const dt = new DataTransfer();
      dt.items.add(out);
      input.files = dt.files;
      setHint(`Compressed ${humanBytes(file.size)} -> ${humanBytes(out.size)} (webp).`);
    } catch {
      setHint("Compression failed. Try a smaller file or use Image URL.");
    }
  }

  return (
    <div className="space-y-1">
      <input name={name} type="file" accept="image/*" className="w-full border rounded p-2" onChange={handleChange} />
      <div className="text-[11px] text-gray-500">{hint}</div>
    </div>
  );
}

