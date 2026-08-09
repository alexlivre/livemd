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

console.log('✓ Ícone gerado em build/icon.png e build/icon.ico');
console.log(`  ICO: ${ico.length} bytes`);