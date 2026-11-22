// Cabeçalho de página: uma plaquinha de papel com o nome do departamento e uma frase do balcão.
import { h } from '../lib/dom.js';
import { Paper, Placard } from './paper.js';

export function PageHead({ kicker, title, lead, actions = [], seed = 5, tone = 'cream' }) {
  return h('header', { class: 'pagehead' },
    Paper([
      kicker ? h('p', { class: 'note-kicker' }, kicker) : null,
      h('h1', { class: 'pagehead__title', tabindex: '-1' }, title),
      lead ? h('p', { class: 'note-text' }, lead) : null,
      actions.length ? h('div', { class: 'pagehead__actions' }, actions) : null,
    ], { tone, tilt: -0.6, seed, amp: 4, cls: 'pagehead__paper' }));
}

/** Armário com placa de setor e prateleira dentro (padrão das páginas de lista). */
export function ShelfUnit({ id, title, seed = 8, link, linkText, shelf, side = null, foot = null }) {
  return h('section', { class: 'unit', 'aria-labelledby': id },
    Placard({ title, link, linkText, id, seed }),
    h('div', { class: 'unit__cab' }, h('div', { class: side ? 'unit__grid' : 'unit__grid unit__grid--solo' }, shelf, side ? h('div', { class: 'unit__side' }, side) : null)),
    foot);
}
