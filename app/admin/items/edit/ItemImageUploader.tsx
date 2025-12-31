"use client";

import { useRef, useState } from "react";
import ItemCropModal from "@/app/admin/items/edit/ItemCropModal";
import { buildItemRenditions } from "@/lib/designer/buildItemRenditions";
import { createClient } from "@/utils/supabase/client";
import {
  itemClearImageAction,
  itemSetImageAction,
} from "@/app/admin/items/edit/actions";

const BUCKET = "item-images";
const FILES = ["large.webp", "medium.webp", "small.webp", "thumb.webp"] as const;

export default function ItemImageUploader({ item }: { item: any }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");

  function openPicker() {
    inputRef.current?.click();
  }

  async function uploadRenditions(itemId: string, renditions: Record<string, Blob>) {
    const supabase = createClient();
    const base = `${itemId}/`;

    const uploads = FILES.map((f) =>
      supabase.storage.from(BUCKET).upload(base + f, renditions[f.replace(".webp", "")], {
        upsert: true,
        contentType: "image/webp",
      })
    );

    const results = await Promise.all(uploads);
    const firstErr = results.find((r) => r.error)?.error;
    if (firstErr) throw new Error(firstErr.message);
  }

  async function deleteRenditions(itemId: string) {
    const supabase = createClient();
    const base = `${itemId}/`;
    const paths = FILES.map((f) => base + f);
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) throw new Error(error.message);
  }

  async function onRemove() {
    setBusy(true);
    setStatus("Removing image...");
    try {
      await deleteRenditions(item.id);
      await itemClearImageAction(item.id);
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

  async function onCropConfirm(pixels: any) {
    if (!pickedFile) return;

    setBusy(true);
    setStatus("Cropping + generating thumbnails...");
    try {
      const renditions = await buildItemRenditions(pickedFile, pixels);
      setStatus("Uploading to Storage...");
      await uploadRenditions(item.id, renditions);
      setStatus("Saving image...");
      await itemSetImageAction(item.id);
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
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="h-40 w-40 rounded-2xl border object-cover"
          />
        ) : (
          <div className="h-40 w-40 rounded-2xl border bg-muted/40" />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Upload any image. You’ll crop it square and the system will generate all thumbnails.
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className="px-3 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
          >
            {item.image_url ? "Replace image" : "Upload image"}
          </button>

          <button
            type="button"
            disabled={busy || !item.image_url}
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
          <ItemCropModal
            file={pickedFile}
            onCancel={() => setPickedFile(null)}
            onConfirm={onCropConfirm}
          />
        )}
      </div>
    </div>
  );
}
