/**
 * GENERATED from glass.vsh / glass.fsh by scripts/gen-shaders.mjs: edit those, then `pnpm shaders`.
 *
 * Liquid glass shader — a GLSL ES 3.00 port of the desktop blur/glass shader
 * (glass.vsh / glass.fsh). The math is unchanged; WebGL2 only adds `#version 300 es`,
 * precision qualifiers and an output selector (`uMode`), because the browser does not
 * expose the page backdrop to WebGL. Each mode renders one ingredient that CSS then
 * composites over the live backdrop:
 *   0 → alpha mask   (fillAlpha / outer rim × globalAlpha)          → mask-image
 *   1 → distortion   (glassDistortion, CSS px, R/G around 0.5)       → feDisplacementMap
 *   2 → rim light + inner glow, straight alpha (fallback overlay where SVG backdrop filters are unsupported)
 *   3 → 0.5 + lightAdd − shadeSub  (one map, added with feComposite arithmetic k2=1 k3=1 k4=−0.5)
 *   4 → the original composite (finalColor), kept verbatim
 */

export const VERTEX = /* glsl */ `#version 300 es
precision highp float;

layout(std140) uniform BlurData {
    vec4 rect;
    vec4 screen;
    vec4 framebufferSize;
    vec4 radii;
    vec4 cuts;
    vec4 color;
    vec4 glassData;
    vec4 blobRect0;
    vec4 blobRect1;
    vec4 blobData;
};

out vec2 fragCoord;
out vec2 pixelCoord;
out vec2 texCoord;
out vec2 rectSize;
out vec4 cornerRadii;
out vec4 cutSizes;
out float guiScale;
out float blurRadius;
out vec2 texelSize;
out vec2 screenCoord;
out vec4 tintColor;
out vec2 resolution;
out vec4 glass;
out vec4 blob0;
out vec4 blob1;
out vec4 blobs;

void main() {
    vec2 positions[6] = vec2[](
        vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(1.0, 1.0),
        vec2(0.0, 0.0), vec2(1.0, 1.0), vec2(0.0, 1.0)
    );

    vec2 pos = positions[gl_VertexID];
    vec2 screenPos = rect.xy + pos * rect.zw;
    vec2 ndcPos = (screenPos / screen.xy) * 2.0 - 1.0;
    ndcPos.y = -ndcPos.y;

    gl_Position = vec4(ndcPos, 0.0, 1.0);

    fragCoord = pos;
    pixelCoord = pos * rect.zw;
    rectSize = rect.zw;
    cornerRadii = radii;
    cutSizes = cuts;
    guiScale = screen.z;
    blurRadius = screen.w;
    resolution = framebufferSize.xy;
    texelSize = 1.0 / resolution;
    screenCoord = screenPos;
    tintColor = color;
    glass = glassData;
    blob0 = blobRect0;
    blob1 = blobRect1;
    blobs = blobData;

    vec2 fbPos = screenPos * guiScale;
    texCoord = vec2(fbPos.x / resolution.x, 1.0 - (fbPos.y / resolution.y));
}
`;

export const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;

in vec2 fragCoord;
in vec2 pixelCoord;
in vec2 texCoord;
in vec2 rectSize;
in vec4 cornerRadii;
in vec4 cutSizes;
in float guiScale;
in float blurRadius;
in vec2 texelSize;
in vec2 screenCoord;
in vec4 tintColor;
in vec2 resolution;
in vec4 glass;
in vec4 blob0;
in vec4 blob1;
in vec4 blobs;

out vec4 fragColor;

uniform sampler2D Sampler0;
uniform int uMode;
uniform float uDispScale;

float roundedBoxSDF(vec2 p, vec2 b, vec4 r) {
    r.xy = (p.x > 0.0) ? r.yz : r.xw;
    r.x = (p.y > 0.0) ? r.y : r.x;

    vec2 q = abs(p) - b + r.x;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r.x;
}

float cornerCutSDF(vec2 p, vec2 halfSize, vec4 cuts) {
    vec2 sgn = vec2(p.x >= 0.0 ? 1.0 : -1.0,
                     p.y >= 0.0 ? 1.0 : -1.0);

    float c;
    if (sgn.x > 0.0) c = (sgn.y > 0.0) ? cuts.z : cuts.y;
    else             c = (sgn.y > 0.0) ? cuts.w : cuts.x;

    if (c <= 0.0) return -1e6;

    c = min(c, min(halfSize.x, halfSize.y));

    vec2 q = p * sgn;
    return (q.x + q.y - (halfSize.x + halfSize.y - c)) * 0.70710678;
}

float rectSDF(vec2 point, vec4 shapeRect, vec4 radii, vec4 cuts) {
    vec2 halfSize = shapeRect.zw * 0.5;
    vec2 center = point - (shapeRect.xy + halfSize);
    float maxRadius = min(halfSize.x, halfSize.y);
    vec4 rRadii = min(radii, vec4(maxRadius));
    float dist = roundedBoxSDF(center, halfSize, rRadii);
    return max(dist, cornerCutSDF(center, halfSize, cuts));
}

float smoothUnion(float a, float b, float k) {
    if (k <= 0.0) return min(a, b);
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 rectUv(vec2 point, vec4 shapeRect) {
    return clamp((point - shapeRect.xy) / max(shapeRect.zw, vec2(1.0)), vec2(0.0), vec2(1.0));
}

vec2 glassDistortion(vec2 uv, vec2 shapeSize, float dist) {
    vec2 shapeHalfSize = max(shapeSize * 0.5, vec2(1.0));
    vec2 fromCenter = uv - 0.5;
    float waveScale = max(glass.y, 1.0);
    vec2 cornerUv = abs(uv - 0.5) * 2.0;
    float edge = 1.0 - smoothstep(0.0, max(1.0, min(shapeHalfSize.x, shapeHalfSize.y) * 0.45), -dist);
    float corner = smoothstep(0.35, 1.0, max(cornerUv.x, cornerUv.y));
    float refractionMask = max(edge, corner * 0.85);

    float waveA = sin((uv.y + uv.x * 0.35) * waveScale + uv.x * 9.0);
    float waveB = cos((uv.x - uv.y * 0.65) * waveScale * 0.75);
    vec2 wave = vec2(waveA, waveB) * texelSize * glass.x * (0.35 + refractionMask);
    vec2 lens = normalize(fromCenter + vec2(0.0001)) * texelSize * glass.x * refractionMask * 2.25;
    return wave + lens;
}

void main() {
    vec2 halfSize = rectSize * 0.5;
    float dist0 = rectSDF(screenCoord, blob0, cornerRadii, cutSizes);
    float dist1 = rectSDF(screenCoord, blob1, cornerRadii, cutSizes);
    float dist = dist0;
    if (blobs.x > 1.5) {
        dist = smoothUnion(dist0, dist1, blobs.y);
    }

    float pixelWidth = fwidth(dist);
    float smoothing = max(pixelWidth, 0.5 / guiScale);
    float edgeWidth = max(glass.z, 0.0);
    float depthStrength = max(glass.w, 0.0);
    float fillAlpha = 1.0 - smoothstep(-smoothing, smoothing, dist);
    float outerEdge = edgeWidth > 0.0 ? 1.0 - smoothstep(0.0, edgeWidth, abs(dist)) : 0.0;
    float innerEdge = edgeWidth > 0.0 ? 1.0 - smoothstep(0.0, edgeWidth * 1.75, -dist) : 0.0;
    float alpha = max(fillAlpha, outerEdge * 0.42);

    // Derivatives (fwidth / dFdx) must be evaluated in uniform control flow, before any discard.
    vec2 normal = normalize(vec2(dFdx(dist), dFdy(dist)) + vec2(0.0001));

    if (alpha < 0.01) {
        if (uMode == 1 || uMode == 3) { fragColor = vec4(0.5, 0.5, 0.5, 1.0); return; }
        discard;
    }

    vec2 glassCoord = texCoord;

    if (glass.x > 0.0) {
        vec2 distortion = glassDistortion(rectUv(screenCoord, blob0), blob0.zw, dist);
        if (blobs.x > 1.5) {
            vec2 distortion2 = glassDistortion(rectUv(screenCoord, blob1), blob1.zw, dist);
            float k = max(blobs.y, 1.0);
            float shapeBlend = clamp(0.5 + 0.5 * (dist1 - dist0) / k, 0.0, 1.0);
            distortion = mix(distortion2, distortion, shapeBlend);
        }
        glassCoord += distortion;
    }

    vec4 blurred = texture(Sampler0, clamp(glassCoord, vec2(0.0), vec2(1.0)));
    vec3 finalColor = mix(blurred.rgb, tintColor.rgb, tintColor.a);
    float topLight = clamp(dot(normal, normalize(vec2(-0.65, -0.95))), 0.0, 1.0);
    float bottomShade = clamp(dot(normal, normalize(vec2(0.65, 0.95))), 0.0, 1.0);
    float rimLight = outerEdge * (0.35 + topLight * 0.65);
    float rimShade = outerEdge * bottomShade;
    float innerGlow = innerEdge * max(0.0, 1.0 - fillAlpha) * 0.45;

    vec3 lightAdd = vec3(1.0) * rimLight * depthStrength * 0.16
                  + vec3(0.55, 0.78, 1.0) * innerGlow * depthStrength * 0.10;
    vec3 shadeSub = vec3(0.05, 0.09, 0.12) * rimShade * depthStrength * 0.18;

    finalColor += lightAdd;
    finalColor -= shadeSub;
    finalColor = clamp(finalColor, vec3(0.0), vec3(1.0));

    float globalAlpha = clamp(blurRadius, 0.0, 1.0);
    float outAlpha = alpha * globalAlpha;

    if (uMode == 0) {
        fragColor = vec4(1.0, 1.0, 1.0, outAlpha);
    } else if (uMode == 1) {
        // texCoord is y-flipped framebuffer UV: convert the UV offset to CSS pixels on screen.
        vec2 d = glassCoord - texCoord;
        vec2 css = vec2(d.x * resolution.x, -d.y * resolution.y) / guiScale;
        fragColor = vec4(clamp(0.5 + css / uDispScale, 0.0, 1.0), 0.5, 1.0);
    } else if (uMode == 2) {
        float m = max(max(lightAdd.r, lightAdd.g), lightAdd.b);
        fragColor = vec4(m > 0.0 ? lightAdd / m : vec3(0.0), clamp(m, 0.0, 1.0) * outAlpha);
    } else if (uMode == 3) {
        fragColor = vec4(clamp(vec3(0.5) + lightAdd - shadeSub, 0.0, 1.0), 1.0);
    } else {
        fragColor = vec4(finalColor, outAlpha);
    }
}
`;
