import { isCapacitor } from '../../platform';
import { currentTier } from '../../platform/perf';
import { FRAGMENT, VERTEX } from './shaders';

/**
 * Liquid glass runtime.
 *
 * Every element with the `.glass` class gets a backdrop layer (`.lg-layer`) and two
 * pseudo-element overlays. The ported shader (shaders.ts) is rendered once per unique
 * size/parameter set into four maps, which are cached and shared between elements:
 *
 *   mask   → .lg-layer mask-image (shape alpha incl. outer rim)
 *   disp   → feDisplacementMap   ┐
 *   tint   → feComposite arithmetic: mix(blurred, tint, a)          ├ backdrop-filter: blur(B) url(#lg-N)
 *   light  → feComposite arithmetic: + lightAdd − shadeSub          ┘ (Chromium: the whole main() runs here)
 *   light2 → .glass::before overlay — fallback for engines without SVG backdrop filters
 * No mix-blend-mode is used: blend modes isolate the group and would hide the backdrop.
 *
 * Per-element parameters come from CSS custom properties:
 *   --lg-strength  glass.x  refraction strength (framebuffer px)
 *   --lg-wave      glass.y  wave scale
 *   --lg-edge      glass.z  rim width (CSS px)
 *   --lg-depth     glass.w  rim light/shade strength
 *   --lg-alpha     screen.w global alpha
 *   --lg-blur      backdrop blur radius (CSS px)
 *   --lg-tint      tint colour incl. alpha (painted as the layer background)
 *   --lg-cuts      "tl tr br bl" corner cuts (CSS px)
 * Corner radii are read from the element's computed border-radius.
 */

interface Params {
  tint: [number, number, number, number];
  w: number;
  h: number;
  radii: [number, number, number, number];
  cuts: [number, number, number, number];
  strength: number;
  wave: number;
  edge: number;
  depth: number;
  alpha: number;
}

interface Maps {
  mask: string;
  disp: string;
  light: string;
  combined: string;
  dispScale: number;
  pad: number;
  qw: number;
  qh: number;
  filterId: string;
  refs: number;
}

const supportsRefraction = /Chrome\/|Edg\//.test(navigator.userAgent);
/**
 * Desktop WebKit (Linux WebKitGTK, macOS): backdrop-filter cannot run SVG filters, but a plain CSS
 * filter can. The shader's refraction is therefore applied to the content *under* the floating
 * glass (the visible tab stack): blur + displacement map + shape mask inside each glass rect.
 */
// Off: in a real WebKitGTK window (GPU compositing) the CSS filter is dropped on the tab stack,
// which holds composited layers (WebGL canvases); it only renders in software snapshots.
const CONTENT_REFRACTION_ENABLED = false;
const contentRefraction = CONTENT_REFRACTION_ENABLED && !supportsRefraction && !isCapacitor && matchMedia('(pointer: fine)').matches;
/** Glass that floats over the tab stack (not inside it) and gets content refraction. */
const OVERLAY_GLASS = '.pbar, .tabbar, .mini, .handoff';
/** Map resolution cap: the maps are smooth gradients, 1x is visually identical on phones. */
const maxDpr = () => (currentTier() === 'high' ? 2 : 1);

/** Which elements get the full shader treatment for the current graphics tier. */
const KEY_GLASS = '.refract, .ctl-main, .tabbar, .mini, .pbar, .menu, .alert';
const LOW_GLASS = '.tabbar, .mini, .pbar';
function wantsShader(el: HTMLElement) {
  const tier = currentTier();
  if (tier === 'high') return true;
  if (tier === 'balanced') return el.matches(KEY_GLASS);
  // Battery saver: only the always-visible bars keep the real shader; maps are rendered at 1x and
  // the SVG filter is paused while scrolling (see pauseRefractionWhileScrolling).
  return el.matches(LOW_GLASS);
}

let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let ubo: WebGLBuffer | null = null;
let uMode: WebGLUniformLocation | null = null;
let uDispScale: WebGLUniformLocation | null = null;
let canvas: HTMLCanvasElement | null = null;
let defs: SVGDefsElement | null = null;

const cache = new Map<string, Promise<Maps>>();
const resolved = new Map<string, Maps>();
const state = new WeakMap<HTMLElement, { key?: string; layer: HTMLElement | null; ro: ResizeObserver }>();
let filterSeq = 0;
/** Unique per module instance: after a hot reload the old <filter> elements may still be in the
 *  document, and a repeated id would resolve to a stale map of another element's size. */
const ID_PREFIX = Math.random().toString(36).slice(2, 8);

function initGl(): boolean {
  if (gl) return true;
  canvas = document.createElement('canvas');
  const ctx = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!ctx) return false;
  const compile = (type: number, src: string) => {
    const s = ctx.createShader(type)!;
    ctx.shaderSource(s, src);
    ctx.compileShader(s);
    if (!ctx.getShaderParameter(s, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(s) ?? 'shader error');
    return s;
  };
  try {
    const p = ctx.createProgram()!;
    ctx.attachShader(p, compile(ctx.VERTEX_SHADER, VERTEX));
    ctx.attachShader(p, compile(ctx.FRAGMENT_SHADER, FRAGMENT));
    ctx.linkProgram(p);
    if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(p) ?? 'link error');
    program = p;
  } catch (e) {
    console.warn('[liquid-glass]', e);
    return false;
  }
  ctx.useProgram(program);
  const block = ctx.getUniformBlockIndex(program!, 'BlurData');
  ctx.uniformBlockBinding(program!, block, 0);
  ubo = ctx.createBuffer();
  ctx.bindBuffer(ctx.UNIFORM_BUFFER, ubo);
  ctx.bufferData(ctx.UNIFORM_BUFFER, 160, ctx.DYNAMIC_DRAW);
  ctx.bindBufferBase(ctx.UNIFORM_BUFFER, 0, ubo);
  uMode = ctx.getUniformLocation(program!, 'uMode');
  uDispScale = ctx.getUniformLocation(program!, 'uDispScale');
  // Sampler0 is the backdrop on desktop; on the web CSS samples it, so bind a neutral texel.
  const tex = ctx.createTexture();
  ctx.bindTexture(ctx.TEXTURE_2D, tex);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
  ctx.uniform1i(ctx.getUniformLocation(program!, 'Sampler0'), 0);
  ctx.enable(ctx.BLEND);
  ctx.blendFunc(ctx.ONE, ctx.ZERO);
  gl = ctx;
  return true;
}

function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

const toBlobUrl = (c: HTMLCanvasElement) =>
  new Promise<string>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('toBlob failed'))), 'image/png'),
  );

// All elements share one WebGL canvas and each map is read back asynchronously (toBlob), so
// renders must not interleave: a concurrent render would resize the canvas mid-way and hand one
// element another element's maps (a stretched ghost of a foreign rim inside the glass).
let renderQueue: Promise<unknown> = Promise.resolve();
function renderMaps(p: Params): Promise<Maps> {
  const run = renderQueue.then(() => renderMapsNow(p));
  renderQueue = run.catch(() => {});
  return run;
}

async function renderMapsNow(p: Params): Promise<Maps> {
  const ctx = gl!;
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr());
  // Largest possible offset of glassDistortion in CSS px (|wave| ≤ √2·1.35, |lens| ≤ 2.25).
  const dispScale = Math.max(1, ((p.strength * (1.35 * Math.SQRT2 + 2.25)) / dpr) * 2);
  // The desktop shader samples the whole framebuffer; a CSS backdrop filter only sees its own
  // box. Grow the layer by the rim and the maximum displacement so edge samples stay inside it.
  const pad = Math.ceil(Math.max(p.edge, 0) * 2) + 1 + Math.ceil(dispScale / 2);
  const qw = p.w + pad * 2;
  const qh = p.h + pad * 2;
  const fbw = Math.max(1, Math.round(qw * dpr));
  const fbh = Math.max(1, Math.round(qh * dpr));
  canvas!.width = fbw;
  canvas!.height = fbh;
  ctx.viewport(0, 0, fbw, fbh);


  // std140 BlurData: 10 × vec4
  const data = new Float32Array([
    0, 0, qw, qh, // rect
    qw, qh, dpr, p.alpha, // screen: size, guiScale, global alpha (blurRadius slot)
    fbw, fbh, 0, 0, // framebufferSize
    ...p.radii, // radii tl tr br bl
    ...p.cuts, // cuts tl tr br bl
    ...p.tint, // color
    p.strength, p.wave, p.edge, p.depth, // glassData
    pad, pad, p.w, p.h, // blobRect0
    pad, pad, p.w, p.h, // blobRect1
    1, 0, 0, 0, // blobData: single shape
  ]);
  ctx.bindBuffer(ctx.UNIFORM_BUFFER, ubo);
  ctx.bufferSubData(ctx.UNIFORM_BUFFER, 0, data);
  ctx.uniform1f(uDispScale, dispScale);

  const out: string[] = [];
  for (const mode of [0, 1, 2, 3]) {
    const neutral = mode === 1 || mode === 3;
    ctx.clearColor(neutral ? 0.5 : 0, neutral ? 0.5 : 0, neutral ? 0.5 : 0, neutral ? 1 : 0);
    ctx.clear(ctx.COLOR_BUFFER_BIT);
    ctx.uniform1i(uMode, mode);
    ctx.drawArrays(ctx.TRIANGLES, 0, 6);
    out.push(await toBlobUrl(canvas!));
  }

  const filterId = `lg-${ID_PREFIX}-${++filterSeq}`;
  if (supportsRefraction) {
    const NS = 'http://www.w3.org/2000/svg';
    const f = document.createElementNS(NS, 'filter');
    f.setAttribute('id', filterId);
    f.setAttribute('filterUnits', 'userSpaceOnUse');
    f.setAttribute('primitiveUnits', 'userSpaceOnUse');
    f.setAttribute('x', '0');
    f.setAttribute('y', '0');
    f.setAttribute('width', String(qw));
    f.setAttribute('height', String(qh));
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const img = document.createElementNS(NS, 'feImage');
    img.setAttribute('href', out[1]);
    img.setAttribute('x', '0');
    img.setAttribute('y', '0');
    img.setAttribute('width', String(qw));
    img.setAttribute('height', String(qh));
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('result', 'map');
    const dm = document.createElementNS(NS, 'feDisplacementMap');
    dm.setAttribute('in', 'SourceGraphic');
    dm.setAttribute('in2', 'map');
    dm.setAttribute('scale', String(dispScale));
    dm.setAttribute('xChannelSelector', 'R');
    dm.setAttribute('yChannelSelector', 'G');
    dm.setAttribute('result', 'refracted');
    // mix(blurred, tintColor.rgb, tintColor.a)
    const flood = document.createElementNS(NS, 'feFlood');
    flood.setAttribute('flood-color', `rgb(${p.tint.slice(0, 3).map((c) => Math.round(c * 255)).join(' ')})`);
    flood.setAttribute('result', 'tint');
    const mix = document.createElementNS(NS, 'feComposite');
    mix.setAttribute('in', 'refracted');
    mix.setAttribute('in2', 'tint');
    mix.setAttribute('operator', 'arithmetic');
    mix.setAttribute('k2', String(1 - p.tint[3]));
    mix.setAttribute('k3', String(p.tint[3]));
    mix.setAttribute('result', 'tinted');
    // finalColor += lightAdd; finalColor -= shadeSub  (map stores 0.5 + add − sub)
    const lightImg = document.createElementNS(NS, 'feImage');
    lightImg.setAttribute('href', out[3]);
    lightImg.setAttribute('x', '0');
    lightImg.setAttribute('y', '0');
    lightImg.setAttribute('width', String(qw));
    lightImg.setAttribute('height', String(qh));
    lightImg.setAttribute('preserveAspectRatio', 'none');
    lightImg.setAttribute('result', 'light');
    const add = document.createElementNS(NS, 'feComposite');
    add.setAttribute('in', 'tinted');
    add.setAttribute('in2', 'light');
    add.setAttribute('operator', 'arithmetic');
    add.setAttribute('k2', '1');
    add.setAttribute('k3', '1');
    add.setAttribute('k4', '-0.5');
    f.append(img, dm, flood, mix, lightImg, add);
    ensureDefs().appendChild(f);
  }

  return { mask: out[0], disp: out[1], light: out[2], combined: out[3], dispScale, pad, qw, qh, filterId, refs: 0 };
}

const num = (v: string, d: number) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

let probe: HTMLElement | null = null;
/** Resolve any CSS colour (rgb(), color-mix(), var()) to linear 0..1 RGBA. */
function parseColor(value: string): [number, number, number, number] {
  if (!probe) {
    probe = document.createElement('i');
    probe.style.display = 'none';
    document.body.appendChild(probe);
  }
  probe.style.color = '';
  probe.style.color = value;
  const c = getComputedStyle(probe).color;
  const n = (c.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
  if (c.startsWith('color(')) return [n[0] ?? 1, n[1] ?? 1, n[2] ?? 1, n[3] ?? 1];
  return [(n[0] ?? 255) / 255, (n[1] ?? 255) / 255, (n[2] ?? 255) / 255, n[3] ?? 1];
}

function readParams(el: HTMLElement): Params {
  const cs = getComputedStyle(el);
  const w = Math.round(el.offsetWidth);
  const h = Math.round(el.offsetHeight);
  const r = (v: string) => Math.min(num(v, 0), Math.min(w, h) / 2);
  const cuts = (cs.getPropertyValue('--lg-cuts').trim() || '0 0 0 0').split(/\s+/).map((x) => num(x, 0));
  return {
    tint: parseColor(cs.getPropertyValue('--lg-tint').trim() || 'rgb(255 255 255 / 0.04)'),
    w,
    h,
    radii: [r(cs.borderTopLeftRadius), r(cs.borderTopRightRadius), r(cs.borderBottomRightRadius), r(cs.borderBottomLeftRadius)],
    cuts: [cuts[0] ?? 0, cuts[1] ?? 0, cuts[2] ?? 0, cuts[3] ?? 0],
    strength: num(cs.getPropertyValue('--lg-strength'), 10),
    wave: num(cs.getPropertyValue('--lg-wave'), 8),
    edge: num(cs.getPropertyValue('--lg-edge'), 1.5),
    depth: num(cs.getPropertyValue('--lg-depth'), 1),
    alpha: num(cs.getPropertyValue('--lg-alpha'), 1),
  };
}

const keyOf = (p: Params) =>
  [maxDpr(), ...p.tint.map((x) => x.toFixed(3)), p.w, p.h, ...p.radii.map((x) => x.toFixed(1)), ...p.cuts, p.strength, p.wave, p.edge, p.depth, p.alpha].join('|');

function release(key?: string) {
  if (!key) return;
  const m = resolved.get(key);
  if (!m || --m.refs > 0) return;
  // Keep a small pool: identical elements come and go (rows, sheets).
  setTimeout(() => {
    if (m.refs > 0) return;
    cache.delete(key);
    resolved.delete(key);
    for (const u of [m.mask, m.disp, m.light, m.combined]) URL.revokeObjectURL(u);
    document.getElementById(m.filterId)?.remove();
  }, 10_000);
}

let queue = new Set<HTMLElement>();
let scheduled = false;
const schedule = (el: HTMLElement) => {
  queue.add(el);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flush);
};

async function flush() {
  scheduled = false;
  const items = [...queue];
  queue = new Set();
  // One failing element must not stall the rest of the queue.
  for (const el of items) await apply(el).catch((e) => console.warn('[liquid-glass]', e));
}

async function apply(el: HTMLElement) {
  const st = state.get(el);
  if (!st || !el.isConnected) return;
  const p = readParams(el);
  if (p.w < 2 || p.h < 2) return;
  const key = keyOf(p);
  if (key === st.key) return;
  if (!cache.has(key)) {
    cache.set(
      key,
      renderMaps(p)
        .then((m) => (resolved.set(key, m), m))
        .catch((e) => {
          cache.delete(key); // retry later instead of caching the failure
          throw e;
        }),
    );
  }
  const maps = await cache.get(key)!;
  if (!el.isConnected || state.get(el) !== st) return;
  maps.refs++;
  release(st.key);
  st.key = key;

  el.dataset.lg = '1';
  el.style.setProperty('--lg-pad', `${-maps.pad}px`);
  if (!supportsRefraction || !st.layer) {
    // WebKit: blur lives on the host itself (glass.css), only the rim light overlay is added.
    // A backdrop layer inside the host would capture the host's own text and blur it into a halo.
    el.style.setProperty('--lg-light-map', `url("${maps.light}")`);
    setHostBlur(el);
    scheduleContent();
    return;
  }
  const { layer } = st;
  layer.style.maskImage = layer.style.webkitMaskImage = `url("${maps.mask}")`;
  const blur = getComputedStyle(el).getPropertyValue('--lg-blur').trim() || '3px';
  // Blur first: the shader samples an already-blurred backdrop at distorted coordinates.
  const bf = supportsRefraction ? `blur(${blur}) url(#${maps.filterId})` : `blur(${blur})`;
  layer.style.backdropFilter = bf;
  layer.style.setProperty('-webkit-backdrop-filter', bf);
}

/** Remove the shader layer and fall back to the CSS blur. */
function strip(el: HTMLElement) {
  detach(el);
  el.querySelector(':scope > .lg-layer')?.remove();
  delete el.dataset.lg;
  for (const v of ['--lg-pad', '--lg-light-map']) el.style.removeProperty(v);
}

/**
 * WebKitGTK computes `-webkit-backdrop-filter: blur(var(--lg-blur))` to `none` (a var() inside the
 * prefixed property is dropped), which left every glass element without blur on Linux. Resolve
 * the value here and set it inline with a plain length.
 */
function setHostBlur(el: HTMLElement) {
  if (supportsRefraction) return;
  const blur = getComputedStyle(el).getPropertyValue('--lg-blur').trim() || '3px';
  el.style.setProperty('-webkit-backdrop-filter', `blur(${blur})`);
}

function attach(el: HTMLElement) {
  setHostBlur(el);
  if (state.has(el)) return;
  if (!wantsShader(el)) return;
  let layer = el.querySelector<HTMLElement>(':scope > .lg-layer');
  if (!layer && supportsRefraction) {
    layer = document.createElement('i');
    layer.className = 'lg-layer';
    layer.setAttribute('aria-hidden', 'true');
    el.prepend(layer);
  }
  const ro = new ResizeObserver(() => schedule(el));
  ro.observe(el);
  state.set(el, { layer, ro });
  schedule(el);
}

function detach(el: HTMLElement) {
  const st = state.get(el);
  if (!st) return;
  if (el.dataset.lgc) scheduleContent();
  st.ro.disconnect();
  release(st.key);
  state.delete(el);
}

// ───────────── Content refraction (desktop WebKit) ─────────────

const content = { src: null as HTMLElement | null, filterId: '', sig: '', paused: false, offUntil: 0 };
let contentRaf = 0;
let contentSeq = 0;

function scheduleContent() {
  if (!contentRefraction || contentRaf) return;
  contentRaf = requestAnimationFrame(() => {
    contentRaf = 0;
    updateContent();
  });
}

function clearContent() {
  content.src?.style.removeProperty('filter');
  document.getElementById(content.filterId)?.remove();
  document.querySelectorAll<HTMLElement>('[data-lgc]').forEach((e) => delete e.dataset.lgc);
  content.src = null;
  content.filterId = '';
  content.sig = '';
}

function updateContent() {
  if (content.paused || Date.now() < content.offUntil || currentTier() === 'low' || document.hidden) return clearContent();
  const src = [...document.querySelectorAll<HTMLElement>('.tab-stack')].find((e) => e.style.display !== 'none');
  if (!src) return clearContent();
  const sr = src.getBoundingClientRect();
  const items: { el: HTMLElement; m: Maps; x: number; y: number; blur: number }[] = [];
  for (const el of document.querySelectorAll<HTMLElement>(OVERLAY_GLASS)) {
    const st = state.get(el);
    const m = st?.key ? resolved.get(st.key) : undefined;
    if (!m || src.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.bottom <= sr.top || r.top >= sr.bottom || r.right <= sr.left || r.left >= sr.right) continue;
    if (Math.abs(r.width - el.offsetWidth) > 1) continue; // mid-animation (scaled): wait for it to settle
    const blur = num(getComputedStyle(el).getPropertyValue('--lg-blur'), 3);
    // WebKit resolves userSpaceOnUse for CSS filters on HTML in page coordinates (not the
    // element's own box), so every rect below is in viewport px (the app itself never scrolls).
    items.push({ el, m, x: Math.round(r.left) - m.pad, y: Math.round(r.top) - m.pad, blur });
  }
  if (!items.length) return clearContent();
  const sig = [Math.round(sr.left), Math.round(sr.top), Math.round(sr.width), Math.round(sr.height), ...items.map((i) => `${i.m.filterId}@${i.x},${i.y},${i.blur}`)].join('|');
  if (sig === content.sig && src === content.src) return;

  const NS = 'http://www.w3.org/2000/svg';
  const make = (tag: string, attrs: Record<string, string | number>) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const id = `lgc-${ID_PREFIX}-${++contentSeq}`;
  const f = make('filter', {
    id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    x: Math.floor(sr.left),
    y: Math.floor(sr.top),
    width: Math.ceil(sr.width),
    height: Math.ceil(sr.height),
    'color-interpolation-filters': 'sRGB',
  });
  const merge = make('feMerge', {});
  merge.appendChild(make('feMergeNode', { in: 'SourceGraphic' }));
  items.forEach(({ m, x, y, blur }, i) => {
    const box = { x, y, width: m.qw, height: m.qh };
    // Blur a little beyond the glass so displaced samples near the rim still find content.
    const ext = Math.ceil(m.dispScale / 2 + blur * 2);
    f.append(
      make('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, x: x - ext, y: y - ext, width: m.qw + ext * 2, height: m.qh + ext * 2, result: `b${i}` }),
      make('feImage', { href: m.disp, ...box, preserveAspectRatio: 'none', result: `d${i}` }),
      make('feDisplacementMap', { in: `b${i}`, in2: `d${i}`, scale: m.dispScale, xChannelSelector: 'R', yChannelSelector: 'G', ...box, result: `r${i}` }),
      make('feImage', { href: m.mask, ...box, preserveAspectRatio: 'none', result: `m${i}` }),
      make('feComposite', { in: `r${i}`, in2: `m${i}`, operator: 'in', ...box, result: `g${i}` }),
    );
    merge.appendChild(make('feMergeNode', { in: `g${i}` }));
  });
  f.appendChild(merge);
  ensureDefs().appendChild(f);

  const oldId = content.filterId;
  if (content.src && content.src !== src) content.src.style.removeProperty('filter');
  src.style.filter = `url(#${id})`;
  document.getElementById(oldId)?.remove();
  const hosts = new Set(items.map((i) => i.el));
  document.querySelectorAll<HTMLElement>('[data-lgc]').forEach((e) => !hosts.has(e) && delete e.dataset.lgc);
  hosts.forEach((e) => (e.dataset.lgc = '1'));
  Object.assign(content, { src, filterId: id, sig });
  watchFrames();
}

/** While content refraction is on, fall back to plain blur if it makes frames slow. */
let watching = false;
function watchFrames() {
  if (watching) return;
  watching = true;
  let last = performance.now();
  let slow = 0;
  let frames = 0;
  const tick = (now: number) => {
    if (!content.src) return void (watching = false);
    const dt = now - last;
    last = now;
    if (dt < 250) {
      frames++;
      if (dt > 28) slow++;
    }
    if (frames >= 90) {
      if (slow / frames > 0.3) {
        content.offUntil = Date.now() + 30_000;
        clearContent();
        setTimeout(scheduleContent, 30_500);
      }
      frames = slow = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Scrolling under a filtered element repaints it every frame: drop the filter while it moves. */
function pauseContentWhileScrolling() {
  let t: ReturnType<typeof setTimeout> | undefined;
  const onScroll = (e: Event) => {
    const target = e.target as Node;
    if (!(target instanceof HTMLElement) || !target.closest('.tab-stack')) return;
    if (!content.paused) {
      content.paused = true;
      clearContent();
    }
    clearTimeout(t);
    t = setTimeout(() => {
      content.paused = false;
      scheduleContent();
    }, 180);
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  document.addEventListener('visibilitychange', scheduleContent);
  // Tab switches, menus, the mini player appearing… are cheap to re-check.
  const iv = setInterval(scheduleContent, 400);
  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    document.removeEventListener('visibilitychange', scheduleContent);
    clearInterval(iv);
    clearContent();
  };
}

/**
 * Phones: an SVG backdrop filter is re-rasterised every frame while content scrolls under it,
 * which is what makes weak GPUs stutter. While a scroll is in progress the layers switch to a
 * plain blur + tint (cheap, composited) and get the shader back 150 ms after it stops.
 */
function pauseRefractionWhileScrolling() {
  if (!supportsRefraction || !matchMedia('(pointer: coarse)').matches) return () => {};
  const root = document.documentElement;
  let t: ReturnType<typeof setTimeout> | undefined;
  const onScroll = () => {
    if (root.dataset.scrolling !== '1') root.dataset.scrolling = '1';
    clearTimeout(t);
    t = setTimeout(() => delete root.dataset.scrolling, 150);
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => document.removeEventListener('scroll', onScroll, { capture: true });
}

/** Free every cached map set no element uses right now (background memory trim). */
export function purgeGlass() {
  for (const [key, m] of resolved) {
    if (m.refs > 0) continue;
    cache.delete(key);
    resolved.delete(key);
    for (const u of [m.mask, m.disp, m.light, m.combined]) URL.revokeObjectURL(u);
    document.getElementById(m.filterId)?.remove();
  }
}

/** Re-render maps for an element whose CSS parameters changed without a resize. */
export function refreshGlass(el?: HTMLElement) {
  const targets = el ? [el] : [...document.querySelectorAll<HTMLElement>('.glass')];
  for (const t of targets) {
    setHostBlur(t);
    if (!wantsShader(t)) {
      if (state.has(t) || t.dataset.lg) strip(t);
      continue;
    }
    if (!state.has(t)) attach(t);
    const st = state.get(t);
    if (st) st.key = undefined;
    schedule(t);
  }
}

export function startLiquidGlass() {
  const ok = initGl();
  document.documentElement.dataset.lg = ok ? (supportsRefraction ? 'svg' : 'overlay') : '0';
  if (!ok) return;
  const stopContent = contentRefraction ? pauseContentWhileScrolling() : undefined;
  const stopScrollPause = pauseRefractionWhileScrolling();
  document.querySelectorAll<HTMLElement>('.glass').forEach(attach);
  const mo = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') {
        const t = r.target as HTMLElement;
        if (t.classList.contains('glass')) attach(t);
        else detach(t);
        continue;
      }
      r.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.classList.contains('glass')) attach(n);
        n.querySelectorAll?.<HTMLElement>('.glass').forEach(attach);
      });
      r.removedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        if (n.classList.contains('lg-layer')) {
          // React replaced the children (e.g. text content): restore the layer.
          const host = r.target as HTMLElement;
          const st = state.get(host);
          if (st?.layer && host.isConnected && !st.layer.isConnected) host.prepend(st.layer);
          return;
        }
        if (state.has(n)) detach(n);
        n.querySelectorAll?.<HTMLElement>('.glass').forEach(detach);
      });
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const onResize = () => refreshGlass();
  window.addEventListener('resize', onResize);

  // Dev: on hot reload drop this instance's observers and filters; the new instance re-attaches.
  import.meta.hot?.dispose(() => {
    mo.disconnect();
    window.removeEventListener('resize', onResize);
    stopContent?.();
    stopScrollPause();
    defs?.closest('svg')?.remove();
    document.querySelectorAll<HTMLElement>('.glass[data-lg]').forEach((el) => delete el.dataset.lg);
  });
}
