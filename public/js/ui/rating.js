// Notas em meias-estrelas: exibição e entrada (grupo de 10 botões de rádio, operável por teclado).
import { h } from '../lib/dom.js';
import { fmtStars, starsPct, starsLabel } from '../lib/format.js';
import { pop } from '../lib/motion.js';

export function Stars(rating, { size = '', tone = '', label = true } = {}) {
  return h('span', {
    class: `stars${size ? ` stars--${size}` : ''}${tone ? ` stars--${tone}` : ''}`,
    style: { '--w': starsPct(rating) }, role: 'img', 'aria-label': starsLabel(rating),
  });
}

export function Rating(rating, { size = '', tone = '' } = {}) {
  if (rating === null || rating === undefined) return h('span', { class: 'rating rating--none' }, 'sem nota');
  return h('span', { class: 'rating' }, Stars(rating, { size, tone }), h('span', { class: 'num' }, fmtStars(rating)));
}

const WORDS = ['', 'Quase nada', 'Muito fraco', 'Fraco', 'Abaixo da média', 'Regular', 'Passável', 'Bom', 'Muito bom', 'Ótimo', 'Obra-prima'];
// índice = nota interna (1–10); descreve a nota em palavras para leitura rápida
const WORD = (n) => ({ 1: 'Quase nada', 2: 'Muito fraco', 3: 'Fraco', 4: 'Fraquinho', 5: 'Regular', 6: 'Passável', 7: 'Bom', 8: 'Muito bom', 9: 'Ótimo', 10: 'Obra-prima' }[n] ?? '');

export function RatingInput({ value = null, onChange, name = 'nota', label = 'Nota' } = {}) {
  let current = value;
  const stars = h('span', { class: 'stars stars--lg', style: { '--w': starsPct(current) }, 'aria-hidden': 'true' });
  const read = h('div', { class: 'rate-input__read', 'aria-live': 'polite' });
  const halves = [];
  const render = (preview) => {
    const shown = preview ?? current;
    stars.style.setProperty('--w', starsPct(shown));
    read.replaceChildren(shown ? h('span', null, `${fmtStars(shown)} de 5`, h('small', null, WORD(shown))) : h('small', { class: 'faint' }, 'Passe o mouse ou toque nas estrelas'));
    halves.forEach((b, i) => {
      b.setAttribute('aria-checked', String(current === i + 1));
      b.tabIndex = current === i + 1 || (!current && i === 0) ? 0 : -1;
    });
  };
  const set = (n, { silent = false } = {}) => {
    current = Math.max(1, Math.min(10, n));
    render();
    if (!silent) { pop(wrap); onChange?.(current); }
  };
  for (let i = 1; i <= 10; i++) {
    halves.push(h('button', {
      class: 'rate-input__half', type: 'button', role: 'radio', 'aria-checked': 'false', 'aria-label': `${fmtStars(i)} ${i === 2 ? 'estrela' : 'estrelas'}`,
      onClick: () => set(i),
      onMouseenter: () => render(i),
      onFocus: () => {},
      onKeydown: (e) => {
        const k = e.key;
        if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); set((current ?? 0) + 1); halves[Math.min(9, (current ?? 1) - 1)].focus(); }
        else if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); set((current ?? 2) - 1); halves[Math.max(0, (current ?? 1) - 1)].focus(); }
        else if (k === 'Home') { e.preventDefault(); set(1); halves[0].focus(); }
        else if (k === 'End') { e.preventDefault(); set(10); halves[9].focus(); }
      },
    }));
  }
  const stage = h('div', { class: 'rate-input__stage', role: 'radiogroup', 'aria-label': label, onMouseleave: () => render() }, stars, h('div', { class: 'rate-input__halves' }, halves));
  const wrap = h('div', { class: 'rate-input' }, stage, read);
  render();
  return { el: wrap, control: halves[0], get value() { return current; }, set };
}
