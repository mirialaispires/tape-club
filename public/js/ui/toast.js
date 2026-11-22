// Avisos curtos em forma de recibo. Não roubam o foco; leitores de tela recebem via região viva.
import { h } from '../lib/dom.js';
import { reduced } from '../lib/motion.js';

let box;
function container() {
  box ??= document.getElementById('toasts');
  return box;
}

export function toast(message, { kind = 'ok', title, ms } = {}) {
  const heading = title ?? { ok: 'Anotado', error: 'Opa', info: 'Aviso' }[kind];
  const el = h('div', { class: `toast toast--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    h('div', null, h('b', null, heading), h('span', null, message)),
    h('button', { class: 'toast__x', type: 'button', 'aria-label': 'Fechar aviso', onClick: () => dismiss() }, '×'));
  const dismiss = () => {
    if (!el.isConnected) return;
    if (reduced()) return el.remove();
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400);
  };
  container().appendChild(el);
  setTimeout(dismiss, ms ?? (kind === 'error' ? 7000 : 4200));
  return dismiss;
}
