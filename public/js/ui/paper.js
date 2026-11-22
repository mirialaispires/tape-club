// Superfícies: cartões, etiquetas de preço e placas de setor.
import { h } from '../lib/dom.js';

/**
 * Cartão de superfície. tone: cream | mustard | petrol (bordô claro) | tomato | pink | wine (escuro, texto claro).
 * Os parâmetros tilt/seed/tape/stars/amp são aceitos por compatibilidade com as telas, mas o acabamento agora é
 * de cartão (borda fina, sombra em camadas, grão sutil), sem bordas rasgadas nem inclinação.
 */
export function Paper(children, { tone = 'cream', tag = 'div', cls = '', attrs = {} } = {}) {
  const body = h('div', { class: 'paper__body' }, children);
  return h(tag, { class: ['paper', `paper--${tone}`, cls], ...attrs }, body);
}

/** Etiqueta de preço/classificação presa com um furinho. */
export function Tag(children, { tone = 'mustard', cls = '' } = {}) {
  return h('span', { class: ['pricetag', `pricetag--${tone}`, cls] }, children);
}

/** Placa de setor (cabeçalho de prateleira): placa de latão escuro com o nome do setor. */
export function Placard({ title, link, linkText = 'Ver todos', tag = 'h2', id }) {
  const body = h('div', { class: 'placard__body' },
    h(tag, { class: 'placard__title', id }, title),
    link ? h('a', { class: 'placard__link', href: link }, linkText, h('span', { 'aria-hidden': 'true' }, ' →')) : null);
  return h('div', { class: 'placard' }, body);
}
