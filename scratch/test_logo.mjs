import sharp from 'sharp';
import fs from 'fs';

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="otpHeroBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="40%" stop-color="#1e3a8a" />
      <stop offset="100%" stop-color="#0369a1" />
    </linearGradient>

    <!-- Ambient Core Glow -->
    <radialGradient id="ambientGlow" cx="50%" cy="46%" r="55%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#2563eb" stop-opacity="0.1" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0" />
    </radialGradient>

    <!-- Outer Ring Gradient -->
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#e0f2fe" />
      <stop offset="100%" stop-color="#93c5fd" />
    </linearGradient>

    <!-- Center Monogram "W" / Shield Gradient -->
    <linearGradient id="monogramGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa" />
      <stop offset="50%" stop-color="#3b82f6" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>

    <!-- Verification Beacon Gradient -->
    <linearGradient id="beaconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>

    <!-- Glass Highlights -->
    <linearGradient id="topSheen" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>

    <!-- Shadow -->
    <filter id="emblemShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#030712" flood-opacity="0.45" />
    </filter>

    <filter id="coreGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- 1. Squircle Base Container -->
  <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#otpHeroBg)" />
  <rect x="16" y="16" width="480" height="480" rx="116" fill="url(#ambientGlow)" />
  
  <!-- Outer Precision Border -->
  <rect x="18" y="18" width="476" height="476" rx="114" fill="none" stroke="rgba(255, 255, 255, 0.18)" stroke-width="4" />
  
  <!-- Subtle Top Light Sheen -->
  <path d="M 16 132 C 16 48 48 16 132 16 L 380 16 C 464 16 496 48 496 132 L 496 220 C 280 260 232 260 16 220 Z" fill="url(#topSheen)" />

  <!-- 2. The OTPWala Bespoke Monogram Emblem -->
  <g filter="url(#emblemShadow)">

    <!-- The "O" Shield Crest Structure -->
    <!-- Outer boundary of the O-Shield -->
    <path 
      d="M 256,84 
         C 356,84 430,158 430,256 
         C 430,336 364,396 256,428 
         C 148,396 82,336 82,256 
         C 82,158 156,84 256,84 Z
         M 256,136
         C 186,136 136,188 136,256
         C 136,312 184,356 256,380
         C 328,356 376,312 376,256
         C 376,188 326,136 256,136 Z" 
      fill="url(#ringGrad)" 
      fill-rule="evenodd"
    />

    <!-- Interlocking "W" Verification Wings -->
    <!-- Left Wing -->
    <path 
      d="M 168,204 
         L 204,204 
         L 230,324 
         L 200,324 
         Z" 
      fill="#ffffff" 
      opacity="0.95"
    />
    <!-- Center Upward Chevron Apex (Forms the crest of W and center key vault) -->
    <polygon 
      points="256,236 274,324 238,324" 
      fill="#38bdf8" 
    />
    <!-- Right Wing -->
    <path 
      d="M 344,204 
         L 308,204 
         L 282,324 
         L 312,324 
         Z" 
      fill="#ffffff" 
      opacity="0.95"
    />

    <!-- Connecting Dynamic Crossbars forming the continuous "W" geometry -->
    <path 
      d="M 186,212 
         L 236,336 
         L 256,280 
         L 276,336 
         L 326,212 
         L 298,212 
         L 268,298 
         L 256,260 
         L 244,298 
         L 214,212 
         Z" 
      fill="#ffffff"
    />

    <!-- 3. The Digital Security Keyhole & Verification Core -->
    <g filter="url(#coreGlow)">
      <!-- Center Vault Pillar -->
      <circle cx="256" cy="190" r="18" fill="url(#beaconGrad)" />
      <rect x="250" y="196" width="12" height="24" rx="6" fill="url(#beaconGrad)" />
    </g>

    <!-- 4. Real-Time SMS Wave Pulses (Top Right Broadcast Indicator) -->
    <!-- Wave 1 -->
    <path 
      d="M 374,138 C 392,154 402,176 404,200" 
      fill="none" 
      stroke="#38bdf8" 
      stroke-width="10" 
      stroke-linecap="round" 
    />
    <!-- Wave 2 -->
    <path 
      d="M 406,108 C 432,132 446,164 450,200" 
      fill="none" 
      stroke="#38bdf8" 
      stroke-width="10" 
      stroke-linecap="round" 
      opacity="0.75"
    />

    <!-- Active Pulse Dot -->
    <circle cx="414" cy="98" r="8" fill="#34d399" />
    <circle cx="414" cy="98" r="4" fill="#ffffff" />
  </g>
</svg>`;

async function run() {
  const buf = Buffer.from(svgContent);
  await sharp(buf).resize(512, 512).png().toFile('scratch/test_512.png');
  console.log('Successfully generated scratch/test_512.png');
}
run();
