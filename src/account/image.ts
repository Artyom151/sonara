/** Square-crop and downscale an image file to a JPEG blob (avatars). */
export async function squareImage(file: Blob, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.88));
}

export const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

/** Centre-crop an image file to a wide banner (5:2) and downscale it to a JPEG blob. */
export async function bannerImage(file: Blob, width = 1500): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const ratio = 2.5;
  const sw = Math.min(bmp.width, bmp.height * ratio);
  const sh = sw / ratio;
  const w = Math.min(width, Math.round(sw));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.round(w / ratio);
  c.getContext('2d')!.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85));
}

/** A photo for the banner, downscaled but not cropped: the banner editor picks the frame later. */
export async function photoDataUrl(file: Blob, maxSide = 1800): Promise<string> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.86);
}

/** The duration of a video file in seconds (0 when the browser cannot tell). */
export function videoDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    v.src = url;
  });
}
