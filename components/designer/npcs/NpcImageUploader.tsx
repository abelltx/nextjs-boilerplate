"use client";

import { useRef, useState } from "react";
import NpcCropModal from "./NpcCropModal";
import { buildNpcRenditions } from "@/lib/designer/imageRenditions";
import { createClient } from "@/utils/supabase/client";
import { npcClearImageMetaAction, npcSetImageMetaAction } from "@/app/actions/npcs";

const BUCKET = "npc-images";
const FILES = ["portrait.webp", "medium.webp", "small.webp", "thumb.webp"] as const;

export default function NpcImageUploader({ npc }: { npc: any }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");

  function openPicker() {
    inputRef.current?.click();
  }

  async function uploadRenditions(npcId: string, renditions: Record<string, Blob>) {
    const supabase = createClient();
    const base = `${npcId}/`;

    const uploads = [
      supabase.storage.from(BUCKET).upload(base + "portrait.webp", renditions.portrait, {
        upsert: true,
        contentType: "image/webp",
      }),
      supabase.storage.from(BUCKET).upload(base + "medium.webp", renditions.medium, {
        upsert: true,
        contentType: "image/webp",
      }),
      supabase.storage.from(BUCKET).upload(base + "small.webp", renditions.small, {
        upsert: true,
        contentType: "image/webp",
      }),
      supabase.storage.from(BUCKET).upload(base + "thumb.webp", renditions.thumb, {
        upsert: true,
        contentType: "image/webp",
      }),
    ];

    const results = await Promise.all(uploads);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw new Error(firstErr.message);
  }

  async function deleteRenditions(npcId: string) {
    const supabase = createClient();
    const base = `${npcId}/`;
    const paths = FILES.map((f) => base + f);

    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    // If files don’t exist yet, Supabase can still return ok; if it errors, show it.
    if (error) throw new Error(error.message);
  }

  async function onRemove() {
    setBusy(true);
    setStatus("Removing image...");
    try {
      await deleteRenditions(npc.id);
      await npcClearImageMetaAction(npc.id);
      window.location.reload();
    } catch (e: any) {
      setStatus(e?.message ?? "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  function onFilePicked(f: File | null) {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }
    setStatus("");
    setPickedFile(f);
  }

  async function onCropConfirm(pixels: { x: number; y: number; width: number; height: number }) {
    if (!pickedFile) return;

    setBusy(true);
    setStatus("Cropping + generating thumbnails...");
    try {
      const renditions = await buildNpcRenditions(pickedFile, pixels);

      setStatus("Uploading to Storage...");
      await uploadRenditions(npc.id, renditions);

      setStatus("Saving metadata...");
      // Uses npcId/ as image_base_path, updates image_updated_at
      await npcSetImageMetaAction(npc.id, npc.image_alt ?? null);

      window.location.reload();
    } catch (e: any) {
      setStatus(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setPickedFile(null);
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div>
        {npc.mediumUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={npc.mediumUrl}
            alt={npc.image_alt ?? npc.name}
            width={167}
            height={215}
            className="rounded-lg border object-cover"
          />
        ) : (
          <div className="w-[167px] h-[215px] rounded-lg border bg-muted/40" />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Upload any image. You’ll crop it to the NPC portrait ratio, and the system will generate all thumbnails.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className="px-3 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {npc.image_base_path ? "Replace image" : "Upload image"}
          </button>

          <button
            type="button"
            disabled={busy || !npc.image_base_path}
            onClick={onRemove}
            className="px-3 py-2 rounded-lg border hover:bg-muted/40 disabled:opacity-50"
          >
            Remove image
          </button>
        </div>

        {status && <div className="text-sm">{status}</div>}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFilePicked(e.target.files?.[0] ?? null)}
        />

        {pickedFile && (
          <NpcCropModal
            file={pickedFile}
            onCancel={() => setPickedFile(null)}
            onConfirm={onCropConfirm}
          />
        )}
      </div>
    </div>
  );
}
