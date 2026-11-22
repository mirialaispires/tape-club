// Gera a família de logos do Tape Club (SVG puro, letras desenhadas à mão como caminhos: não dependem de fonte).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'img', 'brand');
mkdirSync(OUT, { recursive: true });

const G = { // [largura, caminho] — altura de capitular 100
  T: [70, 'M0 0H70V22H46V100H24V22H0Z'],
  A: [72, 'M0 100L27 0H45L72 100H49L45 80H27L23 100ZM31 60H41L36 30Z'],
  P: [64, 'M0 0H38C54 0 64 10 64 28C64 46 54 56 38 56H23V100H0ZM23 20V36H36C41 36 42 33 42 28C42 23 41 20 36 20Z'],
  E: [60, 'M0 0H60V20H23V40H54V60H23V80H60V100H0Z'],
  C: [66, 'M66 30H44C44 22 41 20 35 20C28 20 24 26 24 50C24 74 28 80 35 80C41 80 44 78 44 70H66C66 90 54 100 33 100C10 100 0 86 0 50C0 14 10 0 33 0C54 0 66 10 66 30Z'],
  L: [58, 'M0 0H23V80H58V100H0Z'],
  U: [68, 'M0 0H23V70C23 78 26 80 34 80C42 80 45 78 45 70V0H68V72C68 92 56 100 34 100C12 100 0 92 0 72Z'],
  B: [66, 'M0 0H40C56 0 64 8 64 24C64 34 60 40 53 44C62 47 66 55 66 68C66 90 56 100 38 100H0ZM23 18V38H35C40 38 41 35 41 28C41 21 40 18 35 18ZM23 58V82H36C42 82 43 78 43 70C43 62 42 58 36 58Z'],
};
const SK = Math.tan(10 * Math.PI / 180);

function word(text, fill) {
  let x = 0; const parts = [];
  for (const ch of text) { const [w, d] = G[ch]; parts.push(`<path transform="translate(${x} 0)" d="${d}"/>`); x += w + 8; }
  return { w: x - 8, svg: `<g fill="${fill}" fill-rule="evenodd" transform="translate(${(100 * SK).toFixed(1)} 0) skewX(-10)">${parts.join('')}</g>` };
}
const SCHEMES = {
  dark:  { a: '#F1E4C8', b: '#E3A62A', disc: '#C4402B', hub: '#F1E4C8', teeth: '#2A0A12', r1: '#C4402B', r2: '#E3A62A' },
  light: { a: '#4A101D', b: '#B23A24', disc: '#4A101D', hub: '#E3A62A', teeth: '#F1E4C8', r1: '#B23A24', r2: '#D49A1E' },
  mono:  { a: 'currentColor', b: 'currentColor', disc: 'currentColor', hub: 'currentColor', teeth: 'none', r1: 'currentColor', r2: 'currentColor' },
};
function reel(cx, cy, r, c, mono) {
  const teeth = mono ? '' : [0, 60, 120, 180, 240, 300].map((a) => `<rect x="${cx - 2.5}" y="${cy - r * 0.36}" width="5" height="${r * 0.14}" fill="${c.teeth}" transform="rotate(${a} ${cx} ${cy})"/>`).join('');
  return `<path fill="${c.disc}" fill-rule="evenodd" d="M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0ZM${cx - r * 0.66} ${cy}a${r * 0.66} ${r * 0.66} 0 1 1 ${r * 1.32} 0a${r * 0.66} ${r * 0.66} 0 1 1 ${-r * 1.32} 0Z"/>`
    + `<path fill="${c.hub}" fill-rule="evenodd" d="M${cx - r * 0.4} ${cy}a${r * 0.4} ${r * 0.4} 0 1 0 ${r * 0.8} 0a${r * 0.4} ${r * 0.4} 0 1 0 ${-r * 0.8} 0Z${mono ? `M${cx - r * 0.18} ${cy}a${r * 0.18} ${r * 0.18} 0 1 1 ${r * 0.36} 0a${r * 0.18} ${r * 0.18} 0 1 1 ${-r * 0.36} 0Z` : ''}"/>${teeth}`
    + `<g stroke="${c.disc}" stroke-width="${r * 0.12}" stroke-linecap="round" opacity="0"/>`;
}
function ribbon(d, c, sw = 9, gap = 12) {
  return `<g fill="none" stroke-linecap="round" stroke-width="${sw}"><path stroke="${c.r1}" d="${d}"/><path stroke="${c.r2}" transform="translate(0 ${gap})" d="${d}"/></g>`;
}
const wrap = (vb, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;

function full(s) {
  const c = SCHEMES[s], m = s === 'mono';
  const t = word('TAPE', c.a), k = word('CLUB', c.b);
  const lx = 150;
  return wrap('0 0 850 190',
    reel(70, 80, 54, c, m)
    + ribbon('M74 128C112 172 180 164 262 160S520 156 700 162S812 154 834 110', c)
    + `<g transform="translate(${lx} 30)">${t.svg}</g><g transform="translate(${lx + t.w + 40} 30)">${k.svg}</g>`, 'Tape Club');
}
function compact(s) {
  const c = SCHEMES[s], m = s === 'mono';
  const t = word('TAPE', c.a), k = word('CLUB', c.b);
  return wrap('0 0 420 160',
    reel(70, 70, 54, c, m)
    + ribbon('M74 118C112 154 190 146 270 144S380 138 404 100', c, 7, 10)
    + `<g transform="translate(150 18) scale(.5)">${t.svg}</g><g transform="translate(150 78) scale(.5)">${k.svg}</g>`, 'Tape Club');
}
function mark(s) {
  const c = SCHEMES[s], m = s === 'mono';
  return wrap('0 0 160 168', reel(66, 66, 54, c, m) + ribbon('M70 112C100 144 130 138 141 124S152 100 146 86', c, 11, 14), 'Tape Club');
}
const files = {};
for (const s of ['dark', 'light', 'mono']) {
  const suf = s === 'dark' ? '' : `-${s}`;
  files[`logo-full${suf}.svg`] = full(s);
  files[`logo-compact${suf}.svg`] = compact(s);
  files[`mark${suf}.svg`] = mark(s);
}
// Favicon: o carretel num disco vinho para ler bem em abas claras e escuras.
files['favicon.svg'] = wrap('0 0 64 64', `<circle cx="32" cy="32" r="32" fill="#2A0A12"/><g transform="translate(5 6) scale(.31)">${reel(66, 66, 54, SCHEMES.dark)}${ribbon('M86 114C104 140 130 136 140 124S152 100 146 88', SCHEMES.dark, 14, 17)}</g>`, 'Tape Club');
for (const [n, v] of Object.entries(files)) writeFileSync(join(OUT, n), v);
console.log(Object.keys(files).join('\n'));
