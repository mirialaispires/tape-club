// Alternar a prateleira entre "Capas" (pôsteres de frente) e "Lombadas" (mistura de lombadas e capas).
import { h } from '../lib/dom.js';

const KEY = 'tc:view';
export function getView() { try { return localStorage.getItem(KEY) === 'spines' ? 'mixed' : 'faces'; } catch { return 'faces'; } }
export function ViewToggle(onChange) {
  const cur = getView();
  const mk = (v, label) => h('button', { type: 'button', class: 'genre', 'aria-pressed': String(cur === (v === 'spines' ? 'mixed' : 'faces')), onClick: (e) => {
    try { localStorage.setItem(KEY, v); } catch { /* sem armazenamento: vale só nesta página */ }
    e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
    onChange(v === 'spines' ? 'mixed' : 'faces');
  } }, label);
  return h('div', { class: 'viewtoggle', role: 'group', 'aria-label': 'Como mostrar as fitas' }, h('span', { class: 'sign' }, 'Ver como'), mk('faces', 'Capas'), mk('spines', 'Lombadas'));
}
