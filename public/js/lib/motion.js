// Movimento com função. Tudo aqui respeita prefers-reduced-motion.
import { h } from './dom.js';

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => mq.matches;
/** Carimbo grande no meio da tela: confirmação física e inofensiva (não bloqueia cliques). */
export function stampOverlay(text, tone = 'red', { ms = 1500 } = {}) {
  const el = h('div', { class: 'stamp-overlay', 'aria-hidden': 'true' }, h('span', { class: `stamp stamp--lg ${tone === 'red' ? '' : `stamp--${tone}`}` }, text));
  document.body.appendChild(el);
  setTimeout(() => el.remove(), reduced() ? Math.min(ms, 900) : ms);
}

/** Pequena batida de carimbo em um elemento já na página. */
export function pressStamp(el) {
  if (reduced() || !el) return;
  el.classList.remove('is-pressed');
  void el.offsetWidth;
  el.classList.add('is-pressed');
}

export function pop(el, cls = 'is-pop') {
  if (reduced() || !el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** Barra de "tracking" no topo: aparece em qualquer espera de navegação. */
const bar = () => document.getElementById('progress');
let progressTimer = null;
export function progressStart() {
  const el = bar();
  if (!el) return;
  clearTimeout(progressTimer);
  el.classList.remove('is-done');
  el.classList.add('is-active');
}
export function progressDone() {
  const el = bar();
  if (!el) return;
  el.classList.add('is-done');
  progressTimer = setTimeout(() => el.classList.remove('is-active', 'is-done'), 320);
}
