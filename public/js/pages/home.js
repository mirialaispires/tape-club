// Início: a fachada. O corredor aparece por trás; o destaque editorial, a TV e as prateleiras vêm dos dados reais do clube.
import { h } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, loadMembers, memberById } from '../lib/store.js';
import { fmtStars, fmtDate, relDays, fmtInt, plural, STATUS } from '../lib/format.js';
import { Paper, Placard, Tag } from '../ui/paper.js';
import { Shelf, FreeSlot, VhsBox } from '../ui/shelf.js';
import { Stars } from '../ui/rating.js';
import { MemberDot } from '../ui/member.js';

const toCard = (t) => ({ ...t, directors: t.directors ?? [], genres: t.genres ?? [] });
const addTitle = async () => (await import('../flows/addTitle.js')).openAddTitle();

/** As escolhas da semana: favoritos coletivos (calculados das notas); sem eles, a recomendação do balcão; sem ela, o que chegou agora. */
function weeklyPicks(home) {
  const fav = home.highlights.collectiveFavorites.map((f) => ({ t: toCard(f.title), why: 'Caso de amor coletivo', rating: f.avg }));
  if (fav.length) return fav.slice(0, 3);
  const out = [];
  if (home.recommendation) out.push({ t: toCard(home.recommendation.title), why: 'Recomendação do balcão', rating: null });
  for (const t of home.recent) {
    if (out.length >= 3) break;
    if (!out.some((o) => o.t.id === t.id)) out.push({ t, why: 'Chegou agora', rating: t.avgRating });
  }
  return out;
}

function heroNote(home, picks) {
  const empty = home.totals.titles === 0;
  const list = picks.length
    ? h('ul', { class: 'picks', 'aria-label': 'Escolhas da semana' }, picks.map((p) => h('li', null,
      h('button', { class: 'pick', type: 'button', 'data-title-id': p.t.id },
        h('span', { class: 'pick__title' }, p.t.title, p.t.year ? h('small', null, ` ${p.t.year}`) : null),
        h('span', { class: 'pick__why' }, p.why, p.rating != null ? [' · ', fmtStars(p.rating), ' ★'] : null)))))
    : null;
  return Paper([
    h('h1', { class: 'note-title' }, 'Escolhas', h('em', null, 'da semana')),
    h('i', { class: 'note-rule', 'aria-hidden': 'true' }),
    empty
      ? h('p', { class: 'note-text' }, 'As prateleiras ainda estão vazias. Cadastre a primeira fita e o corredor começa a se encher.')
      : h('p', { class: 'note-text' }, 'Uma seleção do clube para você revisitar e descobrir.'),
    list,
    empty
      ? h('button', { class: 'btn btn--primary', type: 'button', onClick: addTitle }, 'Cadastrar a primeira fita ', h('span', { 'aria-hidden': 'true' }, '→'))
      : h('a', { class: 'btn btn--primary', href: '#assistidos', onClick: (e) => { e.preventDefault(); document.getElementById('assistidos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Conferir ', h('span', { 'aria-hidden': 'true' }, '→')),
  ], { tone: 'cream', tilt: -1.4, seed: 21, stars: true, cls: 'hero__note', amp: 5 });
}

/** A TV de tubo: mostra a última devolução do clube. */
function crt(home) {
  const r = home.lastReturn;
  const mine = r?.attendees.includes(state.me.id);
  const who = r ? (mine ? 'Você assistiu' : r.attendees.length === 1 ? `${memberById(r.attendees[0])?.name ?? 'Alguém'} assistiu` : 'O clube assistiu') : null;
  const inner = r
    ? [h('span', { class: 'crt__kicker' }, 'Últimas atividades'), h('b', { class: 'crt__title' }, who, ': ', r.title.title), h('span', { class: 'crt__when' }, `${fmtDate(r.onDate)} · ${relDays(r.onDate)}`)]
    : [h('span', { class: 'crt__kicker' }, 'Sem sinal'), h('b', { class: 'crt__title' }, 'Nenhuma sessão registrada ainda')];
  const screen = r
    ? h('button', { class: 'crt__screen', type: 'button', 'data-title-id': r.title.id, 'aria-label': `Abrir a ficha de ${r.title.title}` }, inner)
    : h('div', { class: 'crt__screen' }, inner);
  return h('div', { class: 'crt', role: 'group', 'aria-label': 'Últimas atividades do clube' },
    h('div', { class: 'crt__bezel' }, screen, h('div', { class: 'crt__knobs', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))),
    h('div', { class: 'crt__feet', 'aria-hidden': 'true' }));
}

function reviewNote(rev) {
  if (!rev) {
    return Paper([
      h('h3', { class: 'note-title note-title--sm' }, 'Avaliações do clube'),
      h('p', { class: 'note-text' }, 'Ainda não há avaliações. Abra uma fita e dê a primeira nota.'),
      h('a', { class: 'btn btn--sm', href: '/avaliacoes' }, 'Ver o mural'),
    ], { tone: 'cream', tilt: 1.2, seed: 33, tape: true });
  }
  const m = memberById(rev.memberId);
  return Paper([
    h('h3', { class: 'note-title note-title--sm', style: { color: 'var(--petrol-deep)' } }, 'Avaliações do clube'),
    h('div', { class: 'row', style: { margin: '8px 0 2px' } }, Stars(rev.rating, { tone: 'gold' }), h('span', { class: 'rating' }, fmtStars(rev.rating))),
    h('p', { class: 'note-hand' }, `“${rev.body}”`),
    h('p', { class: 'rev-by' }, '— ', m?.name ?? 'Ex-integrante', ' · ', rev.title.title),
    h('a', { class: 'placard__link', href: '/avaliacoes' }, 'Ler o mural →'),
  ], { tone: 'cream', tilt: 1.2, seed: 33, amp: 4, cls: 'note-review' });
}

function nextSession(home) {
  const q = home.queue[0];
  if (!q) {
    return Paper([
      h('p', { class: 'note-kicker' }, 'Clube de vídeo'),
      h('h3', { class: 'note-title note-title--sm' }, 'Sua próxima sessão ', h('em', null, 'já está te esperando!')),
      h('p', { class: 'note-text' }, 'Nenhuma fita reservada. Escolha uma e registre a próxima sessão.'),
      h('a', { class: 'btn btn--sm btn--yellow', href: '/catalogo' }, 'Escolher no catálogo'),
    ], { tone: 'mustard', tilt: -1.4, seed: 41, tape: true });
  }
  const watching = q.status === 'watching';
  return Paper([
    h('p', { class: 'note-kicker' }, watching ? 'Em exibição' : 'Reservada para o clube'),
    h('h3', { class: 'note-title note-title--sm' }, q.title.title),
    h('p', { class: 'note-text' }, watching ? `Começou em ${fmtDate(q.onDate)}.` : `Sessão em ${fmtDate(q.onDate)} — ${relDays(q.onDate)}.`),
    h('div', { class: 'row' }, q.attendees.map((id) => MemberDot(memberById(id), { size: 'sm' }))),
    h('button', { class: 'btn btn--sm btn--yellow', type: 'button', 'data-title-id': q.title.id }, 'Abrir a ficha'),
  ], { tone: 'mustard', tilt: -1.4, seed: 41, tape: true });
}

function counter(home) {
  const t = home.totals;
  const s = home.highlights.sintonia;
  const cell = (n, label) => h('div', { class: 'tally__cell' }, h('b', null, n), h('span', null, label));
  return Paper([
    h('p', { class: 'note-kicker' }, 'Movimento do balcão'),
    h('div', { class: 'tally' },
      cell(fmtInt(t.titles), t.titles === 1 ? 'fita na estante' : 'fitas na estante'),
      cell(fmtInt(t.sessionsWatched), t.sessionsWatched === 1 ? 'devolução' : 'devoluções'),
      cell(fmtInt(t.reviews), t.reviews === 1 ? 'avaliação' : 'avaliações'),
      cell(s == null ? '—' : `${s}%`, 'sintonia do clube')),
    s == null ? h('p', { class: 'note-hand' }, 'A sintonia aparece quando duas pessoas avaliam as mesmas fitas.') : null,
    h('a', { class: 'placard__link', href: '/estatisticas' }, 'Ver o placar completo →'),
  ], { tone: 'petrol', tilt: 0.8, seed: 51 });
}

export default async function home({ signal }) {
  const [data, watched, reviews] = await Promise.all([
    api.get('/api/home', { signal }),
    api.get('/api/titles?status=watched&sort=watched&limit=36', { signal }),
    api.get('/api/reviews?only_comments=1&limit=1', { signal }),
    loadMembers(),
  ]);
  const picks = weeklyPicks(data);
  const feature = picks[0];
  const empty = data.totals.titles === 0;

  const hero = h('section', { class: 'hero', 'aria-label': 'Entrada da locadora' },
    h('div', { class: 'hero__in' },
      heroNote(data, picks),
      feature ? h('div', { class: 'hero__feature' }, VhsBox(feature.t, { rating: feature.rating }), h('span', { class: 'hero__ribbon' }, Tag(feature.why, { tone: 'tomato', tilt: -3 }))) : null,
      crt(data)),
    h('a', { class: 'hero__scroll', href: '#assistidos', onClick: (e) => { e.preventDefault(); document.getElementById('assistidos')?.scrollIntoView({ behavior: 'smooth' }); } }, 'Role para explorar ', h('span', { 'aria-hidden': 'true' }, '↓')));

  const watchedShelf = Shelf(watched.items, {
    label: 'Filmes e séries assistidos pelo clube',
    endCap: watched.items.length < 14 ? FreeSlot(watched.items.length ? 'Cadastrar fita' : 'Cadastrar a primeira fita', addTitle) : null,
  });
  const unitWatched = h('section', { class: 'unit', id: 'assistidos', 'aria-labelledby': 'u-assistidos' },
    Placard({ title: 'Filmes assistidos', link: '/minhas-fitas', linkText: 'Ver todos', id: 'u-assistidos', seed: 7 }),
    h('div', { class: 'unit__cab' }, h('div', { class: 'unit__grid' }, watchedShelf, h('div', { class: 'unit__side' }, reviewNote(reviews.items.find((r) => r.body) ?? null)))),
    watched.items.length ? h('div', { class: 'legend', 'aria-label': 'Legenda' },
      h('span', null, h('b', null, '★'), 'favorita sua'), h('span', null, 'Selo dourado: média de estrelas do clube'), h('span', null, 'Capa de frente: sua favorita ou uma escolha de destaque')) : null);

  const newShelf = Shelf(data.recent, { label: 'Novidades: fitas cadastradas recentemente', mode: 'faces', rating: 'avg' });
  const unitNew = h('section', { class: 'unit', 'aria-labelledby': 'u-novidades' },
    Placard({ title: 'Novidades', link: '/catalogo', linkText: 'Ver mais', id: 'u-novidades', seed: 12 }),
    h('div', { class: 'unit__cab' }, h('div', { class: 'unit__grid' },
      empty ? h('div', { class: 'shelf' }, h('div', { class: 'slot slot--cap' }, FreeSlot('Cadastrar fita', addTitle))) : newShelf,
      h('div', { class: 'unit__side' }, nextSession(data), counter(data)))));

  const el = h('div', { class: 'home' }, hero, h('div', { class: 'home__shelves' }, unitWatched, unitNew));
  return { title: 'Início', el, layout: 'bleed' };
}
