import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = 'apps/web/public';

// 1. The Core 512x512 SVG Definition
const getMasterEmblemSvg = (idPrefix = 'brand') => `
  <defs>
    <!-- Background Gradient: Deep Royal Indigo to Electric Sapphire -->
    <linearGradient id="${idPrefix}Bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="35%" stop-color="#1e1b4b" />
      <stop offset="70%" stop-color="#1d4ed8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>

    <!-- Radial Core Highlight -->
    <radialGradient id="${idPrefix}CenterGlow" cx="50%" cy="48%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#0284c7" stop-opacity="0" />
    </radialGradient>

    <!-- The "O" Ring Gradient -->
    <linearGradient id="${idPrefix}ORingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#f0f9ff" />
      <stop offset="100%" stop-color="#bae6fd" />
    </linearGradient>

    <!-- "W" Monogram Left Wing -->
    <linearGradient id="${idPrefix}WLeftGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#2563eb" />
    </linearGradient>

    <!-- "W" Monogram Right Wing -->
    <linearGradient id="${idPrefix}WRightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>

    <!-- Center Security Core Gradient -->
    <linearGradient id="${idPrefix}VaultCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>

    <!-- Drop Shadow Filter -->
    <filter id="${idPrefix}MainShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="12" stdDeviation="16" flood-color="#020617" flood-opacity="0.5" />
    </filter>

    <filter id="${idPrefix}SoftGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Container Squircle with Precision Border -->
  <rect x="16" y="16" width="480" height="480" rx="118" fill="url(#${idPrefix}Bg)" />
  <rect x="16" y="16" width="480" height="480" rx="118" fill="url(#${idPrefix}CenterGlow)" />
  <rect x="18" y="18" width="476" height="476" rx="116" fill="none" stroke="rgba(255, 255, 255, 0.22)" stroke-width="3" />

  <!-- Glass Arc Sheen on Top Half -->
  <path d="M 16 134 C 16 50 50 16 134 16 L 378 16 C 462 16 496 50 496 134 L 496 220 C 330 255 182 255 16 220 Z" fill="#ffffff" opacity="0.08" />

  <!-- Main Emblem Group -->
  <g filter="url(#${idPrefix}MainShadow)">
    
    <!-- 1. The Sculpted Outer "O" Shield Ring -->
    <path 
      d="M 256,76 
         C 358,76 436,154 436,256 
         C 436,334 372,398 256,436 
         C 140,398 76,334 76,256 
         C 76,154 154,76 256,76 Z
         M 256,134
         C 188,134 134,188 134,256
         C 134,312 180,360 256,388
         C 332,360 378,312 378,256
         C 378,188 324,134 256,134 Z" 
      fill="url(#${idPrefix}ORingGrad)" 
      fill-rule="evenodd"
    />

    <!-- 2. The Integrated "W" Monogram (Wala) -->
    <!-- Left Wing of W -->
    <path 
      d="M 172,216
         L 208,216
         L 236,326
         L 204,326
         Z" 
      fill="url(#${idPrefix}WLeftGrad)"
    />
    <!-- Center Left Wing -->
    <path 
      d="M 204,326
         L 236,326
         L 256,254
         L 238,254
         Z" 
      fill="#60a5fa"
    />
    <!-- Center Right Wing -->
    <path 
      d="M 256,254
         L 274,254
         L 308,326
         L 276,326
         Z" 
      fill="#3b82f6"
    />
    <!-- Right Wing of W -->
    <path 
      d="M 304,216
         L 340,216
         L 308,326
         L 276,326
         Z" 
      fill="url(#${idPrefix}WRightGrad)"
    />

    <!-- Top Connection Cap of W -->
    <rect x="172" y="212" width="36" height="6" rx="3" fill="#ffffff" />
    <rect x="304" y="212" width="36" height="6" rx="3" fill="#ffffff" />

    <!-- 3. The Security Core: Vault Lock Keyhole & Verification Indicator -->
    <g filter="url(#${idPrefix}SoftGlow)">
      <!-- Keyhole circle head -->
      <circle cx="256" cy="186" r="16" fill="url(#${idPrefix}VaultCoreGrad)" />
      <!-- Keyhole stem pointing into W -->
      <path 
        d="M 248,194 
           L 264,194 
           L 267,222 
           L 245,222 
           Z" 
        fill="url(#${idPrefix}VaultCoreGrad)" 
      />
    </g>

    <!-- Center Pulse Checkmark Accent in the Core -->
    <polyline 
      points="250,186 254,190 262,182" 
      fill="none" 
      stroke="#ffffff" 
      stroke-width="2.8" 
      stroke-linecap="round" 
      stroke-linejoin="round" 
    />

    <!-- 4. Concentric Verification Carrier Beacons (Top Right) -->
    <!-- Signal Wave 1 -->
    <path 
      d="M 364,136 C 382,152 392,174 394,198" 
      fill="none" 
      stroke="#38bdf8" 
      stroke-width="8" 
      stroke-linecap="round" 
    />
    <!-- Signal Wave 2 -->
    <path 
      d="M 396,108 C 422,132 436,162 438,198" 
      fill="none" 
      stroke="#38bdf8" 
      stroke-width="8" 
      stroke-linecap="round" 
      opacity="0.8" 
    />

    <!-- Verification Live Dot -->
    <circle cx="406" cy="98" r="9" fill="#10b981" />
    <circle cx="406" cy="98" r="4.5" fill="#ffffff" />
  </g>
`;

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${getMasterEmblemSvg('fav')}</svg>`;

const logoIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="48" height="48">${getMasterEmblemSvg('ico')}</svg>`;

const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 56" width="250" height="56">
  <defs>
    <linearGradient id="fullLogoTextGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
  </defs>

  <!-- Left Icon Scaled to 48x48 inside 56px height -->
  <g transform="translate(4, 4)">
    <svg viewBox="0 0 512 512" width="48" height="48">
      ${getMasterEmblemSvg('brandFull')}
    </svg>
  </g>

  <!-- Typography Wordmark -->
  <text x="64" y="38" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="30" letter-spacing="-0.5px">
    <tspan fill="#0f172a" font-weight="800">OTP</tspan>
    <tspan fill="url(#fullLogoTextGrad)" font-weight="800">Wala</tspan>
    <tspan fill="#94a3b8" font-weight="600" font-size="24">.me</tspan>
  </text>
</svg>`;

const logoWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 56" width="250" height="56">
  <defs>
    <linearGradient id="fullLogoWhiteTextGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
  </defs>

  <!-- Left Icon Scaled to 48x48 inside 56px height -->
  <g transform="translate(4, 4)">
    <svg viewBox="0 0 512 512" width="48" height="48">
      ${getMasterEmblemSvg('brandWhite')}
    </svg>
  </g>

  <!-- Typography Wordmark -->
  <text x="64" y="38" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="30" letter-spacing="-0.5px">
    <tspan fill="#f8fafc" font-weight="800">OTP</tspan>
    <tspan fill="url(#fullLogoWhiteTextGrad)" font-weight="800">Wala</tspan>
    <tspan fill="#64748b" font-weight="600" font-size="24">.me</tspan>
  </text>
</svg>`;

// OG Image with new brand emblem
const ogImageSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="ogBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>
    <linearGradient id="ogTextGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#38bdf8" />
    </linearGradient>
    <filter id="ogGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="80" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#ogBg)" />

  <!-- Ambient Glow Blobs -->
  <circle cx="150" cy="120" r="300" fill="#2563eb" opacity="0.25" filter="url(#ogGlow)" />
  <circle cx="1050" cy="480" r="340" fill="#0284c7" opacity="0.20" filter="url(#ogGlow)" />
  <circle cx="600" cy="300" r="200" fill="#10b981" opacity="0.08" filter="url(#ogGlow)" />

  <!-- Subtle Matrix Grid -->
  <g opacity="0.07" stroke="#ffffff" stroke-width="1">
    <line x1="120" y1="0" x2="120" y2="630" />
    <line x1="280" y1="0" x2="280" y2="630" />
    <line x1="440" y1="0" x2="440" y2="630" />
    <line x1="600" y1="0" x2="600" y2="630" />
    <line x1="760" y1="0" x2="760" y2="630" />
    <line x1="920" y1="0" x2="920" y2="630" />
    <line x1="1080" y1="0" x2="1080" y2="630" />
    <line x1="0" y1="120" x2="1200" y2="120" />
    <line x1="0" y1="260" x2="1200" y2="260" />
    <line x1="0" y1="400" x2="1200" y2="400" />
    <line x1="0" y1="540" x2="1200" y2="540" />
  </g>

  <!-- Brand Header with New Emblem -->
  <g transform="translate(100, 80)">
    <g transform="translate(0, 0)">
      <svg viewBox="0 0 512 512" width="76" height="76">
        ${getMasterEmblemSvg('ogBrand')}
      </svg>
    </g>
    
    <text x="96" y="52" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="46" font-weight="900" fill="#ffffff">
      OTP<tspan fill="url(#ogTextGrad)">Wala</tspan><tspan fill="#64748b" font-weight="600" font-size="36">.me</tspan>
    </text>
    <rect x="420" y="20" width="220" height="38" rx="19" fill="rgba(37,99,235,0.25)" stroke="rgba(59,130,246,0.5)" stroke-width="1.5" />
    <text x="530" y="44" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" fill="#93c5fd" letter-spacing="1">INSTANT VIRTUAL NUMBERS</text>
  </g>

  <!-- Main Headline -->
  <g transform="translate(100, 230)">
    <text font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="52" font-weight="800" fill="#f8fafc" line-height="1.2">
      <tspan x="0" y="0">Receive SMS Verification Codes</tspan>
      <tspan x="0" y="65">From <tspan fill="#38bdf8">980+ Global Services</tspan></tspan>
    </text>
    
    <text x="0" y="145" font-family="'Inter', system-ui, -apple-system, sans-serif" font-size="24" fill="#94a3b8">
      WhatsApp • Telegram • Google Cloud • Instagram • Microsoft &amp; more
    </text>
  </g>

  <!-- Feature Metric Pills -->
  <g transform="translate(100, 470)">
    <g transform="translate(0, 0)">
      <rect width="220" height="74" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <text x="24" y="32" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#64748b" letter-spacing="1">STARTING AT</text>
      <text x="24" y="58" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="24" font-weight="800" fill="#10b981">₹1.50 / SMS</text>
    </g>

    <g transform="translate(245, 0)">
      <rect width="220" height="74" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <text x="24" y="32" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#64748b" letter-spacing="1">DELIVERY SPEED</text>
      <text x="24" y="58" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="24" font-weight="800" fill="#38bdf8">&lt; 30 Seconds</text>
    </g>

    <g transform="translate(490, 0)">
      <rect width="220" height="74" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <text x="24" y="32" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#64748b" letter-spacing="1">SUCCESS RATE</text>
      <text x="24" y="58" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="24" font-weight="800" fill="#f59e0b">99.4% Verified</text>
    </g>

    <g transform="translate(735, 0)">
      <rect width="265" height="74" rx="16" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
      <text x="24" y="32" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="13" font-weight="700" fill="#64748b" letter-spacing="1">AUTO GUARANTEE</text>
      <text x="24" y="58" font-family="'Outfit', system-ui, -apple-system, sans-serif" font-size="22" font-weight="800" fill="#818cf8">100% Instant Refund</text>
    </g>
  </g>
</svg>`;

async function build() {
  console.log('--- Generating Brand SVGs ---');
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.svg'), faviconSvg, 'utf8');
  console.log('✓ apps/web/public/favicon.svg');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'logo-icon.svg'), logoIconSvg, 'utf8');
  console.log('✓ apps/web/public/logo-icon.svg');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'logo.svg'), logoSvg, 'utf8');
  console.log('✓ apps/web/public/logo.svg');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'logo-white.svg'), logoWhiteSvg, 'utf8');
  console.log('✓ apps/web/public/logo-white.svg');

  fs.writeFileSync(path.join(PUBLIC_DIR, 'og-image.svg'), ogImageSvg, 'utf8');
  console.log('✓ apps/web/public/og-image.svg');

  console.log('\n--- Generating High-Res PNGs ---');
  const masterSvgBuf = Buffer.from(faviconSvg);

  // 1. 512x512 Master PNG
  await sharp(masterSvgBuf)
    .resize(512, 512)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'favicon-512x512.png'));
  console.log('✓ apps/web/public/favicon-512x512.png (512x512)');

  // 2. 120x120 Google Cloud OAuth App Logo (exact Google Cloud spec)
  await sharp(masterSvgBuf)
    .resize(120, 120)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'google-app-logo-120x120.png'));
  console.log('✓ apps/web/public/google-app-logo-120x120.png (120x120 - Google Cloud OAuth Verification Spec)');

  // 3. 192x192 PWA Icon
  await sharp(masterSvgBuf)
    .resize(192, 192)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'favicon-192x192.png'));
  console.log('✓ apps/web/public/favicon-192x192.png (192x192)');

  // 4. 180x180 Apple Touch Icon
  await sharp(masterSvgBuf)
    .resize(180, 180)
    .png({ quality: 100, compressionLevel: 9 })
    .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
  console.log('✓ apps/web/public/apple-touch-icon.png (180x180)');

  // 5. 32x32 Favicon
  const buf32 = await sharp(masterSvgBuf)
    .resize(32, 32)
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon-32x32.png'), buf32);
  console.log('✓ apps/web/public/favicon-32x32.png (32x32)');

  // 6. 16x16 Favicon buffer for ICO
  const buf16 = await sharp(masterSvgBuf)
    .resize(16, 16)
    .png({ quality: 100, compressionLevel: 9 })
    .toBuffer();

  // 7. Multi-resolution favicon.ico (16x16 and 32x32)
  const numImages = 2;
  const icoHeader = Buffer.alloc(6);
  icoHeader.writeUInt16LE(0, 0); // Reserved
  icoHeader.writeUInt16LE(1, 2); // Type 1 = ICO
  icoHeader.writeUInt16LE(numImages, 4); // 2 images

  let offset = 6 + (16 * numImages);
  const entries = [];
  const images = [
    { buf: buf16, w: 16, h: 16 },
    { buf: buf32, w: 32, h: 32 }
  ];

  for (const img of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.w, 0);
    entry.writeUInt8(img.h, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(img.buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += img.buf.length;
  }

  const icoBuf = Buffer.concat([icoHeader, ...entries, ...images.map(i => i.buf)]);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'favicon.ico'), icoBuf);
  console.log('✓ apps/web/public/favicon.ico (Multi-res ICO)');

  // 8. OG Image PNG (1200x630)
  const ogSvgBuf = Buffer.from(ogImageSvg);
  await sharp(ogSvgBuf)
    .resize(1200, 630)
    .png({ quality: 95 })
    .toFile(path.join(PUBLIC_DIR, 'og-image.png'));
  console.log('✓ apps/web/public/og-image.png (1200x630)');

  console.log('\nAll brand assets successfully exported!');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
