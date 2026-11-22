// Cadastrar fita: pesquisa nas fontes (enquanto digita, com debounce), prévia dos metadados importados,
// confirmação, e cadastro manual para o que as fontes não têm. O servidor busca os dados de novo ao confirmar.
import { h, debounce } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, tmdbEnabled } from '../lib/store.js';
import { refresh } from '../lib/router.js';
import { stampOverlay } from '../lib/motion.js';
import { KIND, SOURCE_LABEL, fmtRuntime } from '../lib/format.js';
import { openModal } from '../ui/modal.js';
import { field, input, textarea, select, segmented, withBusy, showFieldErrors } from '../ui/form.js';
import { Tape } from '../ui/tape.js';
import { toast } from '../ui/toast.js';
import { loader } from '../ui/loader.js';

const TYPES = [{ value: 'multi', label: 'Tudo' }, { value: 'movie', label: 'Filmes' }, { value: 'tv', label: 'Séries' }, { value: 'person', label: 'Pessoas' }];
const providerOn = (name) => state.providers.find((p) => p.name === name)?.enabled;

async function openFicha(id) { (await import('./ficha.js')).openFicha(id); }

export function openAddTitle({ query = '' } = {}) {
  let type = 'multi';
  let extra = new Set(); // fontes complementares pedidas pela pessoa
  let controller = null;
  let lastResults = null; // para "voltar aos resultados" a partir da prévia
  let modal;

  const q = input({ type: 'search', placeholder: 'Título, em português ou no original…', value: query, 'data-autofocus': '', 'aria-label': 'Título para pesquisar', enterkeyhint: 'search' });
  const year = input({ type: 'text', inputmode: 'numeric', maxlength: 4, placeholder: 'Ano', 'aria-label': 'Ano de lançamento (opcional)', class: 'input add__year' });
  const seg = segmented({ name: 'tipo', label: 'Tipo de produção', options: TYPES, value: type, onChange: (v) => { type = v; run(); } });
  const notice = h('div', { class: 'add__notice' });
  const out = h('div', { class: 'add__out', 'aria-live': 'polite' });
  const more = h('div', { class: 'add__more' });

  const sourcesFor = () => {
    const base = tmdbEnabled() ? [] : ['tvmaze', 'wikidata'].filter(providerOn);
    return [...new Set([...base, ...extra])];
  };

  function showNotice() {
    notice.replaceChildren();
    if (!tmdbEnabled()) {
      notice.append(h('div', { class: 'callout' }, h('b', null, 'O TMDB ainda não foi ligado neste servidor. '),
        'Defina TMDB_API_KEY (ou TMDB_READ_TOKEN) no ambiente do servidor para pesquisar a maior base. Enquanto isso, a busca usa as fontes complementares (TVmaze e Wikidata) e o cadastro manual.'));
    }
  }

  function renderMore(text) {
    more.replaceChildren(
      h('p', { class: 'add__morehead' }, text ?? 'Não é essa fita? Tente outra fonte ou cadastre à mão.'),
      h('div', { class: 'row' },
        providerOn('tvmaze') ? h('button', { class: 'btn btn--sm', type: 'button', disabled: extra.has('tvmaze') && !tmdbEnabled(), onClick: () => addSource('tvmaze') }, 'Pesquisar também no TVmaze') : null,
        providerOn('wikidata') ? h('button', { class: 'btn btn--sm', type: 'button', disabled: extra.has('wikidata') && !tmdbEnabled(), onClick: () => addSource('wikidata') }, 'Pesquisar também no Wikidata') : null,
        h('button', { class: 'btn btn--sm btn--yellow', type: 'button', onClick: () => manual() }, 'Cadastrar manualmente')));
  }
  function addSource(s) { extra.add(s); run(); }

  function manual() {
    const prefill = { title: q.value.trim(), kind: type === 'tv' ? 'tv' : 'movie', year: year.value.trim() };
    modal.close();
    openManualForm({ prefill });
  }

  function hitList(results, { back } = {}) {
    if (!results.length) return null;
    return h('ul', { class: 'hits', role: 'list' }, results.map((r) => {
      const person = r.kind === 'person';
      const srcs = (r.sources?.length ? r.sources.map((s) => s.provider) : [r.provider]).map((p) => SOURCE_LABEL[p] ?? p);
      const btn = h('button', { class: 'hit', type: 'button', onClick: () => (person ? openPerson(r) : r.inCatalog ? (modal.close(), openFicha(r.inCatalog.id)) : preview(r, results)) },
        h('span', { class: 'hit__cover' }, Tape({ title: r.title, year: r.year, posterRef: r.poster }, { sizes: '64px', alt: '' })),
        h('span', { class: 'hit__body' },
          h('span', { class: 'hit__title' }, r.title, r.year ? h('small', null, ` ${r.year}`) : null),
          h('span', { class: 'hit__meta' },
            person ? [r.meta?.department ?? 'Pessoa', r.meta?.knownFor?.length ? ` · ${r.meta.knownFor.join(', ')}` : ''] : [KIND[r.kind] ?? r.kind, r.originalTitle && r.originalTitle !== r.title ? ` · ${r.originalTitle}` : '']),
          r.overview ? h('span', { class: 'hit__text' }, r.overview) : null,
          h('span', { class: 'hit__tags' },
            srcs.map((s) => h('span', { class: 'label label--flat label--plain' }, s)),
            r.inCatalog ? h('span', { class: 'label label--green' }, 'Já na estante — abrir ficha') : null)));
      return h('li', null, btn);
    }));
  }

  async function run() {
    controller?.abort();
    const text = q.value.trim();
    showNotice();
    if (text.length < 2) {
      out.replaceChildren(h('p', { class: 'add__hint' }, 'Digite pelo menos 2 letras. Os resultados aparecem enquanto você escreve.'));
      more.replaceChildren();
      renderMore('Prefere preencher você mesmo?');
      lastResults = null;
      return;
    }
    controller = new AbortController();
    const mine = controller;
    out.replaceChildren(loader('Procurando na estante do mundo', { inline: true }));
    try {
      const params = new URLSearchParams({ q: text, type });
      if (year.value.trim()) params.set('year', year.value.trim());
      const src = sourcesFor();
      if (src.length) params.set('sources', src.join(','));
      const r = await api.get(`/api/search?${params}`, { signal: mine.signal });
      if (mine !== controller) return;
      lastResults = r.results;
      const failed = Object.entries(r.providers ?? {}).filter(([, s]) => !s.ok);
      out.replaceChildren(
        ...(failed.length ? [h('div', { class: 'callout callout--red', role: 'status' }, failed.map(([n, s]) => `${SOURCE_LABEL[n] ?? n}: ${s.error}`).join(' · '))] : []),
        hitList(r.results) ?? h('div', { class: 'add__none' }, h('b', null, `Nada encontrado para “${text}”.`), h('p', null, 'Confira a grafia, tente o título original ou o ano — ou use uma fonte complementar abaixo. Nenhuma base cobre tudo.')));
      renderMore(r.results.length ? undefined : 'Pesquisa complementar e cadastro manual:');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (mine !== controller) return;
      out.replaceChildren(h('div', { class: 'callout callout--red', role: 'alert' }, err.fields?.q ?? err.message));
      renderMore('Se a fonte está fora do ar, dá para cadastrar à mão:');
    }
  }
  const runSoon = debounce(run, 350);
  q.addEventListener('input', runSoon);
  year.addEventListener('input', runSoon);

  async function openPerson(p) {
    out.replaceChildren(loader('Abrindo a filmografia', { inline: true }));
    try {
      const r = await api.get(`/api/search/person/${p.provider}/${encodeURIComponent(p.id)}`);
      out.replaceChildren(
        h('button', { class: 'link-btn', type: 'button', onClick: () => { out.replaceChildren(hitList(lastResults) ?? ''); } }, '← Voltar aos resultados'),
        h('h3', { class: 'add__sub' }, `Trabalhos de ${p.title}`),
        hitList(r.results) ?? h('p', { class: 'add__hint' }, 'A fonte não listou trabalhos para esta pessoa.'));
    } catch (err) {
      out.replaceChildren(h('div', { class: 'callout callout--red', role: 'alert' }, err.message));
    }
  }

  async function preview(r, results) {
    const backToResults = () => { modal.setBody(searchBody()); modal.setFoot(); out.replaceChildren(hitList(results) ?? ''); renderMore(); q.focus(); };
    modal.setBody(loader('Lendo a ficha da fonte', { inline: true }));
    modal.setFoot();
    try {
      const { draft, notes, existing } = await api.post('/api/import/preview', { provider: r.provider, id: r.id, kind: r.kind });
      const cast = (draft.cast ?? []).slice(0, 6).map((c) => c.name).join(', ');
      const dirs = (draft.directors ?? []).map((d) => d.name).join(', ');
      const meta = [draft.year, KIND[draft.kind], fmtRuntime(draft.runtime), draft.kind === 'tv' && draft.seasons ? `${draft.seasons} temporada${draft.seasons === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ');
      const origin = draft.origin?.fetchedFrom?.length ? draft.origin.fetchedFrom.map((p) => SOURCE_LABEL[p] ?? (p === 'imdb' ? 'IMDb (identificador)' : p)).join(', ') : SOURCE_LABEL[draft.source];
      modal.setBody(h('div', { class: 'preview' },
        h('div', { class: 'preview__cover' }, Tape(draft, { eager: true, sizes: '220px', width: 'w500', alt: `Capa de ${draft.title}` })),
        h('div', { class: 'preview__main' },
          h('h3', { class: 'preview__title' }, draft.title),
          draft.originalTitle && draft.originalTitle !== draft.title ? h('p', { class: 'faint' }, draft.originalTitle) : null,
          h('p', { class: 'preview__meta' }, meta),
          draft.genres?.length ? h('div', { class: 'label-row' }, draft.genres.map((g, i) => h('span', { class: `label ${['', 'label--red', 'label--blue'][i % 3]}` }, g))) : null,
          h('p', { class: 'preview__text' }, draft.overview || 'A fonte não tem sinopse para esta produção.'),
          dirs ? h('p', null, h('b', { class: 'sign' }, draft.kind === 'tv' ? 'Criação ' : 'Direção '), dirs) : null,
          cast ? h('p', null, h('b', { class: 'sign' }, 'Elenco '), cast) : null,
          (draft.countries?.length || draft.originalLanguage) ? h('p', null, h('b', { class: 'sign' }, 'Origem '), [draft.countries?.join(', '), draft.originalLanguage && `idioma original: ${draft.originalLanguage}`].filter(Boolean).join(' · ')) : null,
          h('p', { class: 'faint preview__origin' }, `Dados importados de: ${origin}. Eles continuam identificados por fonte na ficha.`),
          ...(notes ?? []).map((n) => h('div', { class: 'callout' }, n)),
          existing ? h('div', { class: 'callout callout--red', role: 'status' }, `“${existing.title}” já está na estante (mesmo registro nas fontes). Não vamos duplicar.`) : null)));
      modal.setFoot(
        h('button', { class: 'btn', type: 'button', onClick: backToResults }, '← Voltar aos resultados'),
        existing
          ? h('button', { class: 'btn btn--primary', type: 'button', onClick: () => { modal.close(); openFicha(existing.id); } }, 'Abrir a ficha existente')
          : h('button', { class: 'btn btn--primary', type: 'button', 'data-autofocus': '', onClick: (e) => confirm(e.currentTarget, r) }, 'Confirmar inclusão na estante'));
      modal.foot.querySelector('.btn--primary')?.focus();
    } catch (err) {
      toast(err.message, { kind: 'error', title: 'Não deu para ler a ficha' });
      backToResults();
    }
  }

  function confirm(btn, r) {
    withBusy(btn, async () => {
      modal.setBusy(true);
      try {
        const res = await api.post('/api/titles', { draft: { provider: r.provider, id: r.id, kind: r.kind } });
        stampOverlay('Na estante', 'red');
        toast(`“${res.title.title}” foi para a estante ${res.title.catalogNo ?? ''}.`.trim(), { title: 'Fita cadastrada' });
        modal.close();
        await refresh({ soft: true });
        openFicha(res.id);
      } catch (err) {
        if (err.status === 409 && err.fields?.existingId) {
          toast(err.message, { kind: 'info', title: 'Já existe' });
          modal.close();
          openFicha(err.fields.existingId);
        } else toast(err.message, { kind: 'error', title: 'Não foi possível cadastrar' });
      } finally { modal.setBusy(false); }
    });
  }

  function searchBody() {
    return h('div', { class: 'add' },
      h('div', { class: 'add__bar' }, h('div', { class: 'add__field' }, q), year),
      seg.el, notice, out, more);
  }

  modal = openModal({ title: 'Cadastrar fita', no: 'Balcão', width: 900, body: searchBody(), closeOnBackdrop: false });
  run();
}

/* ------------------------------------------------------------------ cadastro manual */

const reduceImage = (file, max = 700) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível reduzir a imagem.'))), 'image/jpeg', 0.86);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Esse arquivo não parece ser uma imagem.')); };
  img.src = url;
});

/** Criar (sem `title`) ou editar (com `title`) um cadastro manual. */
export function openManualForm({ title = null, prefill = {}, onSaved, onClose } = {}) {
  const editing = Boolean(title);
  const list = (arr) => (arr ?? []).map((x) => x?.name ?? x).join(', ');
  const v = editing ? { kind: title.kind, title: title.title, originalTitle: title.originalTitle ?? '', year: title.year ?? '', directors: list(title.directors), genres: list(title.genres), countries: list(title.countries), originalLanguage: title.originalLanguage ?? '', runtime: title.runtime ?? '', overview: title.overview ?? '', seasons: title.seasons ?? '', episodes: title.episodes ?? '', posterRef: title.posterRef ?? null }
    : { kind: prefill.kind ?? 'movie', title: prefill.title ?? '', originalTitle: '', year: prefill.year ?? '', directors: '', genres: '', countries: '', originalLanguage: '', runtime: '', overview: '', seasons: '', episodes: '', posterRef: null };

  const kind = segmented({ name: 'kind', label: 'Tipo', options: [{ value: 'movie', label: 'Filme' }, { value: 'tv', label: 'Série' }], value: v.kind, onChange: () => toggleTv() });
  const F = {
    title: field({ label: 'Título', name: 'title', control: input({ value: v.title, required: true, 'data-autofocus': '' }) }),
    originalTitle: field({ label: 'Título original', name: 'originalTitle', optional: true, control: input({ value: v.originalTitle }) }),
    year: field({ label: 'Ano', name: 'year', optional: true, control: input({ value: v.year, inputmode: 'numeric', maxlength: 4 }) }),
    runtime: field({ label: 'Duração (minutos)', name: 'runtime', optional: true, control: input({ value: v.runtime, inputmode: 'numeric' }) }),
    directors: field({ label: 'Direção', name: 'directors', optional: true, hint: 'Separe por vírgula.', control: input({ value: v.directors }) }),
    genres: field({ label: 'Gêneros', name: 'genres', optional: true, hint: 'Separe por vírgula. Ex.: Drama, Crime', control: input({ value: v.genres }) }),
    countries: field({ label: 'País de produção', name: 'countries', optional: true, control: input({ value: v.countries }) }),
    originalLanguage: field({ label: 'Idioma original', name: 'originalLanguage', optional: true, control: input({ value: v.originalLanguage }) }),
    seasons: field({ label: 'Temporadas', name: 'seasons', optional: true, control: input({ value: v.seasons, inputmode: 'numeric' }) }),
    episodes: field({ label: 'Episódios', name: 'episodes', optional: true, control: input({ value: v.episodes, inputmode: 'numeric' }) }),
    overview: field({ label: 'Sinopse', name: 'overview', optional: true, max: 4000, span2: true, control: textarea({ rows: 4, value: v.overview }) }),
  };
  F.overview.control.value = v.overview;
  let posterRef = v.posterRef;
  const posterBox = h('div', { class: 'manual__poster' });
  const posterErr = h('div', { class: 'field__error', role: 'alert' });
  const drawPoster = () => posterBox.replaceChildren(Tape({ title: F.title.control.value || 'Sem título', year: F.year.control.value, posterRef }, { sizes: '140px', alt: '' }));
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', class: 'sr-only', id: 'manual-file', onChange: async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    posterErr.textContent = '';
    try {
      const blob = await reduceImage(f);
      const r = await api.upload('/api/uploads/poster', blob);
      posterRef = r.ref;
      drawPoster();
    } catch (err) { posterErr.textContent = err.message; }
  } });
  F.title.control.addEventListener('input', () => { if (!posterRef) drawPoster(); });
  drawPoster();

  const tvOnly = [F.seasons.el, F.episodes.el];
  const toggleTv = () => tvOnly.forEach((el) => { el.hidden = kind.value !== 'tv'; });
  toggleTv();

  const err = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const form = h('form', { class: 'manual', novalidate: true },
    h('p', { class: 'modal__lead' }, editing ? 'Ajuste os dados deste cadastro manual.' : 'Use este formulário para produções que as fontes não encontraram. Ele vira um cadastro marcado como “manual”.'),
    err,
    h('div', { class: 'manual__grid' },
      h('div', { class: 'manual__side' }, posterBox,
        h('label', { class: 'btn btn--sm', for: 'manual-file' }, posterRef ? 'Trocar capa' : 'Enviar capa'), file, posterErr,
        h('p', { class: 'faint manual__note' }, 'Sem capa, o clube usa uma capa tipográfica — nada de imagem aleatória.')),
      h('div', { class: 'form-grid' },
        h('div', { class: 'field span-2' }, h('span', { class: 'field__label' }, 'Tipo'), kind.el),
        F.title.el, F.originalTitle.el, F.year.el, F.runtime.el, F.directors.el, F.genres.el, F.countries.el, F.originalLanguage.el, ...tvOnly, F.overview.el)));

  const modal = openModal({
    title: editing ? 'Editar cadastro' : 'Cadastro manual', no: editing ? title.catalogNo : 'Balcão', width: 820, body: form, onClose,
    foot: (m) => [
      h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn btn--primary', type: 'submit', form: 'manual-form', id: 'manual-save' }, editing ? 'Salvar alterações' : 'Guardar na estante'),
    ],
  });
  form.id = 'manual-form';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    Object.values(F).forEach((f) => f.clearError());
    if (!F.title.control.value.trim()) { F.title.setError('Diga o título.'); F.title.control.focus(); return; }
    const body = { kind: kind.value, posterRef: posterRef || null };
    for (const [k, f] of Object.entries(F)) body[k] = f.control.value.trim() || null;
    if (kind.value !== 'tv') { body.seasons = null; body.episodes = null; }
    withBusy(document.getElementById('manual-save'), async () => {
      modal.setBusy(true);
      try {
        if (editing) {
          await api.patch(`/api/titles/${title.id}`, body);
          toast('Cadastro atualizado.', { title: 'Salvo' });
          modal.close();
          onSaved?.();
        } else {
          const r = await api.post('/api/titles', { manual: body });
          stampOverlay('Na estante', 'red');
          toast(`“${r.title.title}” foi guardada na estante.`, { title: 'Fita cadastrada' });
          modal.close();
          await refresh({ soft: true });
          openFicha(r.id);
        }
      } catch (ex) {
        if (ex.status === 409 && ex.fields?.existingId) {
          err.textContent = ex.message; err.hidden = false;
          return;
        }
        const rest = showFieldErrors(Object.values(F), ex.fields);
        if (ex.fields?.posterRef) posterErr.textContent = ex.fields.posterRef;
        if (rest.length || !ex.fields) { err.textContent = rest[0] || ex.message; err.hidden = false; }
      } finally { modal.setBusy(false); }
    });
  });
  return modal;
}
