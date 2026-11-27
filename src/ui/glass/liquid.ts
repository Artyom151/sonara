 import { FRAGMENT, VERTEX } from './shaders';
import { glassPresetFor, type LiquidGlassPreset } from './sdk';
import { isAndroid, isCapacitor } from '../../platform';

interface Params extends LiquidGlassPreset {
  tint: [number, number, number, number];
  w: number;
  h: number;
  /** Computed border radius per corner (px): tl tr br bl. */
  radii: [number, number, number, number];
}

interface GlassMap {
  url: string;
  pad: number;
  width: number;
  height: number;
  dispScale: number;
  refs: number;
}

interface ElFilter {
  id: string;
  flood: SVGElement;
  mix: SVGElement;
}

const supportsRefraction = /Chrome\/|Edg\//.test(navigator.userAgent);
const SHADER_SURFACES = '.refract, .ctl-main, .tabbar, .mini, .pbar, .menu, .alert, .sheet, .island';
const PAD = 10;
const DISP_SCALE = 28;

let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let canvas: HTMLCanvasElement | null = null;
let defs: SVGDefsElement | null = null;
let initTried = false;
let filterSeq = 0;
const idPrefix = Math.random().toString(36).slice(2, 8);
const cache = new Map<string, Promise<GlassMap>>();
const resolved = new Map<string, GlassMap>();
const state = new WeakMap<HTMLElement, { key?: string; layer: HTMLElement | null; ro: ResizeObserver; filter?: ElFilter }>();

export const glassStatus: { mode: 'svg' | 'overlay' | 'off' | 'pending'; reason: string } = { mode: 'pending', reason: '' };

function initGl(): boolean {
  if (gl) return true;
  if (initTried) return false;
  initTried = true;
  canvas = document.createElement('canvas');
  const ctx = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
  if (!ctx) {
    glassStatus.reason = 'WebGL2 is not available';
    return false;
  }
  const compile = (type: number, src: string) => {
    const shader = ctx.createShader(type)!;
    ctx.shaderSource(shader, src);
    ctx.compileShader(shader);
    if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(shader) ?? 'shader error');
    return shader;
  };
  try {
    const p = ctx.createProgram()!;
    ctx.attachShader(p, compile(ctx.VERTEX_SHADER, VERTEX));
    ctx.attachShader(p, compile(ctx.FRAGMENT_SHADER, FRAGMENT));
    ctx.linkProgram(p);
    if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(p) ?? 'link error');
    program = p;
  } catch (e) {
    glassStatus.reason = String((e as Error)?.message ?? e).slice(0, 160);
    return false;
  }
  ctx.useProgram(program);
  gl = ctx;
  return true;
}

export function warmGlass() {
  const ok = initGl();
  glassStatus.mode = ok ? 'pending' : 'off';
  return ok;
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

const uniform = (name: string) => gl!.getUniformLocation(program!, name);

async function renderMap(p: Params): Promise<GlassMap> {
  const ctx = gl!;
  const width = p.w + PAD * 2;
  const height = p.h + PAD * 2;
  canvas!.width = width;
  canvas!.height = height;
  ctx.viewport(0, 0, width, height);
  ctx.uniform2f(uniform('uSize'), width, height);
  ctx.uniform4f(uniform('uShape'), PAD, PAD, p.w, p.h);
  ctx.uniform4f(uniform('uRadius'), ...p.radii);
  ctx.uniform1f(uniform('uStrength'), p.strength);
  ctx.uniform1f(uniform('uAlpha'), p.alpha);
  ctx.uniform4f(uniform('uRefraction'), ...p.refraction);
  ctx.uniform1f(uniform('uRefractionPower'), p.refractionPower);
  ctx.uniform1f(uniform('uGlow'), p.glow);
  ctx.uniform1f(uniform('uDispScale'), DISP_SCALE);
  ctx.clearColor(0.5, 0.5, 0.5, 0);
  ctx.clear(ctx.COLOR_BUFFER_BIT);
  ctx.drawArrays(ctx.TRIANGLES, 0, 3);
  const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
  return { url: URL.createObjectURL(blob), pad: PAD, width, height, dispScale: DISP_SCALE, refs: 0 };
}

function buildFilter(map: GlassMap, p: Params): ElFilter {
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag: string, attrs: Record<string, string | number>) => {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const id = `lg-${idPrefix}-${++filterSeq}`;
  const filter = make('filter', {
    id,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    x: 0,
    y: 0,
    width: map.width,
    height: map.height,
    'color-interpolation-filters': 'sRGB',
  });
  const image = make('feImage', { href: map.url, x: 0, y: 0, width: map.width, height: map.height, preserveAspectRatio: 'none', result: 'optics' });
  const displacement = make('feDisplacementMap', {
    in: 'SourceGraphic',
    in2: 'optics',
    scale: map.dispScale,
    xChannelSelector: 'R',
    yChannelSelector: 'G',
    result: 'refracted',
  });
  const light = make('feColorMatrix', {
    in: 'optics',
    type: 'matrix',
    values: '0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 0 1',
    result: 'light',
  });
  const lit = make('feComposite', { in: 'refracted', in2: 'light', operator: 'arithmetic', k2: 1, k3: 1, k4: -0.5, result: 'lit' });
  const flood = make('feFlood', { result: 'tint' });
  const mix = make('feComposite', { in: 'lit', in2: 'tint', operator: 'arithmetic', result: 'glass' });
  filter.append(image, displacement, light, lit, flood, mix);
  ensureDefs().appendChild(filter);
  const out = { id, flood, mix };
  setTint(out, p.tint);
  return out;
}

function setTint(filter: ElFilter, tint: [number, number, number, number]) {
  filter.flood.setAttribute('flood-color', `rgb(${tint.slice(0, 3).map((c) => Math.round(c * 255)).join(' ')})`);
  filter.mix.setAttribute('k2', String(1 - tint[3]));
  filter.mix.setAttribute('k3', String(tint[3]));
}

let probe: HTMLElement | null = null;
function parseColor(value: string): [number, number, number, number] {
  if (!probe) {
    probe = document.createElement('i');
    probe.style.display = 'none';
    document.body.appendChild(probe);
  }
  probe.style.color = '';
  probe.style.color = value;
  const color = getComputedStyle(probe).color;
  const n = (color.match(/-?[\d.]+(e-?\d+)?/g) ?? []).map(Number);
  if (color.startsWith('color(')) return [n[0] ?? 1, n[1] ?? 1, n[2] ?? 1, n[3] ?? 1];
  return [(n[0] ?? 255) / 255, (n[1] ?? 255) / 255, (n[2] ?? 255) / 255, n[3] ?? 1];
}

const num = (value: string, fallback: number) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
};

function readParams(el: HTMLElement): Params {
  const preset = glassPresetFor(el);
  const style = getComputedStyle(el);
  const w = Math.round(el.offsetWidth);
  const h = Math.round(el.offsetHeight);
  const r = (v: string) => Math.min(num(v, 0), Math.min(w, h) / 2);
  return {
    ...preset,
    strength: num(style.getPropertyValue('--lg-strength'), preset.strength),
    alpha: num(style.getPropertyValue('--lg-alpha'), preset.alpha),
    tint: parseColor(style.getPropertyValue('--lg-tint').trim() || 'rgb(255 255 255 / 0.04)'),
    w,
    h,
    radii: [r(style.borderTopLeftRadius), r(style.borderTopRightRadius), r(style.borderBottomRightRadius), r(style.borderBottomLeftRadius)],
  };
}

const keyOf = (p: Params) => [p.w, p.h, ...p.radii, p.strength, p.alpha, ...p.refraction, p.refractionPower, p.glow].join('|');

function release(key?: string) {
  if (!key) return;
  const map = resolved.get(key);
  if (!map || --map.refs > 0) return;
  setTimeout(() => {
    if (map.refs > 0 || resolved.get(key) !== map) return;
    cache.delete(key);
    resolved.delete(key);
    URL.revokeObjectURL(map.url);
  }, 15_000);
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
    cache.set(key, renderMap(p).then((map) => (resolved.set(key, map), map)).catch((e) => {
      cache.delete(key);
      throw e;
    }));
  }
  const map = await cache.get(key)!;
  if (!el.isConnected || state.get(el) !== st) return;
  map.refs++;
  release(st.key);
  st.key = key;
  el.dataset.lg = '1';
  el.style.setProperty('--lg-pad', `${-map.pad}px`);
  if (!supportsRefraction || !st.layer) return;
  st.layer.style.maskImage = st.layer.style.webkitMaskImage = `url("${map.url}")`;
  st.filter?.flood.parentElement?.remove();
  st.filter = buildFilter(map, p);
  const blur = getComputedStyle(el).getPropertyValue('--lg-blur').trim() || '3px';
  const backdrop = `blur(${blur}) url(#${st.filter.id})`;
  st.layer.style.backdropFilter = backdrop;
  st.layer.style.setProperty('-webkit-backdrop-filter', backdrop);
}

function setHostBlur(el: HTMLElement) {
  if (supportsRefraction) return;
  const blur = getComputedStyle(el).getPropertyValue('--lg-blur').trim() || '3px';
  el.style.setProperty('-webkit-backdrop-filter', `blur(${blur})`);
}

function attach(el: HTMLElement) {
  setHostBlur(el);
  if (state.has(el) || !el.matches(SHADER_SURFACES)) return;
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
  st.ro.disconnect();
  release(st.key);
  st.filter?.flood.parentElement?.remove();
  state.delete(el);
}

function strip(el: HTMLElement) {
  detach(el);
  el.querySelector(':scope > .lg-layer')?.remove();
  delete el.dataset.lg;
  el.style.removeProperty('--lg-pad');
}

export function retintGlass() {
  if (!supportsRefraction) return;
  for (const el of document.querySelectorAll<HTMLElement>('.glass[data-lg]')) {
    const filter = state.get(el)?.filter;
    if (filter) setTint(filter, parseColor(getComputedStyle(el).getPropertyValue('--lg-tint').trim() || 'rgb(255 255 255 / 0.04)'));
  }
}

export function refreshGlass(el?: HTMLElement) {
  const targets = el ? [el] : [...document.querySelectorAll<HTMLElement>('.glass')];
  for (const target of targets) {
    setHostBlur(target);
    if (!target.matches(SHADER_SURFACES)) {
      if (state.has(target) || target.dataset.lg) strip(target);
      continue;
    }
    if (!state.has(target)) attach(target);
    const st = state.get(target);
    if (st) st.key = undefined;
    schedule(target);
  }
}

export function purgeGlass() {
  for (const [key, map] of resolved) {
    if (map.refs > 0) continue;
    cache.delete(key);
    resolved.delete(key);
    URL.revokeObjectURL(map.url);
  }
}

function pauseWhileScrolling() {
  // Phones keep the full refraction while scrolling: the swap to plain blur was visible as a
  // style change on every swipe, and mobile GPUs hold the SVG backdrop filter fine.
  if (!supportsRefraction || isAndroid || isCapacitor) return () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const root = document.documentElement;
  const onScroll = () => {
    if (root.dataset.scrolling !== '1') root.dataset.scrolling = '1';
    clearTimeout(timer);
    timer = setTimeout(() => delete root.dataset.scrolling, 140);
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  return () => document.removeEventListener('scroll', onScroll, { capture: true });
}

export function startLiquidGlass() {
  const ok = initGl();
  const mode = ok ? (supportsRefraction ? 'svg' : 'overlay') : 'off';
  document.documentElement.dataset.lg = mode;
  glassStatus.mode = mode;
  if (!ok) return;
  const stopScrollPause = pauseWhileScrolling();
  document.querySelectorAll<HTMLElement>('.glass').forEach(attach);
  const mo = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target as HTMLElement;
        if (target.classList.contains('glass')) attach(target);
        else detach(target);
        continue;
      }
      record.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.classList.contains('glass')) attach(node);
        node.querySelectorAll?.<HTMLElement>('.glass').forEach(attach);
      });
      record.removedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (node.classList.contains('lg-layer')) {
          const host = record.target as HTMLElement;
          const st = state.get(host);
          if (st?.layer && host.isConnected && !st.layer.isConnected) host.prepend(st.layer);
          return;
        }
        if (state.has(node)) detach(node);
        node.querySelectorAll?.<HTMLElement>('.glass').forEach(detach);
      });
    }
  });
  mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  const onResize = () => refreshGlass();
  window.addEventListener('resize', onResize);
  import.meta.hot?.dispose(() => {
    mo.disconnect();
    window.removeEventListener('resize', onResize);
    stopScrollPause();
    defs?.closest('svg')?.remove();
    document.querySelectorAll<HTMLElement>('.glass[data-lg]').forEach((el) => delete el.dataset.lg);
  });
}
