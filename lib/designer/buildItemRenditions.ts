// lib/designer/buildItemRenditions.ts
import type { CropPixels } from "@/lib/designer/imageRenditions"; // if you already have a CropPixels type, reuse it
import { canvasToWebpBlob, drawCroppedToCanvas, loadImage, resizeCanvas } from "@/lib/designer/imageRenditions";

// If you DON'T have those helpers exported, tell me and I’ll inline them.
// This assumes your NPC pipeline lives in "@/lib/designer/imageRenditions".

export async function buildItemRenditions(file: File, crop: CropPixels) {
  const img = await loadImage(file);
  const cropped = drawCroppedToCanvas(img, crop);

  const large = resizeCanvas(cropped, 512, 512);
  const medium = resizeCanvas(cropped, 256, 256);
  const small = resizeCanvas(cropped, 128, 128);
  const thumb = resizeCanvas(cropped, 64, 64);

  return {
    large: await canvasToWebpBlob(large),
    medium: await canvasToWebpBlob(medium),
    small: await canvasToWebpBlob(small),
    thumb: await canvasToWebpBlob(thumb),
  };
}
