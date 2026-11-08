import type { Box } from './types';

export type Shot = { url: string; base64: string; width: number; height: number; bitmap: ImageBitmap };

const toBase64 = (canvas: HTMLCanvasElement, q = 0.85) => canvas.toDataURL('image/jpeg', q).split(',')[1];

function draw(source: CanvasImageSource, sw: number, sh: number, max: number) {
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function shotFromBlob(blob: Blob): Promise<Shot> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return shotFromSource(bitmap, bitmap.width, bitmap.height);
}

// rect is the part of the frame the preview showed (crop + zoom), so the shot matches what the person framed.
export async function shotFromVideo(video: HTMLVideoElement, rect?: { sx: number; sy: number; sw: number; sh: number } | null): Promise<Shot> {
  const bitmap = rect && rect.sw >= 16 && rect.sh >= 16
    ? await createImageBitmap(video, Math.round(rect.sx), Math.round(rect.sy), Math.round(rect.sw), Math.round(rect.sh))
    : await createImageBitmap(video);
  return shotFromSource(bitmap, bitmap.width, bitmap.height);
}

async function shotFromSource(bitmap: ImageBitmap, w: number, h: number): Promise<Shot> {
  const canvas = draw(bitmap, w, h, 1024);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/jpeg', 0.9));
  return { url: URL.createObjectURL(blob), base64: toBase64(canvas), width: canvas.width, height: canvas.height, bitmap };
}

export function cropBox(shot: Shot, box: Box, max = 640, pad = 0.12): { base64: string; dataUrl: string } {
  const [ymin, xmin, ymax, xmax] = box;
  const bw = shot.bitmap.width, bh = shot.bitmap.height;
  const px = ((xmax - xmin) / 1000) * pad, py = ((ymax - ymin) / 1000) * pad;
  const x0 = Math.max(0, xmin / 1000 - px) * bw, y0 = Math.max(0, ymin / 1000 - py) * bh;
  const x1 = Math.min(1, xmax / 1000 + px) * bw, y1 = Math.min(1, ymax / 1000 + py) * bh;
  const sw = Math.max(8, x1 - x0), sh = Math.max(8, y1 - y0);
  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d')!.drawImage(shot.bitmap, x0, y0, sw, sh, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
  return { base64: dataUrl.split(',')[1], dataUrl };
}

