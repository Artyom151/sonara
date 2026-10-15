/**
 * "Share a moment": a square card with the cover, title, artist, the time in the track and a
 * progress bar, as a PNG and as a short video (the cover pulses and the bar moves for a few seconds).
 * Only track metadata is drawn: no lyrics.
 */
export interface MomentData {
  title: string;
  artist: string;
  position: number;
  duration: number;
  art: CanvasImageSource | null;
  /** The chosen part of the track, in seconds (defaults to the position for both). */
  from?: number;
  to?: number;
}

export const SIZE = 1080;
export const VIDEO_SECONDS = 3;
/** Video frames are a ninth of the still's pixels and 12 per second: the recording runs on the device itself, so it must stay light (phones included). */
export const VIDEO_SIZE = SIZE / 3;
export const VIDEO_FPS = 12;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Cover from a URL; null when it cannot be loaded (or would taint the canvas: then no cover). */
export function loadArt(url?: string | null): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

/** One frame. `phase` 0..1 drives the cover pulse; `elapsed` seconds move the progress bar. */
/**
 * Soft backdrop from the cover: the cover drawn tiny and stretched back up, made once per card.
 * (A canvas blur filter on every frame froze the desktop webview.)
 */
export function makeBackdrop(art: CanvasImageSource | null): HTMLCanvasElement | null {
  if (!art) return null;
  const small = document.createElement('canvas');
  small.width = small.height = 24;
  small.getContext('2d')!.drawImage(art, 0, 0, 24, 24);
  const c = makeCanvas();
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.45;
  ctx.drawImage(small, 0, 0, SIZE, SIZE);
  return c;
}

/** `k` scales the whole card (the video is drawn at half size to keep recording light). */
export function drawFrame(ctx: CanvasRenderingContext2D, d: MomentData, phase = 0, elapsed = 0, backdrop: HTMLCanvasElement | null = null, k = 1) {
  const W = SIZE;
  ctx.save();
  ctx.scale(k, k);
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(0, 0, W, W);
  if (backdrop) ctx.drawImage(backdrop, 0, 0);
  // Cover, pulsing a little in the video.
  const cover = 560;
  const pulse = 1 + 0.025 * Math.sin(phase * Math.PI * 2);
  const size = cover * pulse;
  const x = (W - size) / 2;
  const y = 130 + (cover - size) / 2;
  // A hard dark plate under the cover instead of a blurred shadow (blur per frame is what hangs).
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 16, size, size, 36);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 36);
  ctx.fillStyle = '#222';
  ctx.fill();
  ctx.clip();
  if (d.art) ctx.drawImage(d.art, x, y, size, size);
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '700 58px system-ui, sans-serif';
  ctx.fillText(ellipsize(ctx, d.title, W - 160), W / 2, 790);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '400 40px system-ui, sans-serif';
  ctx.fillText(ellipsize(ctx, d.artist, W - 160), W / 2, 850);

  // The track's timeline: the chosen part is bright, and a knob moves through it during the video.
  const from = d.from ?? d.position;
  const to = Math.max(from, d.to ?? from);
  const total = d.duration > 0 ? d.duration : Math.max(to, 1);
  const bar = { x: 140, y: 930, w: W - 280, h: 10 };
  const at = (s: number) => bar.x + bar.w * Math.min(1, s / total);
  const cur = Math.min(to, from + (to - from) * Math.min(1, elapsed / VIDEO_SECONDS));
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(at(from), bar.y, Math.max(bar.h, at(to) - at(from)), bar.h, 5);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(at(cur), bar.y + bar.h / 2, 11, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 34px system-ui, sans-serif';
  ctx.fillText(fmt(from), bar.x, 990);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(to), bar.x + bar.w, 990);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText('Sonara', W / 2, 1050);
  ctx.restore();
}

export function makeCanvas(size = SIZE): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** The still as PNG. A tainted canvas (cover from another origin) is redrawn without the cover. */
export async function cardPng(d: MomentData): Promise<Blob | null> {
  const c = makeCanvas();
  drawFrame(c.getContext('2d')!, d, 0, 0, makeBackdrop(d.art));
  try {
    return await withTimeout(new Promise<Blob | null>((res) => c.toBlob((b) => res(b), 'image/png')), 10_000);
  } catch {
    const plain = makeCanvas();
    drawFrame(plain.getContext('2d')!, { ...d, art: null });
    return withTimeout(new Promise<Blob | null>((res) => plain.toBlob((b) => res(b), 'image/png')), 10_000);
  }
}

/** Rejects after `ms`: a stuck recorder or encoder must not hang the share. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e) => (clearTimeout(id), reject(e)),
    );
  });
}

const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/** A short video of the card, or null where recording is not available or does not finish. */
export async function cardVideo(d: MomentData): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
  const type = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const c = makeCanvas(VIDEO_SIZE);
  const ctx = c.getContext('2d')!;
  const backdrop = makeBackdrop(d.art);
  let stream: MediaStream;
  try {
    stream = c.captureStream(VIDEO_FPS);
  } catch {
    return null;
  }
  const rec = new MediaRecorder(stream, { mimeType: type });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<Blob>((res, rej) => {
    rec.onstop = () => res(new Blob(chunks, { type: type.split(';')[0] }));
    rec.onerror = () => rej(new Error('recording failed'));
  });
  // A timer, not requestAnimationFrame: the frames keep coming while the window is in the background.
  const start = performance.now();
  rec.start();
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= VIDEO_SECONDS) return resolve();
      drawFrame(ctx, d, t / 1.6, t, backdrop, VIDEO_SIZE / SIZE);
      setTimeout(frame, 1000 / VIDEO_FPS);
    };
    frame();
  });
  console.info('[moment] frames drawn, stopping the recorder');
  rec.stop();
  stream.getTracks().forEach((t) => t.stop());
  return withTimeout(done, 5_000).catch((e) => {
    console.warn('[moment] recorder did not finish:', e);
    return null;
  });
}
