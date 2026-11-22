// Prateleiras de madeira com fitas: lombadas e capas frontais misturadas, sempre alimentadas por títulos reais.
import { h } from '../lib/dom.js';
import { hash, fmtStars, onColor, starsLabel } from '../lib/format.js';
import { Tape, stickerFor } from './tape.js';

const SPINE_COLORS = ['#8c3220', '#c9962f', '#5a1b2b', '#24160f', '#7b2a3d', '#b4452c', '#4a2a5c', '#35101a', '#a8442b', '#6b4129', '#e0d3b6', '#2b1d1a'];
const cards = new WeakMap();
export const cardFor = (el) => cards.get(el);

/** O que cabe numa lombada: o título principal (antes de dois-pontos ou travessão). O título completo fica no rótulo de acessibilidade e na dica. */
export const spineText = (title) => title.split(/\s*[:–—]\s+| - /)[0] || title;
const tipOf = (t) => `${t.title}${t.year ? ` (${t.year})` : ''}`;
const labelOf = (t, rating) => `${tipOf(t)}${t.kind === 'tv' ? ', série' : ''}. ${rating != null ? starsLabel(rating) : 'sem nota'}${t.favorite ? ', favorita' : ''}. Abrir ficha.`;

export function Spine(t, { rating = null } = {}) {
  const color = SPINE_COLORS[hash(`${t.title}${t.year ?? ''}`) % SPINE_COLORS.length];
  const width = t.kind === 'tv' ? 42 : 27 + Math.min(12, Math.max(0, Math.round(((t.runtime || 100) - 70) / 7)));
  const height = 0.8 + (hash(t.title) % 9) / 100;
  const el = h('button', {
    class: ['spine', t.favorite && 'is-fav', t.kind === 'tv' && 'is-tv'], type: 'button', 'data-title-id': t.id,
    'data-tip': tipOf(t), 'aria-label': labelOf(t, rating),
    style: { '--c': color, '--fg': onColor(color), '--w': `${width}px`, '--h': height },
  },
  t.favorite ? h('span', { class: 'spine__fav', 'aria-hidden': 'true' }, '★') : null,
  rating != null ? h('span', { class: 'spine__rate', 'aria-hidden': 'true' }, fmtStars(rating)) : null,
  h('span', { class: 'spine__label', 'aria-hidden': 'true' }, h('span', { class: 'spine__title' }, spineText(t.title))),
  h('span', { class: 'spine__no', 'aria-hidden': 'true' }, t.kind === 'tv' ? 'SÉRIE' : String(t.id).padStart(3, '0')));
  cards.set(el, t);
  return el;
}

export function Face(t, { rating = null, sticker = undefined } = {}) {
  const el = h('button', {
    class: ['face', t.favorite && 'is-fav'], type: 'button', 'data-title-id': t.id, 'data-tip': tipOf(t), 'aria-label': labelOf(t, rating),
    style: { '--tilt': `${((hash(t.title) % 7) - 3) * 0.7}deg` },
  },
  Tape(t, { sizes: '(max-width: 600px) 36vw, 170px', alt: '', sticker: sticker === undefined ? (t.isNew || (t.addedAt && Date.now() - Date.parse(t.addedAt) < 7 * 86_400_000) ? { text: 'Novo', tone: 'yellow' } : null) : sticker }),
  rating != null ? h('span', { class: 'face__rate', 'aria-hidden': 'true' }, fmtStars(rating)) : null,
  t.favorite ? h('span', { class: 'face__fav', 'aria-hidden': 'true' }, '★') : null);
  cards.set(el, t);
  return el;
}

/**
 * @param items   títulos (cartões da API)
 * @param opt.mode 'mixed' | 'faces' | 'spines'
 * @param opt.rating 'avg' (média do clube) | 'mine' (minha nota)
 * @param opt.endCap nó opcional ao fim da prateleira (ex.: "espaço livre — cadastrar fita")
 */
export function Shelf(items, { mode = 'mixed', rating = 'avg', faceChance = 0.4, label = 'Prateleira', endCap = null, rows = 1 } = {}) {
  const el = h('div', { class: 'shelf on-wood', role: 'list', 'aria-label': label, style: { '--min-rows': rows } });
  items.forEach((t, i) => {
    const r = rating === 'mine' ? t.myRating : t.avgRating;
    const face = mode === 'faces' || (mode === 'mixed' && (i === 0 || t.favorite || (t.posterRef && hash(`${t.title}x`) % 100 < faceChance * 100)));
    el.appendChild(h('div', { class: 'slot', role: 'listitem', style: { '--i': Math.min(i, 28) } },
      face ? Face(t, { rating: r }) : Spine(t, { rating: r })));
  });
  if (endCap) el.appendChild(h('div', { class: 'slot slot--cap', role: 'listitem' }, endCap));
  return el;
}

/** Lombada em branco, "espaço livre": ação real de cadastrar uma fita. */
export function FreeSlot(text, onClick) {
  return h('button', { class: 'freeslot', type: 'button', onClick },
    h('span', { class: 'freeslot__plus', 'aria-hidden': 'true' }, '+'), h('span', null, text));
}

/** Caixa de VHS em destaque (3D leve): a capa frontal é o pôster original, com a espessura da caixa ao lado. */
export function VhsBox(t, { rating = null } = {}) {
  const el = h('button', { class: ['vhs', t.favorite && 'is-fav'], type: 'button', 'data-title-id': t.id, 'aria-label': labelOf(t, rating) },
    h('span', { class: 'vhs__front' },
      Tape(t, { eager: true, sizes: '(max-width: 700px) 40vw, 260px', width: 'w500', sticker: null }),
      rating != null ? h('span', { class: 'vhs__rate', 'aria-hidden': 'true' }, fmtStars(rating)) : null),
    h('span', { class: 'vhs__side', 'aria-hidden': 'true' }, h('span', { class: 'vhs__label' }, 'TAPE CLUB'), h('span', { class: 'vhs__no' }, t.kind === 'tv' ? 'SÉRIE' : String(t.id).padStart(3, '0'))));
  cards.set(el, t);
  return el;
}
