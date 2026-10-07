import { useEffect, useRef } from 'react';
import { getLevels } from '../../player/analyser';
import { likePulse } from '../../player/likePulse';
import { useAppActive } from '../../platform/memory';
import { currentTier } from '../../platform/perf';

/** Per graphics tier: fbm octaves, render scale, frame interval. */
const TIER = {
  high: { octaves: 5, scale: 0.75, frameMs: 0 },
  balanced: { octaves: 4, scale: 0.5, frameMs: 1000 / 30 },
  low: { octaves: 3, scale: 0.35, frameMs: 1000 / 24 },
} as const;

/* Wave orb — a living, organic sphere of colour.
   • edge: radius modulated by angular fbm → the silhouette breathes
   • body: domain-warped fbm (Quílez-style) mixing four palette colours
   • hot core, caustic filaments, soft halo and rim fringe
   • bass swells the orb, highs sharpen the filaments; filmic tonemap + dither */

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
/* Animation phase, integrated on the CPU (speed changes never jump). */
uniform float uPhase;
uniform vec3 uC0, uC1, uC2, uC3;
uniform float uEnergy, uBass, uMid, uHigh, uSize, uLike;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < OCTAVES; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

// Smooth 4-colour cyclic palette
vec3 palette(float x) {
  x = fract(x) * 4.0;
  vec3 a = mix(uC0, uC1, smoothstep(0.0, 1.0, x));
  a = mix(a, uC2, smoothstep(1.0, 2.0, x));
  a = mix(a, uC3, smoothstep(2.0, 3.0, x));
  return mix(a, uC0, smoothstep(3.0, 4.0, x));
}

void main() {
  vec2 uv0 = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float t = uPhase;
  float like = uLike;

  // Warp space itself so the whole silhouette flows like plasma, not just its edge.
  vec2 warp = vec2(fbm(uv0 * 2.0 + vec2(t * 0.9, 0.0)), fbm(uv0 * 2.0 + vec2(0.0, -t * 0.8))) - 0.5;
  vec2 uv = uv0 + warp * (0.22 + 0.03 * uEnergy);
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Morphing outline: rotating lobes + angular noise + bass swell + like burst
  float lobes = 0.10 * sin(3.0 * ang + t * 1.7) * sin(2.0 * ang - t * 1.1)
              + 0.06 * sin(5.0 * ang - t * 2.3);
  float edgeN = fbm(vec2(cos(ang), sin(ang)) * 1.8 + vec2(t * 1.4, -t * 0.9));
  float R = uSize * (0.70 + 0.24 * edgeN + lobes + 0.06 * uBass + 0.015 * uEnergy) * (1.0 + 0.09 * like);

  // Plasma: sine field blended with domain-warped fbm
  vec2 p = uv * 2.4;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
  vec2 w = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 1.2), fbm(p + 3.4 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p + 3.0 * w);
  float plasma = sin(p.x * 2.2 + t * 2.0) + sin(p.y * 2.7 - t * 1.6)
               + sin((p.x + p.y) * 1.9 + t * 1.3) + sin(length(p) * 3.1 - t * 2.4);
  float bands = plasma * 0.125 + f * 0.9 + length(q) * 0.35;
  vec3 col = palette(bands + t * 0.15);
  col = mix(col, palette(bands + 0.5), smoothstep(0.55, 1.0, w.x) * 0.35);

  // Hot core + caustic filaments
  float core = exp(-(r * r) / (R * R * 0.30));
  col += core * (0.24 + 0.25 * uBass + 0.4 * like) * mix(uC0, vec3(1.0), 0.1 + 0.5 * like);
  float fil = pow(abs(sin(f * 9.0 + w.y * 7.0 + plasma * 0.8 + t * 5.0)), 20.0 - 10.0 * uHigh);
  col += fil * (0.14 + 0.35 * uHigh + 0.3 * like) * mix(uC3, vec3(1.0), 0.25);

  // Shape: body, halo, rim fringe
  float d = r / R;
  float body = smoothstep(1.0, 0.45, d);
  float halo = exp(-max(d - 0.5, 0.0) * (3.0 - 1.4 * like)) * (0.5 + 0.06 * uEnergy + 0.4 * like);
  float rim = smoothstep(0.84, 1.0, d) * smoothstep(1.22, 1.0, d);
  col += rim * (0.16 + 0.5 * like) * uC2;
  col *= 0.8 + 0.4 * f;
  float alpha = body + halo * (0.6 + 0.4 * f);

  // Like: radiant rays (in unwarped space, so they shoot out cleanly)
  if (like > 0.001) {
    float r0 = length(uv0);
    float a0 = atan(uv0.y, uv0.x);
    float jitter = noise(vec2(a0 * 3.0, uTime * 0.7)) * 2.5;
    float rays = pow(max(0.0, sin(a0 * 9.0 + uTime * 0.6 + jitter)), 8.0)
               + 0.6 * pow(max(0.0, sin(a0 * 17.0 - uTime * 0.9 + jitter * 1.3)), 14.0);
    float reach = uSize * (1.2 + 2.2 * (1.0 - like));
    float rayMask = rays * smoothstep(reach, uSize * 0.4, r0) * smoothstep(uSize * 0.25, uSize * 0.6, r0);
    vec3 flare = mix(uC0, vec3(1.0, 0.55, 0.75), 0.45);
    col += flare * rayMask * like * 0.8;
    alpha += rayMask * like * 0.6;
  }

  // Fade before canvas edges
  vec2 e = gl_FragCoord.xy / uRes;
  alpha = clamp(alpha, 0.0, 1.0) * smoothstep(0.0, 0.12, e.x) * smoothstep(1.0, 0.88, e.x) * smoothstep(0.0, 0.12, e.y) * smoothstep(1.0, 0.88, e.y);

  // Vivid, then filmic tonemap + dither
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = max(mix(vec3(luma), col, 1.45), 0.0);
  col = 1.0 - exp(-col * 1.25);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * (2.0 / 255.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

const hexToRgb = (h: string): [number, number, number] => {
  const m = h.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/./g, '$&$&') : m.slice(0, 6), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

type OrbProps = { colors: string[]; active: boolean; size?: number; className?: string };

/** Unmounted (WebGL context released) while the app is trimmed in the background. */
export function WaveOrb(props: OrbProps) {
  const appActive = useAppActive();
  if (!appActive) return <div className={props.className ?? 'wave-canvas'} aria-hidden />;
  return <WaveOrbCanvas {...props} />;
}

function WaveOrbCanvas({ colors, active, size = 0.42, className }: OrbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const colorsRef = useRef(colors);
  const activeRef = useRef(active);
  colorsRef.current = colors;
  activeRef.current = active;

  useEffect(() => {
    const canvas = ref.current!;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return fallback2d(canvas, colorsRef, activeRef, size);

    // A context can come back lost (e.g. React StrictMode remount on the same canvas): fall back.
    if (gl.isContextLost()) return fallback2d(canvas, colorsRef, activeRef, size);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[wave-orb]', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const tier = TIER[currentTier()];
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG.replace('precision highp float;', `precision highp float;\n#define OCTAVES ${tier.octaves}`));
    const prog = vs && fs ? gl.createProgram() : null;
    if (!prog || !vs || !fs) return fallback2d(canvas, colorsRef, activeRef, size);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return fallback2d(canvas, colorsRef, activeRef, size);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (n: string) => gl.getUniformLocation(prog, n);
    const U = {
      res: u('uRes'),
      time: u('uTime'),
      phase: u('uPhase'),
      c: [u('uC0'), u('uC1'), u('uC2'), u('uC3')],
      energy: u('uEnergy'),
      bass: u('uBass'),
      mid: u('uMid'),
      high: u('uHigh'),
      size: u('uSize'),
      like: u('uLike'),
    };

    let raf = 0;
    let visible = true;
    let energy = 0;
    let likeValue = 0;
    const cur = [hexToRgb('#ff9f0a'), hexToRgb('#ff375f'), hexToRgb('#bf5af2'), hexToRgb('#ffd60a')];
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    const start = performance.now() - Math.random() * 20000;

    let last = 0;
    let prevNow = performance.now();
    let phase = Math.random() * 50;
    const lvS = { bass: 0, mid: 0, high: 0 };
    const frame = (now = performance.now()) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) return;
      if (tier.frameMs && now - last < tier.frameMs - 1) return;
      last = now;
      const scale = Math.min(window.devicePixelRatio || 1, 1.25) * tier.scale;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      // Ease palette changes so artwork switches cross-fade.
      const target = colorsRef.current;
      for (let i = 0; i < 4; i++) {
        const tc = hexToRgb(target[i % target.length] ?? '#ffffff');
        for (let k = 0; k < 3; k++) cur[i][k] += (tc[k] - cur[i][k]) * 0.03;
        gl.uniform3fv(U.c[i], cur[i]);
      }
      // Frame-rate independent smoothing: play/pause eases over ~1.2 s.
      const dt = Math.min(0.1, (now - prevNow) / 1000);
      prevNow = now;
      energy += ((activeRef.current ? 1 : 0.7) - energy) * (1 - Math.exp(-dt / 0.35));
      const raw = getLevels();
      // Audio levels eased over ~0.2 s so beats swell instead of twitching.
      const k = 1 - Math.exp(-dt / 0.2);
      lvS.bass += (raw.bass - lvS.bass) * k;
      lvS.mid += (raw.mid - lvS.mid) * k;
      lvS.high += (raw.high - lvS.high) * k;
      const lv = lvS;
      gl.uniform2f(U.res, w, h);
      gl.uniform1f(U.time, (performance.now() - start) / 1000);
      // Integrate the phase: changing speed alters the tempo only, never the position.
      phase += dt * (0.06 + 0.025 * energy + 0.02 * lv.mid);
      gl.uniform1f(U.phase, phase);
      gl.uniform1f(U.energy, energy);
      gl.uniform1f(U.bass, lv.bass);
      gl.uniform1f(U.mid, lv.mid);
      gl.uniform1f(U.high, lv.high);
      gl.uniform1f(U.size, size);
      // Like flare: gentle swell (~0.45 s), long soft fade (~2.8 s), then per-frame smoothing.
      const ms = performance.now() - likePulse.at;
      const smooth = (x: number) => x * x * (3 - 2 * x);
      const likeTarget =
        ms < 0 || ms > 3250 ? 0 : ms < 450 ? smooth(ms / 450) : 1 - smooth(Math.min(1, (ms - 450) / 2800));
      likeValue += (likeTarget - likeValue) * (1 - Math.exp(-dt / 0.15));
      gl.uniform1f(U.like, likeValue);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      // Do not lose the context here: a StrictMode remount reuses this canvas. When the app
      // is trimmed in the background the whole canvas is unmounted and its context is freed.
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, [size]);

  return <canvas ref={ref} className={className ?? 'wave-canvas'} aria-hidden />;
}

/** Canvas 2D fallback when WebGL is unavailable. */
function fallback2d(canvas: HTMLCanvasElement, colorsRef: { current: string[] }, activeRef: { current: boolean }, size: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let raf = 0;
  let t = 0;
  const draw = () => {
    raf = requestAnimationFrame(draw);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h);
    t += activeRef.current ? 0.01 : 0.004;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const R = Math.min(w, h) * size;
    colorsRef.current.forEach((c, i) => {
      const a = t * (0.7 + i * 0.2) + i * 1.7;
      const x = w / 2 + Math.cos(a) * R * 0.35;
      const y = h / 2 + Math.sin(a * 1.2) * R * 0.3;
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `${c}99`);
      g.addColorStop(1, `${c}00`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    ctx.globalCompositeOperation = 'source-over';
  };
  draw();
  return () => cancelAnimationFrame(raf);
}
