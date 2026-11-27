export const VERTEX = /* glsl */ `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uSize;
uniform vec4 uShape;
uniform vec4 uRadius;
uniform float uStrength;
uniform float uAlpha;
uniform vec4 uRefraction;
uniform float uRefractionPower;
uniform float uGlow;
uniform float uDispScale;
const float E = 2.718281828459045;

// Per-corner radii (px), selected by quadrant; p and b are in px (Inigo Quilez).
float roundedBoxSDF(vec2 p, vec2 b, vec4 r) {
  r.xy = (p.x > 0.0) ? r.yz : r.xw;
  r.x = (p.y > 0.0) ? r.y : r.x;
  vec2 q = abs(p) - b + r.x;
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

float optics(float x) {
  return 1.0 - uRefraction.y * pow(uRefraction.z * E, -uRefraction.w * x - uRefraction.x);
}

void main() {
  vec2 point = vUv * uSize;
  vec2 halfSize = uShape.zw * 0.5;
  vec2 center = point - uShape.xy - halfSize;
  vec2 p = center / max(halfSize, vec2(1.0));
  float minHalf = max(min(halfSize.x, halfSize.y), 1.0);
  float d = roundedBoxSDF(center, halfSize, min(uRadius, vec4(minHalf)));
  float aa = max(fwidth(d), 0.5);
  float alpha = (1.0 - smoothstep(-aa, aa, d)) * uAlpha;
  float dist = clamp(-d / minHalf, 0.0, 1.0);
  float magnification = pow(max(0.05, optics(dist)), uRefractionPower);
  vec2 opticalP = p * magnification;
  vec2 displacement = (opticalP - p) * halfSize * uStrength;
  float rim = 1.0 - smoothstep(0.0, 0.075, dist);
  float directional = sin(atan(p.y, p.x) - 0.5) * uGlow;
  float light = clamp(0.5 + directional * rim * 0.18, 0.0, 1.0);
  fragColor = vec4(clamp(0.5 + displacement / uDispScale, 0.0, 1.0), light, alpha);
}
`;
