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
}

export const SIZE = 1080;
export const VIDEO_SECONDS = 4;

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
export function drawFrame(ctx: CanvasRenderingContext2D, d: MomentData, phase = 0, elapsed = 0) {
  const W = SIZE;
  ctx.save();
  ctx.fillStyle = '#0b0b10';
  ctx.fillRect(0, 0, W, W);
  if (d.art) {
    // Soft backdrop from the cover itself.
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.filter = 'blur(60px)';
    ctx.drawImage(d.art, -120, -120, W + 240, W + 240);
    ctx.restore();
  }
  // Cover, pulsing a little in the video.
  const cover = 560;
  const pulse = 1 + 0.025 * Math.sin(phase * Math.PI * 2);
  const size = cover * pulse;
  const x = (W - size) / 2;
  const y = 130 + (cover - size) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 50;
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

  // Progress: where the moment is in the track, moving on during the video.
  const bar = { x: 140, y: 930, w: W - 280, h: 10 };
  const pos = Math.min(d.duration || Infinity, d.position + elapsed);
  const p = d.duration > 0 ? Math.min(1, pos / d.duration) : 0;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, bar.w, bar.h, 5);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(bar.x, bar.y, Math.max(bar.h, bar.w * p), bar.h, 5);
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '500 34px system-ui, sans-serif';
  ctx.fillText(fmt(pos), bar.x, 990);
  ctx.textAlign = 'right';
  ctx.fillText(d.duration ? fmt(d.duration) : '', bar.x + bar.w, 990);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '600 30px system-ui, sans-serif';
  ctx.fillText('Sonara', W / 2, 1050);
  ctx.restore();
}

export function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

/** The still as PNG. A tainted canvas (cover from another origin) is redrawn without the cover. */
export async function cardPng(d: MomentData): Promise<Blob | null> {
  const c = makeCanvas();
  const ctx = c.getContext('2d')!;
  drawFrame(ctx, d);
  try {
    return await new Promise<Blob | null>((res) => c.toBlob((b) => res(b), 'image/png'));
  } catch {
    const plain = makeCanvas();
    drawFrame(plain.getContext('2d')!, { ...d, art: null });
    return new Promise((res) => plain.toBlob((b) => res(b), 'image/png'));
  }
}

const VIDEO_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/** A short video of the card, or null where recording is not available. */
export async function cardVideo(d: MomentData): Promise<Blob | null> {
  if (typeof MediaRecorder === 'undefined' || !('captureStream' in HTMLCanvasElement.prototype)) return null;
  const type = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const c = makeCanvas();
  const ctx = c.getContext('2d')!;
  let stream: MediaStream;
  try {
    stream = c.captureStream(30);
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
  const start = performance.now();
  rec.start();
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= VIDEO_SECONDS) return resolve();
      drawFrame(ctx, d, t / 1.6, t);
      requestAnimationFrame(tick);
    };
    tick();
  });
  rec.stop();
  stream.getTracks().forEach((t) => t.stop());
  return done;
}
