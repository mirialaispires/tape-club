// Carregamento com personalidade: uma fita sendo inserida no videocassete, carretéis girando.
import { h } from '../lib/dom.js';

function reel(cx, cy) {
  return h('g', { class: 'loader__reel', transform: `translate(${cx} ${cy})` },
    h('circle', { r: 9, fill: '#1d1a15' }),
    h('circle', { r: 3, fill: '#ece3cc' }),
    h('path', { d: 'M0 -9V-3M7.8 4.5L2.6 1.5M-7.8 4.5L-2.6 1.5', stroke: '#ece3cc', 'stroke-width': 2 }));
}

export function tapeSvg(cls = 'loader__svg') {
  return h('svg', { class: cls, viewBox: '0 0 120 84', 'aria-hidden': 'true', focusable: 'false' },
    h('g', { class: 'loader__body' },
      h('rect', { x: 14, y: 4, width: 92, height: 58, rx: 3, fill: '#2b261f', stroke: '#1d1a15', 'stroke-width': 2 }),
      h('rect', { x: 21, y: 10, width: 78, height: 26, fill: '#ece3cc', stroke: '#1d1a15', 'stroke-width': 1.5 }),
      reel(42, 23), reel(78, 23),
      h('rect', { x: 38, y: 42, width: 44, height: 14, fill: '#14110d' }),
      h('rect', { x: 21, y: 42, width: 12, height: 14, fill: '#b4302a' })),
    h('rect', { x: 6, y: 58, width: 108, height: 18, fill: '#1d1a15' }),
    h('rect', { x: 12, y: 62, width: 96, height: 4, fill: '#4b443a' }));
}

export function loader(text = 'Rebobinando', { inline = false } = {}) {
  return h('div', { class: `loader${inline ? ' loader--inline' : ''}`, role: 'status', 'aria-live': 'polite' },
    tapeSvg(), h('span', { class: 'loader__text' }, text));
}
