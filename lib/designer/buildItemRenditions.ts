// lib/designer/buildItemRenditions.ts
export type CropPixels = { x: number; y: number; width: number; height: number };

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Failed to load image"));
    });
    return img;
  } finally {
    // NOTE: we revoke later after draw to avoid race conditions
  }
}

function drawCroppedToCanvas(img: HTMLImageElement, crop: CropPixels) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(crop.width));
  canvas.height = Math.max(1, Math.floor(crop.height));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

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

function resizeCanvas(src: HTMLCanvasElement, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);

  return canvas;
}

async function canvasToWebpBlob(canvas: HTMLCanvasElement, quality = 0.9): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode webp"))),
      "image/webp",
      quality
    );
  });
}

// Match your NPC sizes, unless you want different item sizes.
export async function buildItemRenditions(file: File, crop: CropPixels) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(file);
    img.src = url;

    const cropped = drawCroppedToCanvas(img, crop);

    const portrait = resizeCanvas(cropped, 334, 430);
    const medium = resizeCanvas(cropped, 167, 215);
    const small = resizeCanvas(cropped, 112, 144);
    const thumb = resizeCanvas(cropped, 56, 72);

    return {
      portrait: await canvasToWebpBlob(portrait),
      medium: await canvasToWebpBlob(medium),
      small: await canvasToWebpBlob(small),
      thumb: await canvasToWebpBlob(thumb),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
