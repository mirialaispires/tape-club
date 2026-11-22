import { h } from '../lib/dom.js';
import { emptyState } from '../ui/empty.js';

export default async function notFound() {
  return {
    title: 'Fita não encontrada',
    layout: null,
    el: emptyState({
      title: 'Essa fita não está na estante',
      text: 'O endereço não existe ou mudou de corredor. Volte ao balcão e procure de novo.',
      actions: [h('a', { class: 'btn btn--primary', href: '/' }, 'Voltar ao balcão'), h('a', { class: 'btn', href: '/catalogo' }, 'Ver o catálogo')],
    }),
  };
}
