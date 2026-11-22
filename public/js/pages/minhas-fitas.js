// Minhas fitas: o que a pessoa (ou o clube) já devolveu, por ano, e o diário de retiradas (sessões).
import { h } from '../lib/dom.js';
import { api, qs } from '../lib/api.js';
import { setQuery, refresh } from '../lib/router.js';
import { state, loadMembers, memberById } from '../lib/store.js';
import { STATUS, fmtDate, plural } from '../lib/format.js';
import { Shelf, FreeSlot } from '../ui/shelf.js';
import { PageHead, ShelfUnit } from '../ui/pagehead.js';
import { MemberDots } from '../ui/member.js';
import { Stars } from '../ui/rating.js';
import { emptyState } from '../ui/empty.js';
import { select, segmented } from '../ui/form.js';
import { Paper } from '../ui/paper.js';
import { getView, ViewToggle } from '../ui/viewmode.js';

const log = async (opts) => (await import('../flows/logSession.js')).openLogSession(opts);

export default async function minhasFitas({ query, signal }) {
  await loadMembers();
  const me = state.me;
  let who = query.get('quem') === 'clube' ? 'clube' : 'eu';
  let status = query.get('situacao') ?? '';
  let year = query.get('ano') ?? '';
  const body = h('div', { class: 'mine__body' });
  const reload = () => refresh({ soft: true });

  const seg = segmented({ name: 'quem', label: 'Quem', options: [{ value: 'eu', label: 'Minhas' }, { value: 'clube', label: 'Do clube' }], value: who, onChange: (v) => { who = v; setQuery({ quem: v === 'eu' ? null : v }); draw(); } });

  async function draw() {
    body.replaceChildren(h('p', { class: 'faint' }, 'Rebobinando…'));
    const base = who === 'eu' ? { watched_by: me.id } : {};
    const [titles, sessions] = await Promise.all([
      api.get(`/api/titles${qs({ status: 'watched', sort: 'watched', limit: 200, ...base })}`, { signal }),
      api.get(`/api/sessions${qs({ limit: 60, member: who === 'eu' ? me.id : null, status, year })}`, { signal }),
    ]);
    const byYear = new Map();
    for (const t of titles.items) { const y = (t.lastWatched ?? '').slice(0, 4) || 'Sem data'; if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(t); }
    const shelves = [...byYear].sort((a, b) => b[0].localeCompare(a[0])).map(([y, list], i) => ShelfUnit({ id: `y-${y}`, title: y, seed: 20 + i, shelf: Shelf(list, { mode: getView(), label: `Assistidos em ${y}`, rating: who === 'eu' ? 'mine' : 'avg' }) }));
    body.replaceChildren(
      h('p', { class: 'cat__count' }, titles.total ? `${plural(titles.total, 'fita devolvida', 'fitas devolvidas')}${who === 'eu' ? ' por você' : ' pelo clube'}` : ''),
      ...(shelves.length ? shelves : [emptyState({ title: who === 'eu' ? 'Você ainda não devolveu nenhuma fita' : 'O clube ainda não devolveu nenhuma fita', text: 'Registre uma sessão e ela aparece aqui, na prateleira do ano.', actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => log({ onSaved: reload }) }, 'Registrar sessão')] })]),
      diary(sessions));
  }

  function diary(s) {
    const years = [{ value: '', label: 'Todos os anos' }, ...(s.years ?? []).map((y) => ({ value: String(y), label: String(y) }))].map((o) => ({ ...o, selected: o.value === year }));
    const ys = select(years, { 'aria-label': 'Ano do diário' });
    const ss = select([{ value: '', label: 'Qualquer situação' }, ...['watched', 'watching', 'planned', 'abandoned'].map((k) => ({ value: k, label: STATUS[k].label }))].map((o) => ({ ...o, selected: o.value === status })), { 'aria-label': 'Situação' });
    const apply = () => { year = ys.value; status = ss.value; setQuery({ ano: year || null, situacao: status || null }); draw(); };
    ys.addEventListener('change', apply); ss.addEventListener('change', apply);
    const rows = s.items.map((x) => {
      const mineSession = x.createdBy === me.id;
      const myRev = x.reviews.find((r) => r.memberId === me.id);
      return h('li', { class: 'diary__row' },
        h('span', { class: 'diary__date' }, fmtDate(x.onDate)),
        h('button', { class: 'diary__title', type: 'button', 'data-title-id': x.titleId }, x.title.title, x.title.year ? h('small', null, ` ${x.title.year}`) : null),
        h('span', { class: `stamp stamp--sm stamp--${STATUS[x.status].tone === 'ink' ? 'plain' : STATUS[x.status].tone}` }, STATUS[x.status].label),
        h('span', { class: 'diary__who' }, MemberDots(x.attendees, { size: 'sm' })),
        myRev ? h('span', { class: 'diary__rate' }, Stars(myRev.rating, { tone: 'gold' })) : h('span', { class: 'faint' }, ''),
        x.note ? h('span', { class: 'diary__note' }, x.note) : null,
        mineSession ? h('button', { class: 'link-btn diary__edit', type: 'button', onClick: () => log({ session: x, onSaved: reload }) }, 'Editar') : null);
    });
    return h('section', { class: 'diary', 'aria-labelledby': 'diary-h' },
      Paper([
        h('div', { class: 'diary__head' }, h('h2', { class: 'note-title note-title--sm', id: 'diary-h' }, 'Diário de retiradas'), h('div', { class: 'row' }, ys, ss)),
        rows.length ? h('ul', { class: 'diary__list', role: 'list' }, rows) : h('p', { class: 'note-text' }, 'Nenhuma sessão com esses filtros.'),
        s.total > s.items.length ? h('p', { class: 'faint' }, `Mostrando as ${s.items.length} mais recentes de ${s.total}.`) : null,
      ], { tone: 'cream', tilt: 0.3, seed: 61, amp: 4, cls: 'diary__paper' }));
  }

  const el = h('div', { class: 'mine' },
    PageHead({ kicker: 'Sua carteirinha', title: 'Minhas fitas', lead: 'O que já voltou para a prateleira, ano a ano, e o diário de cada retirada.', seed: 16,
      actions: [seg.el, ViewToggle(() => draw()), h('button', { class: 'btn btn--primary', type: 'button', onClick: () => log({ onSaved: reload }) }, 'Registrar sessão')] }),
    body);
  await draw();
  return { title: 'Minhas fitas', el, layout: 'wide' };
}
