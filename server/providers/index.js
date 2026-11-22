// Camada de provedores: um ponto único para buscar e montar o "rascunho" de um título.
// Trocar ou acrescentar uma fonte = criar um módulo com { name, label, enabled, search, details }
// e registrá-lo aqui. O catálogo (banco) não conhece nenhum provedor em particular.
import { createHttp, ProviderError } from './util.js';
import { createCache } from './cache.js';
import { createTmdb } from './tmdb.js';
import { createTvmaze } from './tvmaze.js';
import { createWikidata } from './wikidata.js';

export { ProviderError };

const idKeys = (r) => {
  const k = [];
  if (r.ids?.tmdb) k.push(`tmdb:${r.kind}:${r.ids.tmdb}`);
  if (r.ids?.imdb) k.push(`imdb:${r.ids.imdb}`);
  if (r.ids?.tvmaze) k.push(`tvmaze:${r.ids.tvmaze}`);
  if (r.ids?.wikidata) k.push(`wd:${r.ids.wikidata}`);
  return k;
};

export function createProviders({ config, db, fetchImpl }) {
  const http = createHttp({ userAgent: config.userAgent, fetchImpl });
  const cache = createCache(db);
  const ctx = { config, http, cache };
  const registry = {
    tmdb: createTmdb(ctx),
    tvmaze: createTvmaze(ctx),
    wikidata: createWikidata(ctx),
  };
  const ORDER = ['tmdb', 'tvmaze', 'wikidata'];

  const describe = () =>
    ORDER.map((name) => ({ name, label: registry[name].label, enabled: registry[name].enabled, primary: name === 'tmdb' }));

  /** Busca em uma ou mais fontes. Cada fonte falha sozinha, sem derrubar as demais. */
  async function search(query, { type = 'multi', year = null, sources } = {}) {
    const chosen = (sources?.length ? sources : registry.tmdb.enabled ? ['tmdb'] : ['tvmaze', 'wikidata']).filter((s) => registry[s]);
    const settled = await Promise.all(
      chosen.map(async (name) => {
        try {
          let results = await registry[name].search(query, { type, year });
          if (year && name !== 'tmdb') results = results.filter((r) => r.year === year);
          return { name, ok: true, results };
        } catch (err) {
          return { name, ok: false, error: err.message, code: err.code ?? 'upstream' };
        }
      }),
    );

    // Agrupa o que é a mesma produção (por identificadores externos, nunca por palpite de título).
    const groups = [];
    const byKey = new Map();
    for (const s of settled.sort((a, b) => ORDER.indexOf(a.name) - ORDER.indexOf(b.name))) {
      for (const r of s.results ?? []) {
        const keys = r.kind === 'person' ? [] : idKeys(r);
        const hit = keys.map((k) => byKey.get(k)).find(Boolean);
        if (hit) {
          hit.ids = { ...r.ids, ...Object.fromEntries(Object.entries(hit.ids).filter(([, v]) => v)) };
          hit.sources.push({ provider: r.provider, id: r.id });
          if (!hit.poster && r.poster) hit.poster = r.poster;
          idKeys(hit).forEach((k) => byKey.set(k, hit));
        } else {
          const g = { ...r, sources: [{ provider: r.provider, id: r.id }] };
          groups.push(g);
          keys.forEach((k) => byKey.set(k, g));
        }
      }
    }
    const providers = Object.fromEntries(
      settled.map((s) => [s.name, s.ok ? { ok: true, count: s.results.length } : { ok: false, error: s.error, code: s.code }]),
    );
    return { results: groups, providers };
  }

  const attachTvmaze = (draft, show) => {
    draft.ids.tvmaze = show.ids.tvmaze;
    draft.extra.tvmaze = show.extra.tvmaze;
    draft.origin.ids.tvmaze = 'tvmaze';
  };
  const attachWikidata = (draft, qid, extra) => {
    draft.ids.wikidata = qid;
    draft.origin.ids.wikidata = 'wikidata';
    if (extra) draft.extra.wikidata = extra;
  };

  /**
   * Monta o rascunho completo de um título a partir de qualquer fonte.
   * Regra: o TMDB é a base sempre que existir equivalente; as outras fontes só acrescentam
   * identificadores e blocos próprios em `extra` — nunca sobrescrevem campos do TMDB.
   */
  async function buildDraft(ref, { refresh = false } = {}) {
    const { provider, id } = ref;
    if (!registry[provider]) throw new ProviderError(provider, 'Fonte desconhecida.', { code: 'not_found' });
    const notes = [];
    let draft;
    let pendingTvmaze = null;
    let pendingWikidata = null;

    const viaTmdb = async (found) => registry.tmdb.details(found.id, found.kind, { refresh });

    if (provider === 'tmdb') {
      draft = await registry.tmdb.details(id, ref.kind, { refresh });
    } else if (provider === 'tvmaze') {
      const show = await registry.tvmaze.details(id, { refresh });
      draft = show;
      if (registry.tmdb.enabled && show.ids.imdb) {
        const found = await registry.tmdb.find(show.ids.imdb, 'imdb_id', { refresh }).catch(() => null);
        if (found) {
          draft = await viaTmdb(found);
          pendingTvmaze = show;
        }
      }
    } else {
      const w = await registry.wikidata.details(id, { refresh });
      draft = w;
      if (registry.tmdb.enabled && (w.ids.tmdb || w.ids.imdb)) {
        const found = w.ids.tmdb ? { id: String(w.ids.tmdb), kind: w.kind } : await registry.tmdb.find(w.ids.imdb, 'imdb_id', { refresh }).catch(() => null);
        if (found) {
          draft = await viaTmdb(found).catch(() => w);
          if (draft !== w) pendingWikidata = w;
        }
      }
    }

    if (pendingTvmaze) attachTvmaze(draft, pendingTvmaze);
    if (pendingWikidata) attachWikidata(draft, pendingWikidata.ids.wikidata, pendingWikidata.extra?.wikidata);

    // Complementos opcionais (melhor esforço): TVmaze para séries, Wikidata para o identificador.
    const imdb = draft.ids.imdb;
    const jobs = [];
    if (draft.kind === 'tv' && !draft.ids.tvmaze && imdb) {
      jobs.push(
        registry.tvmaze
          .lookupByImdb(imdb, { refresh })
          .then(async (hit) => {
            if (!hit) return;
            const full = await registry.tvmaze.details(hit.id, { refresh });
            attachTvmaze(draft, full);
          })
          .catch(() => notes.push('O TVmaze não respondeu agora; os dados complementares da série não foram anexados.')),
      );
    }
    if (!draft.ids.wikidata && imdb) {
      jobs.push(
        registry.wikidata
          .findByImdb(imdb, { refresh })
          .then((q) => q && attachWikidata(draft, q))
          .catch(() => {}),
      );
    }
    await Promise.all(jobs);

    draft.origin.fetchedFrom = Object.keys(draft.ids).filter((k) => draft.ids[k]);
    return { draft, notes };
  }

  return {
    registry,
    describe,
    search,
    buildDraft,
    personCredits: (provider, id) => {
      if (provider !== 'tmdb') throw new ProviderError(provider, 'Só o TMDB lista obras por pessoa.', { code: 'not_found' });
      return registry.tmdb.personCredits(id);
    },
    prune: cache.prune,
  };
}
