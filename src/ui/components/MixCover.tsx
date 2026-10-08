/** Generated flowing-ribbon artwork for mix cards (like the concept's red / blue waves). */
const PALETTES = [
  ['#ff2d55', '#c8102e', '#ff6b81'],
  ['#2f6bff', '#0b1f8f', '#ff6fb5'],
  ['#ff9f0a', '#d14900', '#ffd60a'],
  ['#30d158', '#007a4d', '#a6f4c5'],
  ['#bf5af2', '#5e17a8', '#ff8ad8'],
  ['#64d2ff', '#0a5ea8', '#e0f7ff'],
  ['#ff375f', '#5b0ea8', '#ff9f0a'],
  ['#ffd60a', '#ff6b00', '#fff3b0'],
];

export const coverPalette = (i: number) => PALETTES[((i % PALETTES.length) + PALETTES.length) % PALETTES.length];

export const hashIndex = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h % PALETTES.length;
};

export function MixCover({ index, className }: { index: number; className?: string }) {
  const [a, b, c] = coverPalette(index);
  const id = `mx${index}`;
  return (
    <svg className={className} viewBox="0 0 220 92" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`${id}-rib`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={b} stopOpacity="0.9" />
          <stop offset="0.5" stopColor={c} stopOpacity="0.55" />
          <stop offset="1" stopColor={b} stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect width="220" height="92" fill={`url(#${id}-bg)`} />
      {Array.from({ length: 9 }, (_, i) => {
        const x = 60 + i * 20;
        return (
          <path
            key={i}
            d={`M ${x} -10 C ${x + 30} 20, ${x - 30} 60, ${x + 10} 110 L ${x + 26} 110 C ${x - 12} 60, ${x + 46} 20, ${x + 16} -10 Z`}
            fill={`url(#${id}-rib)`}
            opacity={0.35 + (i % 3) * 0.2}
          />
        );
      })}
    </svg>
  );
}

/** A local playlist's cover: the user's photo when set, otherwise the generated one. */
export function PlaylistCover({ p, className }: { p: { cover: number; image?: string; title?: string }; className?: string }) {
  if (p.image) return <img className={className} src={p.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
  return <MixCover index={p.cover} className={className} />;
}
