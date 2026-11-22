// A capa (fita): imagem da fonte com marcador de espaço, proporção preservada e capa tipográfica de reserva.
import { h } from '../lib/dom.js';
import { imageUrl, imageSrcset, hash, STATUS, KIND } from '../lib/format.js';

const FALLBACKS = [
  { bg: '#5a1b2b', fg: '#f5ecd6' }, { bg: '#8c3220', fg: '#fff3e0' }, { bg: '#c9962f', fg: '#24160f' },
  { bg: '#24160f', fg: '#dba944' }, { bg: '#4a2a5c', fg: '#f5ecd6' }, { bg: '#35101a', fg: '#dba944' }, { bg: '#e8dcc0', fg: '#8c3220' },
];

function fallback(t) {
  const c = FALLBACKS[hash(`${t.title}${t.year ?? ''}`) % FALLBACKS.length];
  const len = (t.title ?? '').length;
  const k = len <= 10 ? 15 : len <= 18 ? 12 : len <= 28 ? 9.5 : 7.5;
  return h('div', { class: 'tape-fallback', style: { '--bg': c.bg, '--fg': c.fg, '--k': k } },
    h('span', { class: 'tape-fallback__top' }, 'Tape-Club'),
    h('span', { class: 'tape-fallback__title' }, t.title),
    h('span', { class: 'tape-fallback__bottom' }, h('span', null, t.year ?? 's/ ano'), h('em', null, 'sem capa')));
}

/**
 * @param t   { title, year, posterRef }
 * @param opt { sizes, alt, sticker: {text, tone}, eager }
 */
export function Tape(t, { sizes = '(max-width: 600px) 45vw, 220px', alt = '', sticker = null, eager = false, width = 'w342' } = {}) {
  const el = h('span', { class: 'tape' });
  const src = imageUrl(t.posterRef, width);
  if (!src) {
    el.append(fallback(t));
    el.classList.add('is-loaded');
  } else {
    const img = h('img', {
      class: 'tape__img', src, alt, sizes, decoding: 'async', loading: eager ? 'eager' : 'lazy', referrerpolicy: 'no-referrer',
      srcset: imageSrcset(t.posterRef) ?? undefined,
    });
    img.addEventListener('load', () => {
      const r = img.naturalWidth / img.naturalHeight; // preserva a proporção original da imagem
      if (r && Math.abs(r - 2 / 3) / (2 / 3) > 0.03) el.style.setProperty('aspect-ratio', String(Math.min(0.8, Math.max(0.58, r))));
      el.classList.add('is-loaded');
    });
    img.addEventListener('error', () => {
      img.remove();
      el.append(fallback(t));
      el.classList.add('is-loaded');
    });
    el.append(img);
  }
  if (sticker) el.append(h('span', { class: `label label--${sticker.tone ?? 'ink'} tape__sticker` }, sticker.text));
  return el;
}

export function GhostTape() { return h('span', { class: 'tape tape--ghost', 'aria-hidden': 'true' }); }

const WEEK = 7 * 86_400_000;
export function stickerFor(card) {
  if (card.isNew || (card.addedAt && Date.now() - Date.parse(card.addedAt) < WEEK)) return { text: 'Novo', tone: 'yellow' };
  const s = card.status;
  if (!s || s === 'none') return null;
  const tone = { watched: 'ink', watching: 'green', planned: 'blue', abandoned: 'red' }[s];
  return { text: { watched: 'Visto', watching: 'Assistindo', planned: 'Na fila', abandoned: 'Largada' }[s], tone };
}

export const kindLabel = (k) => KIND[k] ?? k;
export const statusLabel = (s) => STATUS[s]?.label ?? s;
