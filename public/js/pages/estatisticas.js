// Perfil do integrante (carteirinha) e placar do clube. Tudo calculado no servidor a partir de sessões e notas reais.
import { h } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { setQuery } from '../lib/router.js';
import { state, loadMembers, memberById } from '../lib/store.js';
import { fmtInt, fmtScore, fmtStars, fmtMonthShort, fmtDateFull, plural, fmtRuntime } from '../lib/format.js';
import { Paper } from '../ui/paper.js';
import { PageHead, ShelfUnit } from '../ui/pagehead.js';
import { Shelf } from '../ui/shelf.js';
import { MemberDot } from '../ui/member.js';
import { Stars } from '../ui/rating.js';
import { emptyState } from '../ui/empty.js';
import { select } from '../ui/form.js';

const tile = (n, label, hint) => h('div', { class: 'tile' }, h('b', { class: 'tile__n' }, n), h('span', { class: 'tile__l' }, label), hint ? h('small', { class: 'tile__h' }, hint) : null);

/** Barras horizontais; o rótulo textual com o valor acompanha sempre (cor não é a única informação). */
function bars(rows, { unit = '', empty = 'Ainda sem dados.' } = {}) {
  if (!rows.length) return h('p', { class: 'faint' }, empty);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return h('ul', { class: 'bars', role: 'list' }, rows.map((r) => h('li', { class: 'bars__row' },
    h('span', { class: 'bars__label' }, r.label),
    h('span', { class: 'bars__track', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.max(3, (r.value / max) * 100)}%` } })),
    h('span', { class: 'bars__value' }, r.value, unit))));
}

/** Colunas verticais (distribuição das notas e movimento por mês). */
function columns(rows, { label, empty = 'Ainda sem dados.' }) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!max) return h('p', { class: 'faint' }, empty);
  return h('ol', { class: 'cols', role: 'list', 'aria-label': label }, rows.map((r) => h('li', { class: 'cols__col' },
    h('span', { class: 'cols__v' }, r.value || ''),
    h('span', { class: 'cols__bar', 'aria-hidden': 'true' }, h('i', { style: { height: `${(r.value / max) * 100}%` } })),
    h('span', { class: 'cols__l' }, r.label))));
}

function carteirinha(m) {
  const s = m.stats;
  const mine = m.id === state.me.id;
  return Paper([
    h('div', { class: 'card__head' },
      MemberDot(m, { size: 'xl' }),
      h('div', null, h('p', { class: 'note-kicker' }, 'Carteirinha do clube'), h('h2', { class: 'card__name' }, m.name, mine ? h('small', null, ' (você)') : null), h('p', { class: 'faint' }, `Sócio desde ${fmtDateFull(m.createdAt.slice(0, 10))}`))),
    h('div', { class: 'tiles' },
      tile(fmtInt(s.titlesWatched), s.titlesWatched === 1 ? 'fita assistida' : 'fitas assistidas'),
      tile(fmtInt(s.sessionsAttended), s.sessionsAttended === 1 ? 'sessão' : 'sessões'),
      tile(fmtInt(s.reviews), s.reviews === 1 ? 'avaliação' : 'avaliações'),
      tile(s.avgGiven == null ? '—' : fmtStars(s.avgGiven), 'nota média dada', s.bias == null ? null : `${s.bias > 0.3 ? 'mais generoso' : s.bias < -0.3 ? 'mais exigente' : 'no ritmo'} que o clube`),
      tile(fmtInt(s.titlesAdded), s.titlesAdded === 1 ? 'fita cadastrada' : 'fitas cadastradas'),
      tile(fmtInt(s.favorites), s.favorites === 1 ? 'favorita' : 'favoritas'))
  ], { tone: 'wine', cls: 'card card--id' });
}

export default async function estatisticas({ query, signal }) {
  const [mem, stats] = await Promise.all([loadMembers(), api.get('/api/stats', { signal })]);
  const members = mem.members;
  const wanted = Number(query.get('m'));
  const current = members.find((m) => m.id === wanted) ?? members.find((m) => m.id === state.me.id) ?? members[0];
  const mine = current.id === state.me.id;

  const picker = select(members.map((m) => ({ value: String(m.id), label: m.name + (m.id === state.me.id ? ' (você)' : ''), selected: m.id === current.id })), { 'aria-label': 'Ver perfil de' });
  picker.addEventListener('change', () => { setQuery({ m: picker.value === String(state.me.id) ? null : picker.value }, { replace: false }); import('../lib/router.js').then((r) => r.refresh({ soft: false })); });

  const s = current.stats;
  const profile = h('section', { class: 'profile', 'aria-labelledby': 'perfil-h' },
    h('h2', { class: 'sr-only', id: 'perfil-h' }, `Perfil de ${current.name}`),
    carteirinha(current),
    Paper([
      h('h3', { class: 'note-title note-title--sm' }, 'Gêneros preferidos'),
      bars((s.topGenres ?? []).map((g) => ({ label: g.name, value: g.count })), { unit: '', empty: 'Aparecem depois da primeira sessão.' }),
    ], { tone: 'cream', tilt: 0.6, seed: 92, amp: 4, cls: 'card card--genres' }),
    Paper([
      h('h3', { class: 'note-title note-title--sm' }, 'Últimas avaliações'),
      current.recentReviews?.length
        ? h('ul', { class: 'recent', role: 'list' }, current.recentReviews.slice(0, 5).map((r) => h('li', null,
          h('button', { class: 'linkish', type: 'button', 'data-title-id': r.titleId }, r.title, r.year ? h('small', null, ` ${r.year}`) : null),
          h('span', { class: 'recent__r' }, Stars(r.rating, { tone: 'gold' })), r.body ? h('p', { class: 'note-hand' }, `“${r.body}”`) : null)))
        : h('p', { class: 'faint' }, 'Ainda sem avaliações.'),
    ], { tone: 'cream', cls: 'card card--recent' }));

  let favs = null;
  if (mine) {
    const r = await api.get('/api/titles?favorite=1&limit=60&sort=title', { signal });
    favs = ShelfUnit({ id: 'u-favs', title: 'Minhas favoritas', seed: 31, shelf: Shelf(r.items, { label: 'Fitas que você marcou como favoritas', rating: 'mine', mode: 'faces' }) });
    if (!r.items.length) favs = h('p', { class: 'faint profile__nofav' }, 'Você ainda não marcou favoritas. Abra uma ficha e toque na estrela.');
  }

  const t = stats.totals;
  const club = h('section', { class: 'club', 'aria-labelledby': 'club-h' },
    h('h2', { class: 'club__h', id: 'club-h' }, 'Placar do clube'),
    h('div', { class: 'tiles tiles--club' },
      tile(fmtInt(t.titles), 'fitas na estante'), tile(fmtInt(t.sessionsWatched), 'sessões'), tile(fmtInt(t.reviews), 'avaliações'),
      tile(t.avgRating == null ? '—' : fmtScore(t.avgRating / 2), 'média das notas (★)'), tile(t.movieMinutes ? fmtRuntime(t.movieMinutes) : '—', 'de tela somados'), tile(fmtInt(t.members), 'integrantes')),
    h('div', { class: 'club__grid' },
      Paper([h('h3', { class: 'note-title note-title--sm' }, 'Notas dadas'), columns(stats.distribution.map((d) => ({ label: fmtStars(d.rating), value: d.count })), { label: 'Quantidade de avaliações por nota, de meia estrela a cinco' })], { tone: 'cream', tilt: -0.4, seed: 94, cls: 'card' }),
      Paper([h('h3', { class: 'note-title note-title--sm' }, 'Sessões por mês'), columns(stats.monthly.slice(-12).map((m) => ({ label: fmtMonthShort(m.month), value: m.sessions })), { label: 'Sessões por mês' })], { tone: 'cream', tilt: 0.4, seed: 95, cls: 'card' }),
      Paper([h('h3', { class: 'note-title note-title--sm' }, 'Gêneros do clube'), bars(stats.topGenres.slice(0, 6).map((g) => ({ label: g.name, value: g.count })))], { tone: 'petrol', tilt: 0.5, seed: 96, cls: 'card' }),
      Paper([h('h3', { class: 'note-title note-title--sm' }, 'Direções mais vistas'), bars(stats.topDirectors.slice(0, 6).map((g) => ({ label: g.name, value: g.count })), { empty: 'Aparecem com as primeiras sessões.' })], { tone: 'mustard', tilt: -0.5, seed: 97, cls: 'card' })),
    Paper([
      h('h3', { class: 'note-title note-title--sm' }, 'Integrantes lado a lado'),
      h('div', { class: 'tablewrap' }, h('table', { class: 'tbl' },
        h('thead', null, h('tr', null, ['Integrante', 'Assistidas', 'Avaliações', 'Nota média', 'Gênero preferido'].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', null, members.map((m) => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'row', style: { gap: '8px', flexWrap: 'nowrap' } }, MemberDot(m, { size: 'sm' }), m.name)),
          h('td', null, fmtInt(m.stats.titlesWatched)), h('td', null, fmtInt(m.stats.reviews)),
          h('td', null, m.stats.avgGiven == null ? '—' : `${fmtStars(m.stats.avgGiven)} ★`), h('td', null, m.stats.favoriteGenre ?? '—')))))),
    ], { tone: 'cream', tilt: 0.2, seed: 98, cls: 'card card--table' }));

  const el = h('div', { class: 'stats' },
    PageHead({ kicker: 'Sua ficha de sócio', title: 'Perfil e placar', lead: 'A carteirinha de cada integrante e os números do clube — só o que as sessões e notas realmente dizem.', seed: 36, actions: [h('label', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'sign' }, 'Ver perfil de'), picker)] }),
    profile, favs, club);
  return { title: 'Perfil e placar', el, layout: 'wide' };
}
