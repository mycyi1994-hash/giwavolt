"use client";

// Stylized "hand throwing neon dice in the dark" hero art (pure SVG, no asset).
// Swappable later for a rendered illustration.
export default function DiceHand({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 420 380" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="glow" cx="50%" cy="38%" r="60%">
          <stop offset="0%" stopColor="#ff2bd6" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#00e5ff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#06060e" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="die1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0c2230" />
          <stop offset="100%" stopColor="#06141c" />
        </linearGradient>
        <linearGradient id="die2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a0c28" />
          <stop offset="100%" stopColor="#160616" />
        </linearGradient>
        <filter id="f" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* ambient glow */}
      <rect x="0" y="0" width="420" height="380" fill="url(#glow)" />

      {/* motion streaks */}
      <g stroke="#00e5ff" strokeWidth="2" strokeLinecap="round" opacity="0.5" filter="url(#f)">
        <line x1="120" y1="150" x2="90" y2="60" />
        <line x1="175" y1="135" x2="160" y2="38" />
      </g>
      <g stroke="#ff2bd6" strokeWidth="2" strokeLinecap="round" opacity="0.5" filter="url(#f)">
        <line x1="270" y1="150" x2="300" y2="58" />
        <line x1="235" y1="138" x2="240" y2="40" />
      </g>

      {/* die 1 (cyan) */}
      <g filter="url(#f)" transform="rotate(-14 150 120)">
        <rect x="108" y="78" width="84" height="84" rx="16" fill="url(#die1)" stroke="#00e5ff" strokeWidth="2.5" />
        <g fill="#7df9ff">
          <circle cx="132" cy="102" r="6" />
          <circle cx="168" cy="102" r="6" />
          <circle cx="150" cy="120" r="6" />
          <circle cx="132" cy="138" r="6" />
          <circle cx="168" cy="138" r="6" />
        </g>
      </g>

      {/* die 2 (magenta) */}
      <g filter="url(#f)" transform="rotate(16 268 128)">
        <rect x="230" y="86" width="76" height="76" rx="15" fill="url(#die2)" stroke="#ff2bd6" strokeWidth="2.5" />
        <g fill="#ff8ae9">
          <circle cx="252" cy="108" r="5.5" />
          <circle cx="284" cy="108" r="5.5" />
          <circle cx="268" cy="124" r="5.5" />
          <circle cx="252" cy="140" r="5.5" />
          <circle cx="284" cy="140" r="5.5" />
        </g>
      </g>

      {/* hand — dark silhouette reaching up, cyan rim light */}
      <g filter="url(#f)">
        <path
          d="M150 380 C150 320 140 300 150 270 C156 252 176 250 182 268 L188 296
             L196 246 C198 228 220 228 222 246 L226 292
             L234 240 C236 222 258 224 258 242 L260 296
             L270 256 C274 240 294 244 292 262 L286 312
             C284 344 250 380 210 380 Z"
          fill="#070710"
          stroke="#00e5ff"
          strokeOpacity="0.7"
          strokeWidth="2"
        />
        <path d="M168 300 C150 312 150 340 162 360" stroke="#ff2bd6" strokeOpacity="0.5" strokeWidth="2" fill="none" />
      </g>
    </svg>
  );
}
