// Gera as texturas do corredor (SVG). Rode: node scripts/gen-scene.mjs
// Cenário de locadora à noite: parede vinho, estantes de madeira com lombadas volumosas, cartazes emoldurados com brilho de vidro.
// São só formas e cores: nenhuma lombada do cenário tem texto, para nunca parecer um registro real do clube.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/img/scene');
mkdirSync(out, { recursive: true });

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0), (s = (s + 0x6d2b79f5) >>> 0), ((s ^ (s >>> 14)) >>> 0) / 4294967296);
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
};

// lombadas: muitas escuras (como numa locadora de verdade), com acentos de vinho, vermelho queimado, mostarda, madeira e roxo
const SPINES = ['#1d1514', '#1d1514', '#241a18', '#2b1d1a', '#5a1b2b', '#5a1b2b', '#7b2a3d', '#8c3220', '#a8442b', '#c9962f', '#b98626', '#6b4129', '#4a2a5c', '#3d2a47', '#e0d3b6', '#1c2a2c', '#7a6a55'];
const POSTER = [['#c9962f', '#8c3220', '#35101a'], ['#5a1b2b', '#e0d3b6', '#c9962f'], ['#8c3220', '#dba944', '#24160f'], ['#e0d3b6', '#5a1b2b', '#b4452c'], ['#24160f', '#dba944', '#8c3220'], ['#4a2a5c', '#e0d3b6', '#dba944']];

const W = 840, H = 560, TOP = 170, ROW = 78;

const DEFS = `<defs>
<linearGradient id="cyl" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset=".22" stop-color="#fff" stop-opacity=".04"/><stop offset=".7" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
<linearGradient id="wallg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a0e16"/><stop offset=".7" stop-color="#3a1520"/><stop offset="1" stop-color="#2c1018"/></linearGradient>
<linearGradient id="back" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#150a07"/><stop offset="1" stop-color="#2a1610"/></linearGradient>
<linearGradient id="board" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b57a49"/><stop offset=".2" stop-color="#8f5a35"/><stop offset=".85" stop-color="#5e3820"/><stop offset="1" stop-color="#2d170b"/></linearGradient>
<linearGradient id="post" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#9a6238"/><stop offset=".12" stop-color="#7d4a2a"/><stop offset="1" stop-color="#4f2c17"/></linearGradient>
<linearGradient id="drop" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="gloss" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".42" stop-color="#fff" stop-opacity=".06"/><stop offset=".43" stop-color="#fff" stop-opacity="0"/></linearGradient>
<radialGradient id="wash" cx=".5" cy="0" r=".7"><stop offset="0" stop-color="#ffb866" stop-opacity=".34"/><stop offset="1" stop-color="#ffb866" stop-opacity="0"/></radialGradient>
<linearGradient id="edge" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".06" stop-color="#000" stop-opacity="0"/><stop offset=".94" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.18"/></filter>
<filter id="wood" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .55" numOctaves="3" seed="9"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .05  0 0 0 0 .02  0 0 0 .8 -.28"/></filter>
</defs>`;

function wall(seed) {
  const r = rng(seed);
  const o = [DEFS];
  // parede superior: vinho com uma lavagem de luz quente vinda do teto
  o.push(`<rect width="${W}" height="${TOP}" fill="url(#wallg)"/><rect width="${W}" height="${TOP}" fill="url(#wash)"/>`);
  o.push(`<rect y="0" width="${W}" height="10" fill="#1a090d"/><rect y="${TOP - 22}" width="${W}" height="9" fill="#8c3220"/><rect y="${TOP - 22}" width="${W}" height="2" fill="#c9604a" opacity=".7"/><rect y="${TOP - 12}" width="${W}" height="3" fill="#dba944" opacity=".85"/><rect y="${TOP - 9}" width="${W}" height="9" fill="url(#drop)" opacity=".7"/>`);
  // cartazes emoldurados (formas abstratas)
  let x = 24;
  while (x < W - 70) {
    const w = 48 + Math.floor(r() * 26), h = Math.min(TOP - 54, w * 1.45);
    const y = 24 + Math.floor(r() * 8);
    const [a, b, c] = pick(r, POSTER);
    const kind = Math.floor(r() * 4);
    o.push(`<g><rect x="${x - 4}" y="${y - 4}" width="${w + 8}" height="${h + 8}" rx="1.5" fill="#1b0f0a"/><rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="1" fill="#4a2c1b"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${a}"/>`);
    if (kind === 0) o.push(`<circle cx="${x + w / 2}" cy="${y + h * 0.42}" r="${w * 0.3}" fill="${b}"/><rect x="${x}" y="${y + h * 0.62}" width="${w}" height="${h * 0.38}" fill="${c}"/>`);
    else if (kind === 1) o.push(`<path d="M${x} ${y + h} L${x + w * 0.4} ${y + h * 0.35} L${x + w * 0.7} ${y + h * 0.7} L${x + w} ${y + h * 0.5} L${x + w} ${y + h}Z" fill="${b}"/><circle cx="${x + w * 0.75}" cy="${y + h * 0.2}" r="${w * 0.12}" fill="${c}"/>`);
    else if (kind === 2) o.push(`<rect x="${x}" y="${y}" width="${w}" height="${h * 0.14}" fill="${c}"/>` + [0, 1, 2].map((i) => `<rect x="${x + w * 0.12}" y="${y + h * (0.3 + i * 0.17)}" width="${w * 0.76}" height="${h * 0.08}" fill="${b}"/>`).join(''));
    else o.push(`<circle cx="${x + w / 2}" cy="${y + h * 0.5}" r="${w * 0.36}" fill="${b}"/><circle cx="${x + w / 2}" cy="${y + h * 0.5}" r="${w * 0.2}" fill="${c}"/>`);
    o.push(`<rect x="${x}" y="${y + h - 7}" width="${w}" height="7" fill="${shade(a, 0.7)}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#gloss)"/></g>`);
    x += w + 28 + Math.floor(r() * 40);
  }
  // prateleiras
  for (let k = 0; k < 5; k++) {
    const y0 = TOP + k * ROW;
    o.push(`<rect y="${y0}" width="${W}" height="${ROW}" fill="url(#back)"/>`);
    let sx = 12;
    while (sx < W - 12) {
      const faceOut = r() < 0.075 && sx + 48 < W - 14;
      if (faceOut) {
        const [a, b, c] = pick(r, POSTER);
        const fw = 42, fh = 62, fy = y0 + 64 - fh;
        o.push(`<rect x="${sx}" y="${fy}" width="${fw}" height="${fh}" fill="#120a08"/><rect x="${sx + 2}" y="${fy + 2}" width="${fw - 4}" height="${fh - 4}" fill="${a}"/><circle cx="${sx + fw / 2}" cy="${fy + 24}" r="12" fill="${b}"/><rect x="${sx + 2}" y="${fy + 38}" width="${fw - 4}" height="22" fill="${c}"/><rect x="${sx + 6}" y="${fy + 8}" width="${fw - 12}" height="5" fill="${shade(a, 0.7)}"/><rect x="${sx}" y="${fy}" width="${fw}" height="${fh}" fill="url(#gloss)"/><rect x="${sx}" y="${fy}" width="${fw}" height="${fh}" fill="url(#cyl)" opacity=".5"/>`);
        sx += fw + 2;
        continue;
      }
      const w = 8 + Math.floor(r() * 8), h = 48 + Math.floor(r() * 14);
      const c = pick(r, SPINES), y = y0 + 64 - h;
      o.push(`<rect x="${sx}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`);
      o.push(`<rect x="${sx + 1}" y="${y + 3}" width="${w - 3}" height="9" fill="#e6dac0" opacity=".9"/>`);
      if (r() < 0.6) o.push(`<rect x="${sx + 2}" y="${y + 16}" width="${w - 5}" height="1.6" fill="${shade(c, 0.45)}" opacity=".9"/><rect x="${sx + 2}" y="${y + 20}" width="${w - 6}" height="1.6" fill="${shade(c, 0.45)}" opacity=".9"/>`);
      if (r() < 0.25) o.push(`<rect x="${sx + 1}" y="${y + h - 12}" width="${w - 3}" height="4" fill="${pick(r, ['#dba944', '#b4452c', '#e0d3b6'])}"/>`);
      o.push(`<rect x="${sx}" y="${y}" width="${w}" height="${h}" fill="url(#cyl)"/>`);
      sx += w + (r() < 0.06 ? 5 : 0.6);
    }
    // sombra projetada pela tábua de cima, em cima das lombadas
    o.push(`<rect y="${y0}" width="${W}" height="30" fill="url(#drop)"/>`);
    // tábua da prateleira, com veio da madeira
    o.push(`<rect y="${y0 + 64}" width="${W}" height="14" fill="url(#board)"/><rect y="${y0 + 64}" width="${W}" height="14" filter="url(#wood)" opacity=".7"/><rect y="${y0 + 64}" width="${W}" height="2" fill="#e0a56a" opacity=".6"/>`);
  }
  // montantes de madeira
  for (const ux of [0, W / 2]) o.push(`<rect x="${ux}" y="${TOP}" width="12" height="${H - TOP}" fill="url(#post)"/><rect x="${ux}" y="${TOP}" width="12" height="${H - TOP}" filter="url(#wood)" opacity=".5"/>`);
  // acabamento: vinheta lateral e grão de filme
  o.push(`<rect width="${W}" height="${H}" fill="url(#edge)"/><rect width="${W}" height="${H}" filter="url(#grain)" opacity=".5"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.join('')}</svg>`;
}

function carpet() {
  const o = [`<defs><filter id="fiber" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7 .9" numOctaves="3" seed="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .9 -.32"/></filter></defs>`];
  o.push('<rect width="96" height="96" fill="#4a1420"/>');
  o.push('<path d="M48 4 L92 48 L48 92 L4 48Z" fill="none" stroke="#7b2a3d" stroke-width="3"/>');
  o.push('<path d="M48 22 L74 48 L48 74 L22 48Z" fill="#3a0f19"/>');
  o.push('<circle cx="48" cy="48" r="3.5" fill="#c9962f" opacity=".7"/>');
  for (const [x, y] of [[0, 0], [96, 0], [0, 96], [96, 96]]) o.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="#c9962f" opacity=".5"/>`);
  o.push('<rect width="96" height="96" filter="url(#fiber)" opacity=".8"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">${o.join('')}</svg>`;
}

writeFileSync(path.join(out, 'shelves.svg'), wall(7));
writeFileSync(path.join(out, 'shelves-b.svg'), wall(1991));
writeFileSync(path.join(out, 'carpet.svg'), carpet());
console.log('texturas geradas em', out);
