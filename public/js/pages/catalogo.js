// Catálogo: todas as fitas do clube. Filtros refletidos na URL; sem filtro, as prateleiras são agrupadas por gênero.
import { h, debounce } from '../lib/dom.js';
import { api, qs } from '../lib/api.js';
import { setQuery } from '../lib/router.js';
import { loadMembers, state } from '../lib/store.js';
import { STATUS, KIND, plural } from '../lib/format.js';
import { Shelf, FreeSlot } from '../ui/shelf.js';
import { PageHead, ShelfUnit } from '../ui/pagehead.js';
import { emptyState } from '../ui/empty.js';
import { loader } from '../ui/loader.js';
import { input, select } from '../ui/form.js';
import { getView, ViewToggle } from '../ui/viewmode.js';

const SORTS = [['recent', 'Chegaram agora'], ['title', 'Título (A–Z)'], ['year', 'Ano de lançamento'], ['rating', 'Melhor nota do clube'], ['watched', 'Vistas há pouco']];
const addTitle = async (opts) => (await import('../flows/addTitle.js')).openAddTitle(opts);
const PAGE = 60;

export default async function catalogo({ query, signal }) {
  const [facets] = await Promise.all([api.get('/api/titles/facets', { signal }), loadMembers()]);
  const f = {
    q: query.get('q') ?? '', genre: query.get('genre') ?? '', kind: query.get('kind') ?? '', status: query.get('status') ?? '',
    decade: query.get('decade') ?? '', min: query.get('min_rating') ?? '', sort: query.get('sort') ?? 'recent',
  };
  let ctrl = null;
  let loaded = [];
  let view = getView();
  let total = 0;

  const qEl = input({ type: 'search', value: f.q, placeholder: 'Título, diretor, gênero…', 'aria-label': 'Buscar no catálogo', 'data-search': '' });
  const opts = (list, cur) => list.map(([v, l]) => ({ value: v, label: l, selected: v === cur }));
  const decades = [['', 'Qualquer época']];
  if (facets.years?.min) for (let d = Math.floor(facets.years.max / 10) * 10; d >= Math.floor(facets.years.min / 10) * 10; d -= 10) decades.push([String(d), `Anos ${d}`]);
  const selects = {
    kind: select(opts([['', 'Filmes e séries'], ['movie', 'Só filmes'], ['tv', 'Só séries']], f.kind), { 'aria-label': 'Tipo' }),
    status: select(opts([['', 'Qualquer situação'], ...['watched', 'watching', 'planned', 'abandoned', 'none'].map((k) => [k, STATUS[k].label])], f.status), { 'aria-label': 'Situação' }),
    decade: select(opts(decades, f.decade), { 'aria-label': 'Década' }),
    min: select(opts([['', 'Qualquer nota'], ['3', '★ 3 ou mais'], ['4', '★ 4 ou mais'], ['4.5', '★ 4,5 ou mais']], f.min), { 'aria-label': 'Nota mínima do clube' }),
    sort: select(opts(SORTS, f.sort), { 'aria-label': 'Ordenar por' }),
  };
  const out = h('div', { class: 'cat__out', 'aria-live': 'polite' });
  const count = h('p', { class: 'cat__count' });
  const clearBtn = h('button', { class: 'link-btn', type: 'button', onClick: () => { Object.assign(f, { q: '', genre: '', kind: '', status: '', decade: '', min: '', sort: 'recent' }); qEl.value = ''; Object.entries(selects).forEach(([k, s]) => { s.value = f[k]; }); sync(); } }, 'Limpar filtros');

  const genreRow = h('div', { class: 'genres', role: 'group', 'aria-label': 'Gêneros' });
  const drawGenres = () => genreRow.replaceChildren(
    h('button', { class: 'genre', type: 'button', 'aria-pressed': String(!f.genre), onClick: () => { f.genre = ''; sync(); } }, 'Todos'),
    ...facets.genres.slice(0, 18).map((g) => h('button', { class: 'genre', type: 'button', 'aria-pressed': String(f.genre === g.name), onClick: () => { f.genre = f.genre === g.name ? '' : g.name; sync(); } }, g.name, h('small', null, g.count))));
  drawGenres();

  const active = () => Boolean(f.q || f.genre || f.kind || f.status || f.decade || f.min || f.sort !== 'recent');
  const params = (offset, limit) => {
    const p = { q: f.q.trim(), genre: f.genre, kind: f.kind, status: f.status, min_rating: f.min, sort: f.sort, limit, offset };
    if (f.decade) { p.year_from = f.decade; p.year_to = Number(f.decade) + 9; }
    return p;
  };

  function draw() {
    clearBtn.hidden = !active();
    count.textContent = total ? `${plural(total, 'fita', 'fitas')}${active() ? ' com esses filtros' : ' na estante'}` : '';
    if (!total) {
      out.replaceChildren(active()
        ? emptyState({ title: 'Nenhuma fita com esses filtros', text: 'Afrouxe um filtro ou procure por outro nome. Se a fita ainda não está aqui, cadastre.', actions: [h('button', { class: 'btn', type: 'button', onClick: () => clearBtn.click() }, 'Limpar filtros'), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => addTitle({ query: f.q }) }, 'Cadastrar fita')] })
        : emptyState({ title: 'A estante está vazia', text: 'Cadastre a primeira fita e o corredor começa a se encher.', actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => addTitle() }, 'Cadastrar a primeira fita')] }));
      return;
    }
    const cap = FreeSlot(f.q ? `Cadastrar “${f.q.trim()}”` : 'Cadastrar fita', () => addTitle({ query: f.q }));
    if (!active() && loaded.length === total) {
      const groups = new Map();
      for (const t of loaded) { const g = t.genres?.[0] ?? 'Sem gênero'; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(t); }
      const sorted = [...groups].sort((a, b) => b[1].length - a[1].length);
      out.replaceChildren(...sorted.map(([g, list], i) => ShelfUnit({ id: `g-${i}`, title: g, seed: 10 + i, shelf: Shelf(list, { mode: view, label: `Fitas de ${g}`, endCap: i === sorted.length - 1 ? cap : null }) })));
      return;
    }
    out.replaceChildren(ShelfUnit({
      id: 'u-res', title: f.genre || (f.q ? 'Resultado da busca' : 'Fitas filtradas'), seed: 14,
      shelf: Shelf(loaded, { mode: view, label: 'Resultados', endCap: loaded.length >= total ? cap : null }),
      foot: loaded.length < total ? h('div', { class: 'cat__more' }, h('button', { class: 'btn', type: 'button', onClick: () => load(true) }, `Carregar mais (${total - loaded.length} restantes)`)) : null,
    }));
  }

  async function load(more = false) {
    ctrl?.abort();
    ctrl = new AbortController();
    const mine = ctrl;
    if (!more) out.replaceChildren(loader('Procurando na estante', { inline: true }));
    try {
      const grouped = !active();
      const r = await api.get(`/api/titles${qs(params(more ? loaded.length : 0, grouped ? 200 : PAGE))}`, { signal: mine.signal });
      if (mine !== ctrl) return;
      loaded = more ? [...loaded, ...r.items] : r.items;
      total = r.total;
      draw();
    } catch (e) {
      if (e?.name === 'AbortError') return;
      out.replaceChildren(emptyState({ tone: 'error', title: 'Não deu para consultar a estante', text: e.message, actions: [h('button', { class: 'btn', type: 'button', onClick: () => load() }, 'Tentar de novo')] }));
    }
  }
  function sync() {
    setQuery({ q: f.q.trim() || null, genre: f.genre || null, kind: f.kind || null, status: f.status || null, decade: f.decade || null, min_rating: f.min || null, sort: f.sort === 'recent' ? null : f.sort, busca: null });
    drawGenres();
    load();
  }
  const typed = debounce(() => { f.q = qEl.value; sync(); }, 300);
  qEl.addEventListener('input', typed);
  for (const [k, s] of Object.entries(selects)) s.addEventListener('change', () => { f[k] = s.value; sync(); });

  const bar = h('form', { class: 'cat__bar', role: 'search', onSubmit: (e) => { e.preventDefault(); typed.cancel(); f.q = qEl.value; sync(); } },
    h('div', { class: 'cat__search' }, qEl),
    h('div', { class: 'cat__selects' }, Object.values(selects)),
    clearBtn, ViewToggle((v) => { view = v; draw(); }));

  const el = h('div', { class: 'cat' },
    PageHead({ kicker: 'Departamento', title: 'Catálogo', lead: facets.total ? `${plural(facets.total, 'fita', 'fitas')} nas estantes. Busque, filtre por gênero e abra qualquer lombada para ver a ficha.` : 'As estantes estão vazias — cadastre a primeira fita.', seed: 6,
      actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => addTitle() }, 'Cadastrar fita')] }),
    bar, genreRow, count, out);
  clearBtn.hidden = !active();
  load();
  if (query.get('busca') === '1') queueMicrotask(() => qEl.focus());
  return { title: 'Catálogo', el, layout: 'wide', destroy: () => { ctrl?.abort(); typed.cancel(); } };
}
