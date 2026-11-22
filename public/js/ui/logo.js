// A marca: carretel + fita se desenrolando sob as letras. SVGs em /img/brand (versão cheia no desktop, compacta no celular).
import { h } from '../lib/dom.js';

export function Logo({ href = '/' } = {}) {
  return h('a', { class: 'logo', href, 'aria-label': 'Tape Club, início' },
    h('img', { class: 'logo__full', src: '/img/brand/logo-full.svg', alt: '', width: 220, height: 49, decoding: 'async' }),
    h('img', { class: 'logo__compact', src: '/img/brand/logo-compact.svg', alt: '', width: 112, height: 43, decoding: 'async' }));
}
