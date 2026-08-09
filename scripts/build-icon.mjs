import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import pngToIco from 'png-to-ico';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = join(root, 'build', 'icon.svg');
const svg = readFileSync(svgPath, 'utf8');

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)'
  });
  return resvg.render().asPng();
}

const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });

// Main app icon (large PNG for general use)
const png1024 = renderPng(1024);
writeFileSync(join(buildDir, 'icon.png'), png1024);

// Multi-size ICO for Windows (NSIS, Explorer icon, etc.)
const sizes = [256, 128, 64, 48, 32, 24, 16];
const pngBuffers = sizes.map((size) => renderPng(size));
const ico = await pngToIco(pngBuffers);
writeFileSync(join(buildDir, 'icon.ico'), ico);

// Branded MUI2 header bitmap for the NSIS installer (150x57 BMP).
const HEADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 57">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7aa2f7"/>
      <stop offset="100%" stop-color="#5d7dc4"/>
    </linearGradient>
  </defs>
  <rect width="150" height="57" fill="url(#g)"/>
  <text x="16" y="38" font-family="Segoe UI, Arial, sans-serif" font-size="21" font-weight="600" fill="#ffffff">LiveMD</text>
  <g transform="translate(101 8)">
    <rect width="41" height="41" rx="9" fill="#ffffff" opacity="0.95"/>
    <rect width="41" height="9" rx="4.5" fill="#2a2f3a"/>
    <circle cx="7" cy="4.5" r="2.2" fill="#f7768e"/>
    <circle cx="13" cy="4.5" r="2.2" fill="#e0af68"/>
    <circle cx="19" cy="4.5" r="2.2" fill="#9ece6a"/>
    <text x="20.5" y="31" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="#2a2f3a">MD</text>
  </g>
</svg>`;

// Minimal 24-bit BMP encoder (bottom-up rows, BGR, row padding).
function encodeBmp(rendered) {
  const { width, height, pixels } = rendered;
  const rowSize = Math.ceil((width * 3) / 4) * 4;
  const pixelOffset = 54;
  const fileSize = pixelOffset + rowSize * height;
  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0, 2, 'ascii');
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(pixelOffset, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(rowSize * height, 34);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = pixelOffset + (height - 1 - y) * rowSize + x * 3;
      buf[di] = pixels[si + 2];
      buf[di + 1] = pixels[si + 1];
      buf[di + 2] = pixels[si];
    }
  }
  return buf;
}

function renderHeader(path) {
  const resvg = new Resvg(HEADER_SVG, {
    fitTo: { mode: 'width', value: 150 },
    background: 'rgba(0,0,0,0)'
  });
  return encodeBmp(resvg.render());
}

const header = renderHeader();
writeFileSync(join(buildDir, 'installer-header.bmp'), header);

console.log('✓ Ícone gerado em build/icon.png e build/icon.ico');
console.log(`  ICO: ${ico.length} bytes`);
console.log('✓ Header de instalação gerado em build/installer-header.bmp');