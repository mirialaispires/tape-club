// Wikidata — descoberta de produções menos conhecidas e ponte entre identificadores (IMDb, TMDB).
// Dados estruturados em CC0. Docs: https://www.wikidata.org/wiki/Wikidata:Data_access
// Não importamos imagens daqui: direitos de capas/cartazes no Commons variam obra a obra.
import { ProviderError } from './util.js';
import { canonicalGenres } from './genres.js';

const TV_CLASSES = new Set(['Q5398426', 'Q1259759', 'Q526877', 'Q63952888', 'Q581714', 'Q117467246']);
const FILM_CLASSES = new Set(['Q11424', 'Q24862', 'Q24869', 'Q202866', 'Q93204', 'Q226730', 'Q506240', 'Q20650540']);
const LANGS = 'pt|pt-br|en|mul';

const vals = (ent, pid) =>
  (ent?.claims?.[pid] ?? []).filter((c) => c.mainsnak?.snaktype === 'value').map((c) => c.mainsnak.datavalue.value);
const first = (ent, pid) => vals(ent, pid)[0] ?? null;
const qid = (v) => v?.id ?? null;
const yearFromTime = (v) => {
  const m = /^[+-]?(\d{4})/.exec(v?.time ?? '');
  return m ? Number(m[1]) : null;
};
const earliestYear = (ent) => {
  const ys = vals(ent, 'P577').map(yearFromTime).filter(Boolean);
  return ys.length ? Math.min(...ys) : null;
};
const labelOf = (ent) => {
  const l = ent?.labels;
  return l?.pt?.value ?? l?.['pt-br']?.value ?? l?.en?.value ?? l?.mul?.value ?? Object.values(l ?? {})[0]?.value ?? null;
};
const descOf = (ent) => ent?.descriptions?.pt?.value ?? ent?.descriptions?.en?.value ?? Object.values(ent?.descriptions ?? {})[0]?.value ?? '';
const quantity = (v) => (v?.amount ? Number(v.amount) : null);

function kindOf(ent) {
  if (first(ent, 'P4983')) return 'tv';
  if (first(ent, 'P4947')) return 'movie';
  return vals(ent, 'P31').map(qid).some((c) => TV_CLASSES.has(c)) ? 'tv' : 'movie';
}

function isWork(ent) {
  const classes = vals(ent, 'P31').map(qid);
  if (classes.some((c) => FILM_CLASSES.has(c) || TV_CLASSES.has(c))) return true;
  const imdb = first(ent, 'P345');
  if (typeof imdb === 'string' && /^tt\d+$/.test(imdb)) return true;
  return Boolean(first(ent, 'P4983') || first(ent, 'P4947'));
}

function ids(ent) {
  const imdb = first(ent, 'P345');
  const tmdb = first(ent, 'P4983') ?? first(ent, 'P4947');
  return {
    wikidata: ent.id,
    imdb: typeof imdb === 'string' && /^tt\d+$/.test(imdb) ? imdb : null,
    tmdb: tmdb && /^\d+$/.test(String(tmdb)) ? Number(tmdb) : null,
  };
}

export function createWikidata({ config, http, cache }) {
  const ttl = config.cacheTtl;

  const get = (url, key, ttlMs, { refresh = false, headers } = {}) =>
    cache
      .wrap(key, ttlMs, () => http.json(url, { provider: 'wikidata', headers, minIntervalMs: 150, timeoutMs: 10_000 }), { refresh })
      .then((r) => r.value);

  async function api(params, ttlMs, opts) {
    const url = new URL(config.wikidata.api);
    for (const [k, v] of Object.entries({ format: 'json', ...params })) url.searchParams.set(k, v);
    return get(url, `wikidata:${url.search}`, ttlMs, opts);
  }

  async function getEntities(idList, props, opts) {
    const out = {};
    for (let i = 0; i < idList.length; i += 50) {
      const r = await api({ action: 'wbgetentities', ids: idList.slice(i, i + 50).join('|'), props, languages: LANGS }, ttl.details, opts);
      Object.assign(out, r.entities ?? {});
    }
    return out;
  }

  return {
    name: 'wikidata',
    label: 'Wikidata',
    enabled: true,

    async search(query, { type = 'multi' } = {}) {
      if (type === 'person') return [];
      const find = (language) =>
        api({ action: 'wbsearchentities', search: query, language, uselang: language, type: 'item', limit: '10' }, ttl.search).then((r) => r.search ?? []);
      const [pt, en] = await Promise.all([find('pt'), find('en')]);
      const idList = [...new Set([...pt, ...en].map((x) => x.id))];
      if (!idList.length) return [];
      const ents = await getEntities(idList, 'labels|descriptions|claims');
      const out = [];
      for (const id of idList) {
        const ent = ents[id];
        if (!ent || ent.missing !== undefined || !isWork(ent)) continue;
        const kind = kindOf(ent);
        if (type !== 'multi' && type !== kind) continue;
        const label = labelOf(ent);
        if (!label) continue;
        const enLabel = ent.labels?.en?.value;
        out.push({
          provider: 'wikidata',
          id,
          kind,
          title: label,
          originalTitle: enLabel && enLabel !== label ? enLabel : null,
          year: earliestYear(ent),
          overview: descOf(ent),
          poster: null,
          ids: ids(ent),
          meta: {},
        });
      }
      return out.slice(0, 12);
    },

    async details(id, { refresh = false } = {}) {
      if (!/^Q\d+$/.test(id)) throw new ProviderError('wikidata', 'Identificador inválido.', { code: 'not_found' });
      const ents = await getEntities([id], 'labels|descriptions|claims', { refresh });
      const ent = ents[id];
      if (!ent || ent.missing !== undefined) throw new ProviderError('wikidata', 'Não encontrado na fonte.', { code: 'not_found' });
      const kind = kindOf(ent);
      const refIds = [
        ...new Set(
          [...vals(ent, 'P57'), ...vals(ent, 'P136'), ...vals(ent, 'P495'), ...vals(ent, 'P364'), ...vals(ent, 'P161').slice(0, 12), ...(kind === 'tv' ? vals(ent, 'P170').slice(0, 3) : [])]
            .map(qid)
            .filter(Boolean),
        ),
      ];
      const refs = refIds.length ? await getEntities(refIds, 'labels', { refresh }) : {};
      const L = (v) => labelOf(refs[qid(v)]);

      let runtime = null;
      const dur = first(ent, 'P2047');
      if (dur) {
        const unit = String(dur.unit ?? '').split('/').pop();
        const n = quantity(dur);
        if (n) runtime = Math.round(unit === 'Q11574' ? n / 60 : unit === 'Q25235' ? n * 60 : n);
      }
      const description = descOf(ent);
      const directors = vals(ent, 'P57').map(L).filter(Boolean).slice(0, 4).map((name) => ({ name, id: null, role: 'Direção' }));
      if (kind === 'tv') vals(ent, 'P170').map(L).filter(Boolean).slice(0, 3).forEach((name) => directors.unshift({ name, id: null, role: 'Criação' }));
      const seasons = quantity(first(ent, 'P2437'));
      const episodes = quantity(first(ent, 'P1113'));

      return {
        kind,
        title: labelOf(ent) ?? id,
        originalTitle: ent.labels?.en?.value && ent.labels.en.value !== labelOf(ent) ? ent.labels.en.value : null,
        year: earliestYear(ent),
        tagline: null,
        overview: description,
        posterRef: null,
        backdropRef: null,
        runtime,
        originalLanguage: vals(ent, 'P364').map(L).filter(Boolean)[0] ?? null,
        genres: canonicalGenres(vals(ent, 'P136').map(L)),
        countries: vals(ent, 'P495').map(L).filter(Boolean),
        directors,
        cast: vals(ent, 'P161').map(L).filter(Boolean).slice(0, 12).map((name) => ({ name, id: null, character: null })),
        seasons: kind === 'tv' ? seasons : null,
        episodes: kind === 'tv' ? episodes : null,
        seasonList: [],
        ids: { ...ids(ent), tvmaze: null },
        externalScore: null,
        externalVotes: null,
        extra: { wikidata: { description } },
        origin: { primary: 'wikidata', overview: description ? 'wikidata:descrição curta' : undefined, ids: { wikidata: 'wikidata' } },
        source: 'wikidata',
      };
    },

    /** IMDb → item do Wikidata (SPARQL). Só aceita tt1234567. */
    async findByImdb(imdb, { refresh = false } = {}) {
      if (!/^tt\d{5,12}$/.test(imdb ?? '')) return null;
      const url = new URL(config.wikidata.sparql);
      url.searchParams.set('format', 'json');
      url.searchParams.set('query', `SELECT ?item WHERE { ?item wdt:P345 "${imdb}" } LIMIT 1`);
      const r = await get(url, `wikidata:sparql:${imdb}`, ttl.details, { refresh, headers: { Accept: 'application/sparql-results+json' } });
      const uri = r?.results?.bindings?.[0]?.item?.value;
      return uri ? uri.split('/').pop() : null;
    },
  };
}
