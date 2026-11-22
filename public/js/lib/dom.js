// Construção de DOM sem innerHTML: todo texto entra como textContent, então dados de terceiros nunca viram HTML.
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'rect', 'line', 'polygon', 'defs', 'clipPath', 'mask', 'use', 'ellipse', 'text']);

function applyProps(el, props, isSvg) {
  for (const [key, val] of Object.entries(props ?? {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'class' || key === 'className') {
      const cls = Array.isArray(val) ? val.filter(Boolean).join(' ') : val;
      if (cls) el.setAttribute('class', cls);
    } else if (key === 'style' && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        if (v === undefined || v === null) continue;
        if (k.startsWith('--') || k.includes('-')) el.style.setProperty(k, String(v));
        else el.style[k] = v;
      }
    } else if (key === 'dataset') {
      for (const [k, v] of Object.entries(val)) if (v !== undefined && v !== null) el.dataset[k] = String(v);
    } else if (key === 'ref') {
      val(el);
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (!isSvg && (key === 'value' || key === 'checked' || key === 'selected' || key === 'disabled' || key === 'hidden' || key === 'required' || key === 'readOnly' || key === 'indeterminate')) {
      el[key] = val;
    } else if (val === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(val));
    }
  }
}

function append(el, child) {
  if (child === null || child === undefined || child === false || child === true) return;
  if (Array.isArray(child)) child.forEach((c) => append(el, c));
  else if (child instanceof Node) el.appendChild(child);
  else el.appendChild(document.createTextNode(String(child)));
}

export function h(tag, props, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
  applyProps(el, props, isSvg);
  children.forEach((c) => append(el, c));
  return el;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  children.forEach((c) => append(f, c));
  return f;
};

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
export function replace(el, ...children) {
  clear(el);
  children.forEach((c) => append(el, c));
  return el;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export const focusables = (root) => $$(FOCUSABLE, root).filter((el) => el.offsetParent !== null || el === document.activeElement);

export function trapFocus(root, e) {
  if (e.key !== 'Tab') return;
  const items = focusables(root);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export const uid = (() => { let n = 0; return (p = 'id') => `${p}-${++n}`; })();
