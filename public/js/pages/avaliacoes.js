// Mural de avaliações: notas e comentários do clube + indicadores comparativos calculados das notas reais.
import { h } from '../lib/dom.js';
import { api, qs } from '../lib/api.js';
import { setQuery, refresh } from '../lib/router.js';
import { state, loadMembers, memberById } from '../lib/store.js';
import { fmtStars, fmtDate, fmtScore, plural, INDICATOR, consensusLine } from '../lib/format.js';
import { Paper, Tag } from '../ui/paper.js';
import { PageHead } from '../ui/pagehead.js';
import { Stars } from '../ui/rating.js';
import { MemberDot, MemberTag } from '../ui/member.js';
import { Tape } from '../ui/tape.js';
import { emptyState } from '../ui/empty.js';
import { select, check } from '../ui/form.js';

const PAGE = 24;
const openForm = async (opts) => (await import('../flows/logSession.js')).openReviewForm(opts);
const pickTitle = async (opts) => (await import('../flows/logSession.js')).openLogSession(opts);

function titleLink(t, extra) {
  return h('button', { class: 'linkish', type: 'button', 'data-title-id': t.id }, t.title, t.year ? h('small', null, ` ${t.year}`) : null, extra ?? null);
}

function indicatorPaper({ kind, label, items, empty, thresholdNote, tone, seed, tilt, render }) {
  return Paper([
    h('p', { class: 'note-kicker' }, label),
    items.length ? h('ul', { class: 'ind__list', role: 'list' }, items.slice(0, 3).map((it) => h('li', null, render(it)))) : h('p', { class: 'note-text' }, empty),
    thresholdNote ? h('p', { class: 'ind__rule' }, thresholdNote) : null,
  ], { tone, tilt, seed, amp: 4, cls: `ind ind--${kind}` });
}

function indicators(stats, mem) {
  const c = stats.comparison;
  const th = c.thresholds;
  const minR = c.minRaters ?? 2;
  const sint = mem.sintonia;
  const pairs = [...(sint?.pairs ?? [])].filter((p) => p.score != null).sort((a, b) => b.score - a.score);
  const best = pairs[0];
  const sintoniaPaper = Paper([
    h('p', { class: 'note-kicker' }, 'Sintonia cinematográfica'),
    sint?.score == null
      ? h('p', { class: 'note-text' }, `Aparece quando duas pessoas avaliam pelo menos ${th.minPairCommon} fitas em comum.`)
      : [h('p', { class: 'ind__big' }, `${sint.score}%`),
        h('p', { class: 'note-text' }, 'de sintonia média no clube.'),
        best ? h('p', { class: 'ind__pair' }, 'Mais afinados: ', MemberTag(memberById(best.a)), ' e ', MemberTag(memberById(best.b)), ` — ${best.score}% em ${plural(best.common, 'fita', 'fitas')} em comum.`) : null],
    h('p', { class: 'ind__rule' }, 'Calculada pela diferença média entre as notas de cada par nas fitas que os dois avaliaram.'),
  ], { tone: 'wine', cls: 'ind ind--sintonia' });

  const stars = (n) => [fmtScore(n / 2), ' ★'];
  const favorites = indicatorPaper({ kind: 'favorite', label: INDICATOR.favorite.label, items: c.collectiveFavorites, tone: 'mustard', seed: 72, tilt: 0.9,
    empty: `Uma fita vira favorito coletivo com média ≥ ${fmtScore(th.favorite / 2)} ★ e pelo menos ${th.favoriteMin} avaliações.`,
    render: (it) => [titleLink(it.title), h('span', { class: 'ind__n' }, stars(it.avg), ` · ${it.n} notas`)] });
  const consensus = indicatorPaper({ kind: 'consensus', label: INDICATOR.consensus.label, items: c.consensus, tone: 'cream', seed: 73, tilt: -0.6,
    empty: `Precisa de pelo menos ${minR} notas com pouca distância entre elas.`,
    render: (it) => [titleLink(it.title), h('span', { class: 'ind__n' }, consensusLine(it.tone), ` · média `, stars(it.avg))] });
  const divergence = indicatorPaper({ kind: 'divergence', label: INDICATOR.divergence.label, items: c.divergences, tone: 'cream', seed: 74, tilt: 0.7,
    empty: `Aparece quando as notas de uma fita se afastam ${fmtScore(th.divergence / 2)} ★ ou mais.`,
    render: (it) => [titleLink(it.title), h('span', { class: 'ind__n' }, `de ${fmtScore(it.min / 2)} ★ a ${fmtScore(it.max / 2)} ★`)] });
  const outliers = indicatorPaper({ kind: 'outlier', label: INDICATOR.outlier.label, items: c.outliers, tone: 'mustard', seed: 75, tilt: -0.9,
    empty: 'Aparece quando uma pessoa dá uma nota bem distante da turma, que está em acordo.',
    render: (it) => {
      const o = it.outlier;
      const m = o ? memberById(o.memberId) : null;
      return [titleLink(it.title), h('span', { class: 'ind__n' }, m ? `${m.name} deu ${fmtScore(o.rating / 2)} ★; os outros ficaram perto de ${fmtScore(o.othersAvg / 2)} ★` : 'uma nota bem fora do resto')];
    } });
  return h('section', { class: 'inds', 'aria-label': 'Indicadores do clube' }, sintoniaPaper, favorites, consensus, divergence, outliers);
}

function reviewCard(r, { onChange }) {
  const m = memberById(r.memberId);
  const mine = r.memberId === state.me.id;
  return Paper([
    h('div', { class: 'rv__head' }, MemberTag(m), Stars(r.rating, { tone: 'gold' }), h('span', { class: 'rating' }, fmtStars(r.rating))),
    h('div', { class: 'rv__title' }, h('span', { class: 'rv__cover' }, Tape(r.title, { sizes: '56px', alt: '' })), h('div', null, titleLink(r.title), h('small', { class: 'faint' }, fmtDate(r.date), r.wouldRewatch ? ' · reveria' : ''))),
    r.body ? h('p', { class: 'note-hand rv__body' }, `“${r.body}”`) : h('p', { class: 'faint rv__body' }, 'Só a nota, sem comentário.'),
    mine ? h('button', { class: 'link-btn', type: 'button', onClick: () => openForm({ title: r.title, review: r, onSaved: onChange }) }, 'Editar minha avaliação') : null,
  ], { tone: mine ? 'mustard' : 'cream', tilt: ((r.id * 37) % 5 - 2) * 0.5, seed: r.id + 80, amp: 3, tape: r.id % 3 === 0, cls: 'rv', tag: 'article' });
}

export default async function avaliacoes({ query, signal }) {
  const [stats, mem] = await Promise.all([api.get('/api/stats', { signal }), loadMembers()]);
  const f = { member: query.get('quem') ?? '', min: query.get('min') ?? '', only: query.get('comentarios') === '1', sort: query.get('ordem') ?? 'recent' };
  let items = [], total = 0, ctrl = null;
  const onChange = () => refresh({ soft: true });

  const board = h('div', { class: 'board' });
  const more = h('div', { class: 'cat__more' });
  const count = h('p', { class: 'cat__count' });
  const sel = (opts, cur, label) => select(opts.map(([v, l]) => ({ value: v, label: l, selected: v === cur })), { 'aria-label': label });
  const sMember = sel([['', 'Todo o clube'], ...state.members.map((m) => [String(m.id), m.name])], f.member, 'Integrante');
  const sMin = sel([['', 'Qualquer nota'], ['3', '★ 3 ou mais'], ['4', '★ 4 ou mais'], ['4.5', '★ 4,5 ou mais']], f.min, 'Nota mínima');
  const sSort = sel([['recent', 'Mais recentes'], ['best', 'Maiores notas'], ['worst', 'Menores notas'], ['title', 'Título (A–Z)']], f.sort, 'Ordenar');
  const cOnly = check({ label: 'Só com comentário', checked: f.only, onChange: () => { f.only = cOnly.input.checked; sync(); } });
  sMember.addEventListener('change', () => { f.member = sMember.value; sync(); });
  sMin.addEventListener('change', () => { f.min = sMin.value; sync(); });
  sSort.addEventListener('change', () => { f.sort = sSort.value; sync(); });

  function draw() {
    count.textContent = total ? plural(total, 'avaliação', 'avaliações') : '';
    board.replaceChildren(...(items.length ? items.map((r) => reviewCard(r, { onChange })) : [emptyState({
      title: 'O mural está vazio por aqui', text: f.member || f.min || f.only ? 'Nenhuma avaliação com esses filtros.' : 'Ninguém avaliou nada ainda. Escolha uma fita e dê a primeira nota.',
      actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => pickTitle({ onSaved: onChange }) }, 'Registrar sessão e avaliar')] })]));
    more.replaceChildren(items.length < total ? h('button', { class: 'btn', type: 'button', onClick: () => load(true) }, `Ver mais (${total - items.length})`) : '');
  }
  async function load(append = false) {
    ctrl?.abort(); ctrl = new AbortController(); const mine = ctrl;
    try {
      const r = await api.get(`/api/reviews${qs({ member: f.member, min_rating: f.min, only_comments: f.only ? 1 : null, sort: f.sort, limit: PAGE, offset: append ? items.length : 0 })}`, { signal: mine.signal });
      if (mine !== ctrl) return;
      items = append ? [...items, ...r.items] : r.items; total = r.total; draw();
    } catch (e) { if (e?.name !== 'AbortError') board.replaceChildren(emptyState({ tone: 'error', title: 'Não deu para ler o mural', text: e.message })); }
  }
  function sync() { setQuery({ quem: f.member || null, min: f.min || null, comentarios: f.only ? '1' : null, ordem: f.sort === 'recent' ? null : f.sort }); load(); }

  const el = h('div', { class: 'mural' },
    PageHead({ kicker: 'Mural do clube', title: 'Avaliações', lead: 'Quem gostou do quê — e onde o clube concorda ou briga. Todos os indicadores são calculados das notas reais.', seed: 26,
      actions: [h('button', { class: 'btn btn--primary', type: 'button', onClick: () => pickTitle({ onSaved: onChange }) }, 'Registrar sessão e avaliar')] }),
    indicators(stats, mem),
    h('div', { class: 'cat__bar mural__bar' }, h('div', { class: 'cat__selects' }, sMember, sMin, sSort), cOnly.el),
    count, board, more);
  await load();
  return { title: 'Avaliações', el, layout: 'wide', destroy: () => ctrl?.abort() };
}
