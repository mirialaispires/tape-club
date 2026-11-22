// Estados vazios e de erro: tela "sem sinal" (barras de teste) com uma saída clara.
import { h } from '../lib/dom.js';

export function emptyState({ title, text, actions = [], tone } = {}) {
  return h('div', { class: `empty${tone === 'error' ? ' empty--error' : ''}`, role: tone === 'error' ? 'alert' : undefined },
    h('span', { class: 'empty__bars', 'aria-hidden': 'true' }),
    h('h2', { class: 'empty__title' }, title),
    text ? h('p', { class: 'empty__text' }, text) : null,
    actions.length ? h('div', { class: 'empty__actions' }, actions) : null);
}

export function errorPage(err, retry) {
  const offline = err?.status === 0;
  return emptyState({
    tone: 'error',
    title: offline ? 'Sem sinal' : 'A fita rebobinou mal',
    text: err?.message || 'Não conseguimos carregar esta página agora.',
    actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: retry }, 'Tentar de novo'), h('a', { class: 'btn', href: '/' }, 'Voltar ao balcão')],
  });
}
