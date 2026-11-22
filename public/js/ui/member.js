// Integrantes: um ponto colorido com a inicial (a cor nunca é a única informação — o nome sempre acompanha).
import { h } from '../lib/dom.js';
import { memberById } from '../lib/store.js';
import { initial, onColor } from '../lib/format.js';

export function MemberDot(m, { size = '' } = {}) {
  if (!m) return h('span', { class: `dot${size ? ` dot--${size}` : ''}`, title: 'Ex-integrante' }, '?');
  return h('span', {
    class: `dot${size ? ` dot--${size}` : ''}`, style: { '--c': m.color, '--fg': onColor(m.color) }, title: m.name, 'aria-hidden': 'true',
  }, initial(m.name));
}

export const MemberDots = (ids, opts) => {
  const ms = ids.map(memberById);
  return h('span', { class: 'dots', role: 'img', 'aria-label': ms.map((m) => m?.name ?? 'ex-integrante').join(', ') }, ms.map((m) => MemberDot(m, opts)));
};

export function MemberTag(m, { size = 'sm' } = {}) {
  return h('span', { class: 'row', style: { gap: '7px', display: 'inline-flex', flexWrap: 'nowrap' } }, MemberDot(m, { size }), h('span', { class: 'sign' }, m?.name ?? 'Ex-integrante'));
}
