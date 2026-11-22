// Roteador: History API, páginas carregadas sob demanda, a câmera do corredor acompanha cada navegação.
// Contrato de página: export default async function (ctx) → { title, el, layout?, destroy? }
// O parâmetro ?f=<id> (ficha de consulta aberta) NÃO é uma página: ele vive por cima da página atual.
import { clear } from './dom.js';
import { state } from './store.js';
import { progressStart, progressDone, reduced } from './motion.js';
import { goToStation } from './scene.js';
import { errorPage } from '../ui/empty.js';
import { loader } from '../ui/loader.js';

const table = [];
let rootEl;
let current = null; // { destroy, controller }
let token = 0;
let keyCounter = 0;
let currentKey = 0;
let routeKey = '';
const scrolls = new Map();
let first = true;

export function route(pattern, load, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  table.push({ re, keys, load, opts });
}

function match(pathname) {
  for (const r of table) {
    const m = r.re.exec(pathname);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      return { ...r, params };
    }
  }
  return null;
}

/** Chave da página: caminho + filtros, sem o parâmetro da ficha. */
function keyOf(u) {
  const p = new URLSearchParams(u.search);
  p.delete('f');
  const s = p.toString();
  return u.pathname + (s ? `?${s}` : '');
}

export const currentPath = () => location.pathname + location.search;
export const openFichaId = () => Number(new URL(location.href).searchParams.get('f')) || null;
const emitFicha = () => document.dispatchEvent(new CustomEvent('tc:ficha-sync'));

export async function navigate(to, { replace = false } = {}) {
  const url = new URL(to, location.href);
  if (url.origin !== location.origin) { location.href = to; return; }
  const next = url.pathname + url.search + url.hash;
  if (!replace) scrolls.set(currentKey, window.scrollY);
  if (next === currentPath() + location.hash && !replace) return;
  if (replace) history.replaceState({ key: currentKey }, '', next);
  else history.pushState({ key: ++keyCounter }, '', next);
  currentKey = history.state.key;
  await render({ fromPop: false });
}

/** Recarrega os dados da página atual sem animação nem rolagem (depois de salvar algo). */
export const refresh = ({ soft = true } = {}) => render({ soft });

/** Atualiza só a query string (filtros, ficha) sem trocar de página. */
export function setQuery(params, { replace = true, ficha = false } = {}) {
  const u = new URL(location.href);
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') u.searchParams.delete(k);
    else u.searchParams.set(k, v);
  }
  const next = u.pathname + u.search + u.hash;
  if (replace) history.replaceState({ ...history.state, key: currentKey }, '', next);
  else { history.pushState({ key: ++keyCounter, ficha }, '', next); currentKey = keyCounter; }
}

async function render({ fromPop = false, soft = false } = {}) {
  const my = ++token;
  const softScroll = window.scrollY; // refresh suave devolve a página ao mesmo ponto
  const url = new URL(location.href);
  const found = match(url.pathname);

  if (found && !found.opts.public && !state.me) {
    const next = encodeURIComponent(url.pathname + url.search);
    history.replaceState({ key: currentKey }, '', `/entrar?next=${next}`);
    return render({});
  }
  if (found?.opts.public && state.me && url.pathname === '/entrar') {
    history.replaceState({ key: currentKey }, '', url.searchParams.get('next') || '/');
    return render({});
  }

  routeKey = keyOf(url);
  current?.controller?.abort();
  const controller = new AbortController();
  progressStart();
  if (!soft) goToStation(url.pathname); // a câmera já começa a caminhar até o departamento
  if (!first && !soft) rootEl.classList.add('is-leaving');
  let slow = null;
  if (first || !rootEl.firstChild) slow = setTimeout(() => { if (my === token) { clear(rootEl); rootEl.appendChild(loader('Rebobinando')); } }, 120);
  else slow = setTimeout(() => { if (my === token) rootEl.setAttribute('aria-busy', 'true'); }, 400);

  let page;
  try {
    if (!found) {
      const mod = await import('../pages/notfound.js');
      page = await mod.default({});
    } else {
      const mod = await found.load();
      page = await mod.default({ params: found.params, query: url.searchParams, signal: controller.signal, path: url.pathname });
    }
  } catch (err) {
    clearTimeout(slow);
    if (err?.name === 'AbortError' || my !== token) return;
    if (err?.status === 401) return;
    page = { title: 'Fita rebobinou mal', el: errorPage(err, () => render({})), layout: null };
  }
  clearTimeout(slow);
  if (my !== token) return;
  rootEl.removeAttribute('aria-busy');

  current?.destroy?.();
  clear(rootEl);
  rootEl.className = `page${page.layout ? ` page--${page.layout}` : ''}`;
  rootEl.appendChild(page.el);
  if (!reduced() && !first && !soft) {
    rootEl.classList.add('is-entering');
    rootEl.addEventListener('animationend', () => rootEl.classList.remove('is-entering'), { once: true });
  }
  document.title = `${page.title} · tape-club`;
  current = { destroy: page.destroy, controller };
  document.dispatchEvent(new CustomEvent('tc:route', { detail: { nav: found?.opts.nav ?? null, path: url.pathname } }));
  if (soft) window.scrollTo(0, softScroll);
  else if (fromPop) window.scrollTo(0, scrolls.get(currentKey) ?? 0);
  else if (url.hash) document.getElementById(url.hash.slice(1))?.scrollIntoView();
  else window.scrollTo(0, 0);
  if (!first && !soft && !openFichaId()) rootEl.focus({ preventScroll: true });
  first = false;
  progressDone();
  emitFicha();
}

export function startRouter(el) {
  rootEl = el;
  history.scrollRestoration = 'manual';
  history.replaceState({ key: 0 }, '', location.href);
  window.addEventListener('popstate', (e) => {
    currentKey = e.state?.key ?? 0;
    if (keyOf(new URL(location.href)) === routeKey) { emitFicha(); return; } // só a ficha mudou
    render({ fromPop: true });
  });
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.('a[href]');
    if (!a || a.target || a.hasAttribute('download') || a.dataset.external !== undefined) return;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.startsWith('/media/')) return;
    e.preventDefault();
    navigate(u.pathname + u.search + u.hash);
  });
  window.addEventListener('tc:unauthorized', () => {
    if (!state.me) return;
    state.me = null;
    history.pushState({ key: ++keyCounter }, '', `/entrar?next=${encodeURIComponent(currentPath())}`);
    currentKey = keyCounter;
    render({});
  });
  return render({});
}
