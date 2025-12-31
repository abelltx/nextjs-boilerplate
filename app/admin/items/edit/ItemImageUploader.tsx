"use client";

import { useRef, useState } from "react";
import ItemCropModal from "./ItemCropModal";
import { buildNpcRenditions } from "@/lib/designer/imageRenditions"; // reuse the same working pipeline
import { createClient } from "@/utils/supabase/client";
import { itemClearImageMetaAction, itemSetImageMetaAction } from "./actions";

const BUCKET = "item-images";
const FILES = ["portrait.webp", "medium.webp", "small.webp", "thumb.webp"] as const;

type ItemImg = {
  thumbUrl?: string;
  mediumUrl?: string;
  alt?: string;
};

type ItemWithImg = any & {
  // new: server page can attach signed urls here
  _img?: ItemImg;

  // backward-compatible: if you ever pass these directly
  thumbUrl?: string;
  mediumUrl?: string;
};

export default function ItemImageUploader({ item }: { item: ItemWithImg }) {
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
      await itemClearImageMetaAction(item.id);
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
      await uploadRenditions(item.id, renditions);

      setStatus("Saving metadata...");
      await itemSetImageMetaAction(item.id, item.image_alt ?? null);

      window.location.reload();
    } catch (e: any) {
      setStatus(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      setPickedFile(null);
    }
  }

  // ✅ Prefer server-derived signed URLs if provided
  const mediumUrl =
    item?._img?.mediumUrl ??
    item?.mediumUrl ??
    null;

  const thumbUrl =
    item?._img?.thumbUrl ??
    item?.thumbUrl ??
    null;

  const altText =
    item?._img?.alt ??
    item?.image_alt ??
    item?.name ??
    "Item";

  return (
    <div className="flex items-start gap-4">
      <div>
        {mediumUrl || thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={(mediumUrl ?? thumbUrl) as string}
            alt={altText}
            width={167}
            height={215}
            className="rounded-lg border object-cover"
          />
        ) : (
          <div className="h-[215px] w-[167px] rounded-lg border bg-muted/40" />
        )}
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted-foreground">
          Upload any image. You’ll crop it to the portrait ratio, and the system will generate all thumbnails.
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={openPicker}
            className="rounded-lg bg-black px-3 py-2 text-white hover:opacity-90 disabled:opacity-50"
          >
            {item.image_base_path ? "Replace image" : "Upload image"}
          </button>

          <button
            type="button"
            disabled={busy || !item.image_base_path}
            onClick={onRemove}
            className="rounded-lg border px-3 py-2 hover:bg-muted/40 disabled:opacity-50"
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
          <ItemCropModal file={pickedFile} onCancel={() => setPickedFile(null)} onConfirm={onCropConfirm} />
        )}
      </div>
    </div>
  );
}
