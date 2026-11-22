// Ficha de consulta: a fita sai da prateleira, aproxima-se, a embalagem se abre numa ficha; ao fechar, volta ao lugar.
// O estado vive na URL (?f=<id>): o botão "voltar" do navegador fecha a ficha, e o link abre direto nela.
import { h, trapFocus, focusables } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, loadMembers, memberById } from '../lib/store.js';
import { setQuery, openFichaId, refresh } from '../lib/router.js';
import { reduced, pop } from '../lib/motion.js';
import { fmtDate, fmtDateFull, fmtRuntime, fmtInt, fmtScore, KIND, STATUS, SOURCE_LABEL, externalLinks, INDICATOR, consensusLine, relDays } from '../lib/format.js';
import { Tape } from '../ui/tape.js';
import { Stars, Rating } from '../ui/rating.js';
import { Paper } from '../ui/paper.js';
import { MemberDot, MemberDots } from '../ui/member.js';
import { loader } from '../ui/loader.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { cardFor } from '../ui/shelf.js';

let ui = null; // { id, root, dialog, srcEl, card, data, closing }

const rectOf = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; };
const px = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
const lockScroll = (on) => document.documentElement.classList.toggle('is-locked', on);

/** Uma fita voando entre a prateleira e a ficha. Devolve uma promessa que termina quando ela pousa. */
function fly({ from, to, srcClone, card, ms = 520 }) {
  if (reduced()) return Promise.resolve();
  const front = Tape(card, { eager: true, sizes: '200px' });
  const back = srcClone ?? h('span');
  const el = h('div', { class: 'fly', 'aria-hidden': 'true' }, back, front);
  Object.assign(el.style, px(from));
  document.body.appendChild(el);
  const ease = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
  front.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.6, delay: ms * 0.18, fill: 'both', easing: 'linear' });
  if (srcClone) srcClone.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.55, fill: 'forwards', easing: 'linear' });
  el.animate([{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-16px) rotate(-3deg)', offset: 0.35 }, { transform: 'translateY(0) rotate(0deg)' }], { duration: ms, easing: ease });
  const a = el.animate([px(from), px(to)], { duration: ms, easing: ease, fill: 'forwards' });
  return a.finished.catch(() => {}).then(() => el.remove());
}

function cloneForFlight(el) {
  const c = el.cloneNode(true);
  c.removeAttribute('data-title-id');
  c.classList.add('fly__src');
  c.setAttribute('tabindex', '-1');
  return c;
}

export function initFicha() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const t = e.target.closest?.('[data-title-id]');
    if (!t || t.closest('.ficha')) return;
    e.preventDefault();
    openFicha(Number(t.dataset.titleId), t, cardFor(t));
  });
  document.addEventListener('tc:ficha-sync', sync);
  document.addEventListener('keydown', (e) => {
    if (!ui || ui.closing) return;
    if (e.key === 'Escape' && !document.querySelector('.modal-root')) { e.preventDefault(); closeFicha(); }
    else if (!document.querySelector('.modal-root')) trapFocus(ui.dialog, e);
  });
}

function sync() {
  const id = openFichaId();
  if (id && !ui) openUI(id, null, null);
  else if (!id && ui && !ui.closing) closeUI();
  else if (id && ui && ui.id !== id && !ui.closing) { closeUI({ instant: true }); openUI(id, null, null); }
}

export function openFicha(id, srcEl = null, card = null) {
  if (ui && ui.id === id) return;
  if (!ui) setQuery({ f: id }, { replace: false, ficha: true });
  else setQuery({ f: id }, { replace: true });
  if (ui) closeUI({ instant: true });
  openUI(id, srcEl, card);
}

export function closeFicha() {
  if (!ui || ui.closing) return;
  if (history.state?.ficha) history.back(); // o popstate chama sync → closeUI
  else { setQuery({ f: null }); closeUI(); }
}

/* ---------------------------------------------------------------- UI */

function openUI(id, srcEl, card) {
  const opener = document.activeElement;
  const root = h('div', { class: 'ficha-root' });
  const backdrop = h('div', { class: 'ficha-backdrop', onClick: closeFicha });
  const coverSlot = h('div', { class: 'ficha__cover' });
  const mainSlot = h('div', { class: 'ficha__main' }, loader('Buscando a ficha', { inline: true }));
  const logSlot = h('aside', { class: 'ficha__log' });
  const titleId = `ficha-t-${id}`;
  const dialog = h('article', { class: 'ficha', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
    h('div', { class: 'ficha__sheet' },
      h('button', { class: 'ficha__back', type: 'button', onClick: closeFicha }, h('span', { 'aria-hidden': 'true' }, '← '), 'Devolver à prateleira'),
      h('div', { class: 'ficha__grid' }, coverSlot, mainSlot, logSlot)));
  root.append(backdrop, dialog);
  document.body.appendChild(root);
  lockScroll(true);
  document.getElementById('app')?.setAttribute('inert', '');
  ui = { id, root, dialog, coverSlot, mainSlot, logSlot, titleId, srcEl, card, data: null, closing: false, opener, dirty: false };
  const mine = ui;

  const showCover = (c) => { coverSlot.replaceChildren(h('div', { class: 'case' }, Tape(c, { eager: true, sizes: '260px', width: 'w500', alt: `Capa de ${c.title}` }))); };
  const flying = srcEl && card && srcEl.isConnected && !reduced();

  if (card) showCover(card);
  if (flying) {
    dialog.classList.add('is-arriving');
    const from = rectOf(srcEl);
    const clone = cloneForFlight(srcEl);
    Object.assign(clone.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', transform: 'none' });
    srcEl.classList.add('is-lifted');
    const caseEl = coverSlot.firstChild;
    caseEl.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const to = rectOf(caseEl.firstChild);
      fly({ from, to, srcClone: clone, card, ms: 560 }).then(() => {
        if (ui !== mine) return;
        caseEl.style.visibility = '';
        dialog.classList.remove('is-arriving');
        dialog.classList.add('is-open');
      });
    });
  } else {
    dialog.classList.add('is-open');
  }

  load(mine);
  requestAnimationFrame(() => dialog.querySelector('.ficha__back')?.focus({ preventScroll: true }));
}

async function load(mine) {
  try {
    await loadMembers();
    const data = await api.get(`/api/titles/${mine.id}`);
    if (ui !== mine) return;
    mine.data = data;
    paint(mine);
  } catch (err) {
    if (ui !== mine) return;
    toast(err.message || 'Não foi possível abrir esta ficha.', { kind: 'error' });
    closeFicha();
  }
}

function closeUI({ instant = false } = {}) {
  const cur = ui;
  if (!cur || cur.closing) return;
  cur.closing = true;
  const { root, dialog, id, opener } = cur;
  const finish = () => {
    root.remove();
    if (ui === cur) ui = null;
    if (!document.querySelector('.ficha-root')) {
      lockScroll(false);
      document.getElementById('app')?.removeAttribute('inert');
    }
    document.querySelectorAll('.is-lifted').forEach((n) => n.classList.remove('is-lifted'));
    const target = document.querySelector(`[data-title-id="${id}"]`);
    (target?.isConnected ? target : opener?.isConnected ? opener : null)?.focus?.({ preventScroll: true });
  };
  if (instant || reduced()) return finish();

  const target = [...document.querySelectorAll(`[data-title-id="${id}"]`)].find((el) => !el.closest('.ficha'));
  const caseEl = cur.coverSlot.querySelector('.tape');
  const t = target?.isConnected ? rectOf(target) : null;
  const inView = t && t.top < innerHeight && t.top + t.height > 0;
  dialog.classList.add('is-closing');
  cur.root.querySelector('.ficha-backdrop').classList.add('is-closing');
  if (inView && caseEl && cur.card) {
    const from = rectOf(caseEl);
    target.classList.add('is-lifted');
    const srcClone = cloneForFlight(target);
    Object.assign(srcClone.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', margin: '0', transform: 'none', opacity: '0' });
    caseEl.style.visibility = 'hidden';
    // a fita sai da ficha e volta para o lugar de onde veio; a lombada/capa real reaparece quando ela pousa
    fly({ from, to: t, srcClone: null, card: cur.card, ms: 460 }).then(() => { target.classList.remove('is-lifted'); finish(); });
    setTimeout(() => dialog.classList.add('is-gone'), 120);
  } else {
    setTimeout(finish, 220);
  }
}

/* ---------------------------------------------------------------- conteúdo */

function meta(t) {
  const bits = [t.year, KIND[t.kind], fmtRuntime(t.runtime) && (t.kind === 'tv' ? `${fmtRuntime(t.runtime)} por episódio` : fmtRuntime(t.runtime))].filter(Boolean);
  return bits.join(' · ');
}

function indicatorNote(data) {
  const ind = data.indicator;
  if (!ind?.tags?.length) return null;
  const tag = ind.tags[0];
  const line = tag === 'consensus' ? consensusLine(ind.tone) : INDICATOR[tag].line;
  const who = tag === 'outlier' && ind.outlier ? ` — ${memberById(ind.outlier.memberId)?.name ?? 'alguém'} viu de outro jeito` : '';
  const more = ind.tags.includes('favorite') && tag !== 'favorite' ? ' · Caso de amor coletivo' : '';
  return h('p', { class: 'ficha__flag' }, h('span', { class: 'label label--flat' }, INDICATOR[tag].label), h('span', { class: 'hand' }, `${line}${who}${more}`));
}

function paint(cur) {
  const { data } = cur;
  const t = data.title;
  const me = state.me;
  const mineRev = data.reviews.find((r) => r.memberId === me.id) ?? null;
  const lastWatched = data.sessions.find((s) => s.status === 'watched');
  const refreshData = async () => {
    cur.data = await api.get(`/api/titles/${cur.id}`);
    if (ui === cur) paint(cur);
    refresh({ soft: true });
  };
  const nested = (fn) => { cur.root.setAttribute('inert', ''); const m = fn(); return m; };
  const nestedClose = () => cur.root.removeAttribute('inert');

  cur.coverSlot.replaceChildren(h('div', { class: 'case' }, Tape(t, { eager: true, sizes: '260px', width: 'w500', alt: `Capa de ${t.title}` }),
    h('span', { class: 'case__no' }, t.catalogNo)));

  /* ações */
  const favBtn = h('button', { class: ['btn btn--sm fav', t.favorite && 'is-on'], type: 'button', 'aria-pressed': String(t.favorite) },
    h('span', { class: 'fav__star', 'aria-hidden': 'true' }, '★'), h('span', null, t.favorite ? 'Nos favoritos' : 'Adicionar aos favoritos'));
  favBtn.addEventListener('click', async () => {
    favBtn.disabled = true;
    try {
      const r = await api.post(`/api/titles/${t.id}/favorite`, { favorite: !t.favorite });
      t.favorite = r.favorite;
      t.nFavs = r.nFavs;
      favBtn.classList.toggle('is-on', r.favorite);
      favBtn.setAttribute('aria-pressed', String(r.favorite));
      favBtn.lastChild.textContent = r.favorite ? 'Nos favoritos' : 'Adicionar aos favoritos';
      if (r.favorite) burst(favBtn);
      else pop(favBtn);
      toast(r.favorite ? 'Fita marcada com a estrelinha dourada.' : 'Estrelinha removida.', { kind: r.favorite ? 'ok' : 'info', title: r.favorite ? 'Favorita' : 'Anotado' });
      refresh({ soft: true });
    } catch (e) { toast(e.message, { kind: 'error' }); } finally { favBtn.disabled = false; }
  });

  const actions = h('div', { class: 'ficha__actions' },
    h('button', { class: 'btn btn--primary', type: 'button', onClick: async () => { const { openLogSession } = await import('./logSession.js'); nested(() => openLogSession({ title: t, onSaved: refreshData, onClose: nestedClose })); } }, 'Registrar sessão'),
    h('button', { class: 'btn btn--yellow', type: 'button', onClick: async () => { const { openReviewForm } = await import('./logSession.js'); nested(() => openReviewForm({ title: t, review: mineRev, onSaved: refreshData, onClose: nestedClose })); } }, mineRev ? 'Editar minha avaliação' : 'Avaliar'),
    favBtn);

  const tools = [];
  if (t.source !== 'manual') {
    tools.push(h('button', { class: 'link-btn', type: 'button', onClick: async (e) => {
      const b = e.currentTarget; b.disabled = true;
      try { const r = await api.post(`/api/titles/${t.id}/sync`); toast(`Dados atualizados pelo ${SOURCE_LABEL[r.syncedFrom] ?? 'provedor'}.`, { title: 'Sincronizado' }); await refreshData(); } catch (err) { toast(err.message, { kind: 'error' }); } finally { b.disabled = false; }
    } }, 'Atualizar dados da fonte'));
  }
  if (data.canEdit) tools.push(h('button', { class: 'link-btn', type: 'button', onClick: async () => { const { openManualForm } = await import('./addTitle.js'); nested(() => openManualForm({ title: t, onSaved: refreshData, onClose: nestedClose })); } }, 'Editar cadastro'));
  if (data.canDelete) {
    tools.push(h('button', { class: 'link-btn link-btn--danger', type: 'button', onClick: async () => {
      cur.root.setAttribute('inert', '');
      const ok = await confirmDialog({ title: 'Retirar da estante', message: `“${t.title}” sai da estante junto com suas sessões e avaliações. Não dá para desfazer.`, confirmLabel: 'Retirar fita', danger: true });
      nestedClose();
      if (!ok) return;
      try {
        await api.del(`/api/titles/${t.id}`);
        toast('A fita saiu da estante.', { kind: 'info', title: 'Retirada' });
        cur.card = null;
        closeFicha();
        refresh({ soft: true });
      } catch (err) { toast(err.message, { kind: 'error' }); }
    } }, 'Retirar da estante'));
  }

  /* detalhes */
  const people = (list) => list.map((p) => (p.character ? `${p.name} (${p.character})` : p.name)).join(', ');
  const details = h('div', { class: 'ficha__details' },
    t.directors.length ? h('p', null, h('b', { class: 'sign' }, t.kind === 'tv' ? 'Criação ' : 'Direção '), t.directors.map((d) => d.name).join(', ')) : null,
    t.cast.length ? h('p', null, h('b', { class: 'sign' }, 'Elenco '), people(t.cast.slice(0, 8))) : null,
    t.countries.length || t.originalLanguage ? h('p', null, h('b', { class: 'sign' }, 'Origem '), [t.countries.join(', '), t.originalLanguage && `idioma original: ${t.originalLanguage}`].filter(Boolean).join(' · ')) : null,
    t.kind === 'tv' && (t.seasons || t.seasonList.length) ? h('details', { class: 'ficha__seasons' },
      h('summary', null, `${fmtInt(t.seasons ?? t.seasonList.length)} temporada${(t.seasons ?? t.seasonList.length) === 1 ? '' : 's'}${t.episodes ? ` · ${fmtInt(t.episodes)} episódios` : ''}`),
      t.seasonList.length ? h('ul', null, t.seasonList.map((s) => h('li', null, h('b', null, s.name || `Temporada ${s.number}`), ` — ${s.episodes ?? '?'} ep.${s.airDate ? ` · estreou em ${fmtDate(s.airDate)}` : ''}`))) : h('p', { class: 'faint' }, 'A fonte não detalha as temporadas.')) : null);

  const links = externalLinks(t);
  const syncedLine = t.source === 'manual' ? 'Cadastro manual do clube — sem fonte externa.' : `Dados de ${SOURCE_LABEL[t.source] ?? t.source}${t.syncedAt ? `, atualizados em ${fmtDate(t.syncedAt)}` : ''}.`;
  const extra = t.extra?.tvmaze;
  const sources = h('div', { class: 'ficha__sources' },
    h('p', { class: 'faint' }, syncedLine, extra ? ` Complemento da série: TVmaze (${[extra.network, extra.status].filter(Boolean).join(', ')}).` : ''),
    t.externalScore != null ? h('p', { class: 'faint' }, `Nota pública (${SOURCE_LABEL[t.source]}): ${fmtScore(t.externalScore)}/10${t.externalVotes ? ` · ${fmtInt(t.externalVotes)} votos` : ''}. Não entra nas contas do clube.`) : null,
    links.length ? h('p', { class: 'ficha__links' }, links.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', 'data-external': '' }, l.label, ' ↗'))) : null);

  const avg = t.avgRating;
  cur.mainSlot.replaceChildren(
    h('div', { class: 'ficha__headrow' }, h('span', { class: 'catno' }, `${t.catalogNo}`), h('span', { class: 'label label--flat label--plain' }, STATUS[t.status]?.label ?? '')),
    h('h2', { class: 'ficha__title', id: cur.titleId }, t.title),
    t.originalTitle && t.originalTitle !== t.title ? h('p', { class: 'ficha__orig' }, t.originalTitle) : null,
    h('p', { class: 'ficha__meta' }, meta(t)),
    h('div', { class: 'ficha__rating' },
      avg != null ? [Stars(avg, { size: 'lg', tone: 'gold' }), h('span', { class: 'ficha__avg' }, `${(avg / 2).toFixed(1).replace('.', ',')} de 5`), h('span', { class: 'hand ficha__avgnote' }, `(${t.nRatings} ${t.nRatings === 1 ? 'avaliação' : 'avaliações'})`)]
        : h('span', { class: 'hand' }, 'Ainda sem avaliações do clube — seja o primeiro.')),
    indicatorNote(data),
    t.overview ? h('p', { class: 'ficha__synopsis' }, t.overview) : h('p', { class: 'ficha__synopsis faint' }, 'Sem sinopse cadastrada.'),
    t.genres.length ? h('div', { class: 'label-row' }, t.genres.map((g, i) => h('span', { class: `label ${['', 'label--red', 'label--blue'][i % 3]}`, style: { '--tilt': `${(i % 2 ? 1 : -1) * 1.5}deg` } }, g))) : null,
    actions,
    details,
    h('div', { class: 'ficha__tools' }, tools),
    sources);

  /* registro da sessão */
  const sessions = data.sessions.map((s) => h('li', null,
    h('span', { class: 'ficha__sdate' }, fmtDate(s.onDate)),
    h('span', null, STATUS[s.status]?.label ?? s.status, s.rewatch ? ' · revisão' : ''),
    MemberDots(s.attendees, { size: 'sm' }),
    s.note ? h('em', { class: 'hand' }, s.note) : null));
  const opinions = [];
  const seen = new Set();
  for (const r of data.reviews) {
    if (seen.has(r.memberId)) continue;
    seen.add(r.memberId);
    opinions.push(r);
  }
  cur.logSlot.replaceChildren(Paper([
    h('h3', { class: 'ficha__logtitle' }, 'Registro da sessão'),
    h('dl', { class: 'ficha__kv' },
      h('dt', null, 'Assistido em'), h('dd', null, lastWatched ? [fmtDateFull(lastWatched.onDate), h('small', null, ` ${relDays(lastWatched.onDate)}`)] : h('span', { class: 'faint' }, 'ainda não assistido')),
      h('dt', null, 'Sua nota'), h('dd', null, Rating(data.opinions[me.id] ?? null, { tone: 'gold' })),
      h('dt', null, 'Sua review'), h('dd', null, mineRev?.body ? h('span', { class: 'hand ficha__quote' }, `“${mineRev.body}”`) : h('span', { class: 'faint' }, mineRev ? 'só a nota, sem comentário' : 'ainda não escreveu'))),
    sessions.length ? [h('h4', { class: 'ficha__sub' }, 'Histórico de sessões'), h('ul', { class: 'ficha__sessions' }, sessions)] : null,
    h('h4', { class: 'ficha__sub' }, 'Comentários do clube'),
    opinions.length ? h('ul', { class: 'ficha__reviews' }, opinions.map((r) => h('li', null,
      MemberDot(memberById(r.memberId), { size: 'lg' }),
      h('div', null,
        h('div', { class: 'ficha__rhead' }, h('b', { class: 'sign' }, memberById(r.memberId)?.name ?? 'Ex-integrante'), Stars(r.rating, { size: 'sm', tone: 'gold' }), h('small', { class: 'faint' }, fmtDate(r.date))),
        r.body ? h('p', { class: 'hand' }, r.body) : h('p', { class: 'faint' }, 'Só a nota.'))))) : h('p', { class: 'faint' }, 'Nenhum comentário ainda. A primeira review fica no mural.'),
  ], { tone: 'cream', tilt: 0.6, seed: 17, amp: 3, cls: 'ficha__logpaper' }));
  cur.logSlot.firstChild.classList.add('is-ready');
}

function burst(btn) {
  if (reduced()) return;
  for (let i = 0; i < 7; i++) {
    const s = h('i', { class: 'burst', 'aria-hidden': 'true', style: { '--a': `${i * (360 / 7) + 10}deg`, '--d': `${34 + (i % 3) * 8}px` } }, '★');
    btn.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}
