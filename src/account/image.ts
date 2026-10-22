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
