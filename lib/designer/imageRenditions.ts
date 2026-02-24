export type CropPixels = { x: number; y: number; width: number; height: number };

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load image"));
  });

  URL.revokeObjectURL(url);
  return img;
}

function drawCroppedToCanvas(img: HTMLImageElement, crop: CropPixels): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(crop.width);
  canvas.height = Math.round(crop.height);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(
    img,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas;
}

function resizeCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);

  return canvas;
}

async function canvasToWebpBlob(canvas: HTMLCanvasElement, quality = 0.86): Promise<Blob> {
  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/webp", quality)
  );

  if (blob) return blob;

  // fallback (rare)
  const fallback: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );

  if (!fallback) throw new Error("Failed to export image blob");
  return fallback;
}

function drawFullToCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth || img.width));
  canvas.height = Math.max(1, Math.round(img.naturalHeight || img.height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function buildNpcRenditions(file: File, crop: CropPixels) {
  const img = await loadImage(file);
  const full = drawFullToCanvas(img);
  const cropped = drawCroppedToCanvas(img, crop);

  // Portrait preserves the chosen face crop pixels (no downscale).
  const portrait = cropped;
  // Generate smaller renditions from portrait for cards/lists.
  const medium = resizeCanvas(cropped, 334, 430);
  const small = resizeCanvas(cropped, 167, 215);
  const thumb = resizeCanvas(cropped, 56, 72);

  return {
    full: await canvasToWebpBlob(full, 0.94),
    portrait: await canvasToWebpBlob(portrait, 0.92),
    medium: await canvasToWebpBlob(medium, 0.9),
    small: await canvasToWebpBlob(small, 0.88),
    thumb: await canvasToWebpBlob(thumb, 0.86),
  };
}

export async function buildItemRenditions(file: File, crop: CropPixels) {
  const img = await loadImage(file);
  const full = drawFullToCanvas(img);
  const cropped = drawCroppedToCanvas(img, crop);

  const squareMedium = resizeCanvas(cropped, 334, 334);
  const squareSmall = resizeCanvas(cropped, 167, 167);
  const squareThumb = resizeCanvas(cropped, 72, 72);

  return {
    full: await canvasToWebpBlob(full, 0.94),
    portrait: await canvasToWebpBlob(squareMedium, 0.92),
    medium: await canvasToWebpBlob(squareMedium, 0.9),
    small: await canvasToWebpBlob(squareSmall, 0.88),
    thumb: await canvasToWebpBlob(squareThumb, 0.86),
  };
}
