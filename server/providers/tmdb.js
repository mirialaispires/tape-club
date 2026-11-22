// TMDB — fonte principal. Docs: https://developer.themoviedb.org/
// A chave fica só no servidor. Imagens NÃO são copiadas: guardamos apenas o caminho e o navegador
// carrega direto da CDN do TMDB (conforme os termos de uso).
import { ProviderError } from './util.js';

const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const langNames = new Intl.DisplayNames(['pt-BR'], { type: 'language' });
const region = (c) => { try { return regionNames.of(c) ?? c; } catch { return c; } };
const language = (c) => { try { return langNames.of(c) ?? c; } catch { return c; } };
const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const img = (p) => (p ? `tmdb:${p}` : null);

function normSearchItem(r, kind) {
  const isMovie = kind === 'movie';
  return {
    provider: 'tmdb',
    id: String(r.id),
    kind,
    title: (isMovie ? r.title : r.name) || (isMovie ? r.original_title : r.original_name) || '(sem título)',
    originalTitle: (isMovie ? r.original_title : r.original_name) || null,
    year: yearOf(isMovie ? r.release_date : r.first_air_date),
    overview: r.overview || '',
    poster: img(r.poster_path),
    ids: { tmdb: r.id },
    meta: { popularity: r.popularity ?? 0, score: r.vote_average ?? null, votes: r.vote_count ?? 0 },
  };
}

function normPerson(r) {
  return {
    provider: 'tmdb',
    id: String(r.id),
    kind: 'person',
    title: r.name,
    originalTitle: null,
    year: null,
    overview: '',
    poster: img(r.profile_path),
    ids: { tmdb: r.id },
    meta: {
      department: r.known_for_department ?? null,
      knownFor: (r.known_for ?? []).map((k) => k.title || k.name).filter(Boolean).slice(0, 3),
      popularity: r.popularity ?? 0,
    },
  };
}

export function createTmdb({ config, http, cache }) {
  const cfg = config.tmdb;
  const enabled = Boolean(cfg.apiKey || cfg.readToken);

  async function call(path, params = {}, { ttl, refresh = false, lang = cfg.language } = {}) {
    if (!enabled) {
      throw new ProviderError('tmdb', 'A chave do TMDB ainda não foi configurada neste servidor.', { code: 'not_configured' });
    }
    const qs = new URLSearchParams({ ...params, language: lang });
    const { value } = await cache.wrap(
      `tmdb:${path}?${qs}`, // a chave de API nunca entra na chave de cache
      ttl,
      () => {
        const url = new URL(cfg.base + path);
        for (const [k, v] of qs) url.searchParams.set(k, v);
        const headers = {};
        if (cfg.readToken) headers.Authorization = `Bearer ${cfg.readToken}`;
        else url.searchParams.set('api_key', cfg.apiKey);
        return http.json(url, { provider: 'tmdb', headers, minIntervalMs: 25 });
      },
      { refresh },
    );
    return value;
  }

  const ttl = config.cacheTtl;

  return {
    name: 'tmdb',
    label: 'TMDB',
    enabled,

    async search(query, { type = 'multi', year } = {}) {
      const base = { query, include_adult: 'false', page: '1' };
      if (type === 'person') {
        const r = await call('/search/person', base, { ttl: ttl.search });
        return (r.results ?? []).slice(0, 20).map(normPerson);
      }
      const wantMovie = type === 'multi' || type === 'movie';
      const wantTv = type === 'multi' || type === 'tv';
      let items = [];
      if (type === 'multi' && !year) {
        const r = await call('/search/multi', base, { ttl: ttl.search });
        items = (r.results ?? [])
          .filter((x) => x.media_type === 'movie' || x.media_type === 'tv')
          .map((x) => normSearchItem(x, x.media_type));
      } else {
        const jobs = [];
        if (wantMovie) jobs.push(call('/search/movie', year ? { ...base, year } : base, { ttl: ttl.search }).then((r) => (r.results ?? []).map((x) => normSearchItem(x, 'movie'))));
        if (wantTv) jobs.push(call('/search/tv', year ? { ...base, first_air_date_year: year } : base, { ttl: ttl.search }).then((r) => (r.results ?? []).map((x) => normSearchItem(x, 'tv'))));
        items = (await Promise.all(jobs)).flat().sort((a, b) => b.meta.popularity - a.meta.popularity);
      }
      return items.slice(0, 20);
    },

    async details(id, kind, { refresh = false } = {}) {
      if (kind !== 'movie' && kind !== 'tv') throw new ProviderError('tmdb', 'Tipo de produção inválido.', { code: 'not_found' });
      const d = await call(`/${kind}/${id}`, { append_to_response: 'credits,external_ids' }, { ttl: ttl.details, refresh });
      let overview = d.overview || '';
      let tagline = d.tagline || null;
      const origin = { primary: 'tmdb', ids: { tmdb: 'tmdb' } };
      if (!overview) {
        // A sinopse em português pode faltar em produções menos conhecidas: usamos a em inglês, sinalizando.
        const en = await call(`/${kind}/${id}`, {}, { ttl: ttl.details, refresh, lang: 'en-US' }).catch(() => null);
        if (en?.overview) {
          overview = en.overview;
          origin.overview = 'tmdb:en-US';
        }
        tagline ||= en?.tagline || null;
      }
      const crew = d.credits?.crew ?? [];
      const directors = [];
      const seen = new Set();
      const addPerson = (p, role) => {
        if (!p?.name || seen.has(`${p.id}:${role}`)) return;
        seen.add(`${p.id}:${role}`);
        directors.push({ name: p.name, id: p.id ?? null, role });
      };
      if (kind === 'tv') (d.created_by ?? []).forEach((p) => addPerson(p, 'Criação'));
      crew.filter((c) => c.job === 'Director').slice(0, 4).forEach((p) => addPerson(p, 'Direção'));

      const imdb = d.imdb_id || d.external_ids?.imdb_id || null;
      const countries =
        kind === 'movie'
          ? (d.production_countries ?? []).map((c) => region(c.iso_3166_1))
          : [...new Set([...(d.origin_country ?? []), ...(d.production_countries ?? []).map((c) => c.iso_3166_1)])].map(region);

      return {
        kind,
        title: d.title || d.name || d.original_title || d.original_name,
        originalTitle: d.original_title || d.original_name || null,
        year: yearOf(d.release_date || d.first_air_date),
        tagline,
        overview,
        posterRef: img(d.poster_path),
        backdropRef: img(d.backdrop_path),
        runtime: kind === 'movie' ? d.runtime || null : d.episode_run_time?.[0] || d.last_episode_to_air?.runtime || null,
        originalLanguage: d.original_language ? language(d.original_language) : null,
        genres: (d.genres ?? []).map((g) => g.name),
        countries,
        directors,
        cast: (d.credits?.cast ?? []).slice(0, 12).map((c) => ({ name: c.name, id: c.id, character: c.character || null })),
        seasons: kind === 'tv' ? d.number_of_seasons ?? null : null,
        episodes: kind === 'tv' ? d.number_of_episodes ?? null : null,
        seasonList: kind === 'tv'
          ? (d.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ number: s.season_number, name: s.name, episodes: s.episode_count, airDate: s.air_date || null }))
          : [],
        ids: { tmdb: d.id, imdb: imdb || null, tvmaze: null, wikidata: null },
        externalScore: d.vote_count > 0 ? d.vote_average : null,
        externalVotes: d.vote_count > 0 ? d.vote_count : null,
        extra: {
          tmdb: {
            status: d.status ?? null,
            homepage: d.homepage || null,
            companies: (d.production_companies ?? []).slice(0, 5).map((c) => c.name),
          },
        },
        origin,
        source: 'tmdb',
      };
    },

    /** Resolve um identificador externo (IMDb) para um registro do TMDB. */
    async find(externalId, source = 'imdb_id', { refresh = false } = {}) {
      const r = await call(`/find/${encodeURIComponent(externalId)}`, { external_source: source }, { ttl: ttl.details, refresh });
      if (r.movie_results?.[0]) return { kind: 'movie', id: String(r.movie_results[0].id) };
      if (r.tv_results?.[0]) return { kind: 'tv', id: String(r.tv_results[0].id) };
      return null;
    },

    /** Obras de uma pessoa (para escolher a produção certa depois de achar o diretor/ator). */
    async personCredits(id) {
      const r = await call(`/person/${encodeURIComponent(id)}/combined_credits`, {}, { ttl: ttl.details });
      const map = new Map();
      for (const c of [...(r.cast ?? []), ...(r.crew ?? [])]) {
        if (c.media_type !== 'movie' && c.media_type !== 'tv') continue;
        const key = `${c.media_type}:${c.id}`;
        if (!map.has(key)) map.set(key, normSearchItem(c, c.media_type));
      }
      return [...map.values()].sort((a, b) => b.meta.popularity - a.meta.popularity).slice(0, 40);
    },
  };
}
