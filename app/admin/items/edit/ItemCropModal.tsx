"use client";

import Cropper from "react-easy-crop";
import { useMemo, useState } from "react";

type Crop = { x: number; y: number };
type Area = { x: number; y: number; width: number; height: number };

export default function ItemCropModal({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (pixels: Area) => void;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const [crop, setCrop] = useState<Crop>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);

  // Same portrait ratio as NPC (334/430). Change later if you want square items.
  const aspect = 334 / 430;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-background rounded-xl overflow-hidden border shadow-xl">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="font-semibold">Crop Item Image</div>
          <button className="px-3 py-1 rounded-lg border hover:bg-muted/40" onClick={onCancel}>
            Close
          </button>
        </div>

        <div className="relative w-full" style={{ height: 520 }}>
          <Cropper
            image={url}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixels) => setCropPixels(pixels)}
            objectFit="horizontal-cover"
          />
        </div>

        <div className="p-4 border-t space-y-3">
          <div className="flex items-center gap-3">
            <div className="text-sm text-muted-foreground w-16">Zoom</div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button className="px-3 py-2 rounded-lg border hover:bg-muted/40" onClick={onCancel}>
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-black text-white hover:opacity-90 disabled:opacity-50"
              disabled={!cropPixels}
              onClick={() => cropPixels && onConfirm(cropPixels)}
            >
              Save Crop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
