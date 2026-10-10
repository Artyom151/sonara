// Generates src/ui/glass/shaders.ts (GLSL ES 3.00 for WebGL2) from the original desktop shaders
// src/ui/glass/glass.vsh and glass.fsh (GLSL 150). The .vsh / .fsh files are the source of truth:
// edit them, then run `pnpm shaders`. `--check` only compares (tests/shaders.test.ts does the same).
//
// The port changes nothing in the shader maths. It only adds what WebGL2 needs:
//  - `#version 300 es` + precision qualifiers;
//  - the `uMode` / `uDispScale` uniforms and an output selector (the browser does not expose the
//    page backdrop to WebGL, so each mode renders one ingredient that CSS composites over it);
//  - the screen-space normal before `discard` (derivatives need uniform control flow).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = new URL('../src/ui/glass/', import.meta.url);
const read = (n) => readFileSync(new URL(n, dir), 'utf8');

/** Replace exactly one occurrence; a source change that breaks an anchor fails loudly. */
function patch(src, from, to, what) {
  const parts = src.split(from);
  if (parts.length !== 2) throw new Error(`gen-shaders: cannot patch "${what}" (${parts.length - 1} matches in the source)`);
  return parts.join(to);
}

export function build() {
  let vsh = read('glass.vsh');
  vsh = patch(vsh, '#version 150\n', '#version 300 es\nprecision highp float;\n', 'vertex version');

  let fsh = read('glass.fsh');
  fsh = patch(fsh, '#version 150\n', '#version 300 es\nprecision highp float;\n', 'fragment version');
  fsh = patch(fsh, 'uniform sampler2D Sampler0;\n', 'uniform sampler2D Sampler0;\nuniform int uMode;\nuniform float uDispScale;\n', 'mode uniforms');
  fsh = patch(
    fsh,
    '    if (alpha < 0.01) {\n        discard;\n    }\n',
    '    // Derivatives (fwidth / dFdx) must be evaluated in uniform control flow, before any discard.\n' +
      '    vec2 normal = normalize(vec2(dFdx(dist), dFdy(dist)) + vec2(0.0001));\n\n' +
      '    if (alpha < 0.01) {\n        if (uMode == 1 || uMode == 3) { fragColor = vec4(0.5, 0.5, 0.5, 1.0); return; }\n        discard;\n    }\n',
    'early discard',
  );
  fsh = patch(fsh, '    vec2 normal = normalize(vec2(dFdx(dist), dFdy(dist)) + vec2(0.0001));\n    float topLight', '    float topLight', 'late normal');
  fsh = patch(
    fsh,
    '    finalColor += vec3(1.0) * rimLight * depthStrength * 0.16;\n' +
      '    finalColor += vec3(0.55, 0.78, 1.0) * innerGlow * depthStrength * 0.10;\n' +
      '    finalColor -= vec3(0.05, 0.09, 0.12) * rimShade * depthStrength * 0.18;\n',
    '    vec3 lightAdd = vec3(1.0) * rimLight * depthStrength * 0.16\n' +
      '                  + vec3(0.55, 0.78, 1.0) * innerGlow * depthStrength * 0.10;\n' +
      '    vec3 shadeSub = vec3(0.05, 0.09, 0.12) * rimShade * depthStrength * 0.18;\n\n' +
      '    finalColor += lightAdd;\n    finalColor -= shadeSub;\n',
    'light terms',
  );
  fsh = patch(
    fsh,
    '    fragColor = vec4(finalColor, alpha * globalAlpha);\n',
    '    float outAlpha = alpha * globalAlpha;\n\n' +
      '    if (uMode == 0) {\n        fragColor = vec4(1.0, 1.0, 1.0, outAlpha);\n' +
      '    } else if (uMode == 1) {\n' +
      '        // texCoord is y-flipped framebuffer UV: convert the UV offset to CSS pixels on screen.\n' +
      '        vec2 d = glassCoord - texCoord;\n' +
      '        vec2 css = vec2(d.x * resolution.x, -d.y * resolution.y) / guiScale;\n' +
      '        fragColor = vec4(clamp(0.5 + css / uDispScale, 0.0, 1.0), 0.5, 1.0);\n' +
      '    } else if (uMode == 2) {\n' +
      '        float m = max(max(lightAdd.r, lightAdd.g), lightAdd.b);\n' +
      '        fragColor = vec4(m > 0.0 ? lightAdd / m : vec3(0.0), clamp(m, 0.0, 1.0) * outAlpha);\n' +
      '    } else if (uMode == 3) {\n' +
      '        fragColor = vec4(clamp(vec3(0.5) + lightAdd - shadeSub, 0.0, 1.0), 1.0);\n' +
      '    } else {\n        fragColor = vec4(finalColor, outAlpha);\n    }\n',
    'output modes',
  );

  const header = readFileSync(new URL('shaders.ts', dir), 'utf8').split('export const VERTEX')[0];
  return `${header}export const VERTEX = /* glsl */ \`${vsh}\`;\n\nexport const FRAGMENT = /* glsl */ \`${fsh}\`;\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = build();
  const file = new URL('shaders.ts', dir);
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== out) {
      console.error('shaders.ts is out of date with glass.vsh / glass.fsh: run `pnpm shaders`');
      process.exit(1);
    }
    console.log('shaders.ts matches glass.vsh / glass.fsh');
  } else {
    writeFileSync(file, out);
    console.log('wrote src/ui/glass/shaders.ts');
  }
}
