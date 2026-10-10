import { motion } from 'motion/react';
import type { HeadphoneModel } from '../../platform/audioDevices';

/**
 * Small product-style illustrations of headphone families for the island's "Connected" card
 * (our own vector drawings: shapes and shading only, no brand artwork).
 */
export function HeadphoneArt({ model, size = 44 }: { model: HeadphoneModel; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="hp-art">
      <defs>
        <linearGradient id="hp-shell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#ececf1" />
          <stop offset="1" stopColor="#c9c9d2" />
        </linearGradient>
        <linearGradient id="hp-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9d9e0" />
          <stop offset="1" stopColor="#a9a9b4" />
        </linearGradient>
        <linearGradient id="hp-dark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5b5b63" />
          <stop offset="1" stopColor="#2c2c31" />
        </linearGradient>
      </defs>
      {ART[model]}
    </svg>
  );
}

/** One earbud with a stem, drawn for the right ear; the left one is mirrored. */
const stemBud = (stem: number, tip: boolean) => (
  <g>
    {/* stem */}
    <rect x="31" y="22" width="7" height={stem} rx="3.5" fill="url(#hp-shell)" stroke="#b9b9c3" strokeWidth="0.6" />
    {/* head */}
    <path d="M22 13c0-5 4-8.5 9.5-8.5S41 8 41 13.5c0 5-3 9-8.5 10.5C27 25.5 22 19 22 13z" fill="url(#hp-shell)" stroke="#b9b9c3" strokeWidth="0.6" />
    {/* speaker mesh */}
    <ellipse cx="27.5" cy="12.5" rx="2.6" ry="3.2" fill="url(#hp-dark)" opacity="0.85" />
    {tip && <ellipse cx="24.3" cy="14.5" rx="3.6" ry="4.6" fill="url(#hp-shade)" stroke="#9d9da8" strokeWidth="0.5" />}
    {/* stem foot */}
    <rect x="31.6" y={20 + stem} width="5.8" height="2.2" rx="1.1" fill="#b4b4be" />
  </g>
);

/** Earbud with a long stem and no tip (tip = true adds the silicone ear tip). */
const stemOnly = (tip: 0 | 1) => (
  <g>
    <rect x="31" y="16" width="7" height="34" rx="3.5" fill="url(#hp-shell)" stroke="#b9b9c3" strokeWidth="0.6" />
    <ellipse cx="34.5" cy="14" rx="9" ry="10" fill="url(#hp-shell)" stroke="#b9b9c3" strokeWidth="0.6" />
    <ellipse cx="34.5" cy="12" rx="4" ry="3" fill="url(#hp-dark)" opacity="0.8" />
    {tip === 1 && <ellipse cx="34.5" cy="50" rx="4.5" ry="5" fill="url(#hp-shade)" stroke="#9d9da8" strokeWidth="0.5" />}
  </g>
);

const pair = (bud: React.ReactNode) => (
  <>
    <g transform="translate(-6 4) rotate(-10 32 32)">{bud}</g>
    <g transform="translate(70 6) scale(-1 1) rotate(-10 32 32)">{bud}</g>
  </>
);

const ART: Record<HeadphoneModel, React.ReactNode> = {
  airpods: pair(stemBud(30, false)),
  airpods3: pair(stemBud(20, false)),
  'airpods-pro': pair(stemBud(17, true)),
  'airpods-max': (
    <g>
      {/* canopy */}
      <path d="M13 30C13 15 21 7 32 7s19 8 19 23" fill="none" stroke="url(#hp-shade)" strokeWidth="6" strokeLinecap="round" />
      <path d="M16 29C16 17 23 11 32 11s16 6 16 18" fill="none" stroke="#e9e9ee" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="1.2 1.6" />
      {/* arms */}
      <rect x="10" y="26" width="5" height="10" rx="2.5" fill="#cfcfd6" />
      <rect x="49" y="26" width="5" height="10" rx="2.5" fill="#cfcfd6" />
      {/* cups */}
      <rect x="5" y="33" width="15" height="22" rx="6" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <rect x="44" y="33" width="15" height="22" rx="6" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <rect x="14" y="35" width="5" height="18" rx="2.5" fill="url(#hp-shade)" />
      <rect x="45" y="35" width="5" height="18" rx="2.5" fill="url(#hp-shade)" />
    </g>
  ),
  'buds-round': (
    <>
      {[0, 1].map((i) => (
        <g key={i} transform={i ? 'translate(70 6) scale(-1 1) rotate(-10 32 32)' : 'translate(-6 4) rotate(-10 32 32)'}>
          {/* puck body with a short stem */}
          <rect x="30" y="34" width="6" height="12" rx="3" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.5" />
          <circle cx="24" cy="22" r="14" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
          <circle cx="24" cy="22" r="6.5" fill="url(#hp-shade)" opacity="0.8" />
          <circle cx="24" cy="22" r="2.4" fill="url(#hp-dark)" />
        </g>
      ))}
    </>
  ),
  'buds-bean': (
    <>
      {[0, 1].map((i) => (
        <g key={i} transform={i ? 'translate(68 6) scale(-1 1)' : 'translate(-4 6)'}>
          {/* kidney-shaped bud with a grille on the stem side */}
          <path d="M14 14c-1-7 4-12 10-12s9 4 8 10c-1 4-3 6-4 10s-3 8-7 9c-5 1-7-6-7-17z" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
          <ellipse cx="19" cy="14" rx="4.5" ry="4" fill="url(#hp-shade)" opacity="0.7" />
          <ellipse cx="22" cy="30" rx="3.2" ry="4.5" fill="url(#hp-dark)" opacity="0.6" />
        </g>
      ))}
    </>
  ),
  'buds-stem': (
    <>{[0, 1].map((i) => <g key={i} transform={i ? 'translate(78 4) scale(-1 1)' : 'translate(-14 4)'}>{stemOnly(0)}</g>)}</>
  ),
  'buds-stem-tip': (
    <>{[0, 1].map((i) => <g key={i} transform={i ? 'translate(78 4) scale(-1 1)' : 'translate(-14 4)'}>{stemOnly(1)}</g>)}</>
  ),
  'buds-pod': (
    <>
      {[0, 1].map((i) => (
        <g key={i} transform={i ? 'translate(68 4) scale(-1 1) rotate(-14 16 18)' : 'translate(-4 4) rotate(-14 16 18)'}>
          {/* rounded pod with a tip stub on the ear side */}
          <path d="M6 20c0-9 6-15 13-15 7 0 11 5 11 12 0 7-5 16-12 17C10 35 6 29 6 20z" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
          <ellipse cx="18" cy="16" rx="6" ry="5" fill="url(#hp-shade)" opacity="0.7" />
          <path d="M6 24c-3 1-4 4-3 6 1 2 4 3 7 2" fill="url(#hp-dark)" opacity="0.8" />
        </g>
      ))}
    </>
  ),
  clip: (
    <g>
      {/* open-ear: a hook over the ear with the speaker pod in front */}
      <path d="M14 42c-4-10 0-26 12-30 10-3 18 3 18 12" fill="none" stroke="url(#hp-dark)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="44" cy="32" rx="9" ry="12" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <ellipse cx="20" cy="46" rx="8" ry="10" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <ellipse cx="44" cy="32" rx="3" ry="5" fill="url(#hp-dark)" opacity="0.8" />
    </g>
  ),
  neck: (
    <g>
      {/* neckband with the pods at the ends */}
      <path d="M8 22c0 26 10 32 24 32s24-6 24-32" fill="none" stroke="url(#hp-dark)" strokeWidth="4" strokeLinecap="round" />
      <ellipse cx="8" cy="24" rx="5" ry="8" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <ellipse cx="56" cy="24" rx="5" ry="8" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
    </g>
  ),
  'sport-hook': (
    <>
      {[0, 1].map((i) => (
        <g key={i} transform={i ? 'translate(64 0) scale(-1 1)' : ''}>
          {/* earhook over the top of the ear, speaker in the ear */}
          <path d="M14 46c-6-16 0-34 14-36 6-1 10 2 9 7" fill="none" stroke="url(#hp-dark)" strokeWidth="3.6" strokeLinecap="round" />
          <ellipse cx="26" cy="36" rx="7" ry="10" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
        </g>
      ))}
    </>
  ),
  'over-ear': (
    <g>
      <path d="M12 34C12 17 21 8 32 8s20 9 20 26" fill="none" stroke="url(#hp-dark)" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M15 33C15 19 22 12 32 12s17 7 17 21" fill="none" stroke="#7b7b85" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="13" cy="42" rx="8.5" ry="11.5" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <ellipse cx="51" cy="42" rx="8.5" ry="11.5" fill="url(#hp-shell)" stroke="#b5b5bf" strokeWidth="0.6" />
      <ellipse cx="17" cy="42" rx="3.5" ry="9" fill="url(#hp-dark)" opacity="0.8" />
      <ellipse cx="47" cy="42" rx="3.5" ry="9" fill="url(#hp-dark)" opacity="0.8" />
    </g>
  ),
  wired: (
    <g>
      <path d="M18 24c2 14 6 20 14 24s12 6 12 12M46 24c-2 14-6 20-14 24" fill="none" stroke="#d6d6dd" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="17" cy="16" rx="7" ry="8" fill="url(#hp-shell)" stroke="#b6b6c0" strokeWidth="0.6" />
      <ellipse cx="47" cy="16" rx="7" ry="8" fill="url(#hp-shell)" stroke="#b6b6c0" strokeWidth="0.6" />
      <ellipse cx="15.5" cy="15" rx="3" ry="3.6" fill="url(#hp-dark)" opacity="0.8" />
      <ellipse cx="48.5" cy="15" rx="3" ry="3.6" fill="url(#hp-dark)" opacity="0.8" />
      <rect x="16" y="22" width="3.4" height="6" rx="1.7" fill="#c3c3cc" />
      <rect x="44.6" y="22" width="3.4" height="6" rx="1.7" fill="#c3c3cc" />
    </g>
  ),
};

/** iOS-style battery ring: green, orange at 20 %, red at 10 %, the number inside counting up. */
export function BatteryRing({ level, size = 36 }: { level: number; size?: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const color = level <= 10 ? '#ff453a' : level <= 20 ? '#ff9f0a' : '#30d158';
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" className="battery-ring" role="img" aria-label={`${level}%`}>
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(255 255 255 / 0.16)" strokeWidth="3.2" />
      <motion.circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - level / 100) }}
        transition={{ type: 'spring', stiffness: 90, damping: 20, delay: 0.25 }}
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="18.5" textAnchor="middle" dominantBaseline="middle" fill={color} className="battery-ring-num">
        {level}
      </text>
    </svg>
  );
}
