// Writes the logo as SVG sources for web, Tauri and Android (incl. monochrome themed icon).
import { mkdirSync, writeFileSync } from 'node:fs';

// Minimal mark: open ring + one dot in the gap (sonar ping). Keep in sync with src/ui/components/Brand.tsx.
const RING = 'M 74.67 46.48 A 22 22 0 1 1 61.52 33.33';
const DOT = '<circle cx="69.56" cy="38.44" r="4.5" fill="#fff"/>';
const full = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">
<rect width="108" height="108" rx="28" fill="#0b0b0c"/>
<path d="${RING}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
${DOT}
</svg>
`;
mkdirSync('public', { recursive: true });
mkdirSync('assets', { recursive: true });
writeFileSync('public/logo.svg', full);
writeFileSync('assets/logo.svg', full);
// Square, full-bleed variant for icon generators (Tauri / store listings).
writeFileSync('assets/logo-square.svg', full.replace('rx="28"', 'rx="0"'));
writeFileSync(
  'public/manifest.webmanifest',
  JSON.stringify(
    {
      name: 'Sonara',
      short_name: 'Sonara',
      display: 'standalone',
      background_color: '#000000',
      theme_color: '#050505',
      icons: [{ src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    },
    null,
    2,
  ),
);
console.log('brand assets written');
