// TVmaze — complemento para séries e episódios. Sem chave. Docs: https://www.tvmaze.com/api
import { ProviderError } from './util.js';
import { canonicalGenres } from './genres.js';

const regionNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const region = (c) => { try { return regionNames.of(c) ?? c; } catch { return c; } };
const https = (u) => (u ? u.replace(/^http:/, 'https:') : null);
const yearOf = (d) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const strip = (html) =>
  String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();

function normShow(show) {
  const poster = https(show.image?.medium || show.image?.original);
  return {
    provider: 'tvmaze',
    id: String(show.id),
    kind: 'tv',
    title: show.name,
    originalTitle: null,
    year: yearOf(show.premiered),
    overview: strip(show.summary),
    poster: poster ? `tvmaze:${poster}` : null,
    ids: { tvmaze: show.id, imdb: show.externals?.imdb ?? null },
    meta: { status: show.status ?? null, network: show.network?.name ?? show.webChannel?.name ?? null },
  };
}

export function createTvmaze({ config, http, cache }) {
  const base = config.tvmaze.base;
  const ttl = config.cacheTtl;

  const get = (path, { ttlMs, refresh = false, nullOn404 = false } = {}) =>
    cache
      .wrap(
        `tvmaze:${path}`,
        ttlMs,
        async () => {
          try {
            return await http.json(base + path, { provider: 'tvmaze', minIntervalMs: 120 }); // limite público: ~20 chamadas/10 s
          } catch (err) {
            if (nullOn404 && err instanceof ProviderError && err.code === 'not_found') return null;
            throw err;
          }
        },
        { refresh },
      )
      .then((r) => r.value);

  return {
    name: 'tvmaze',
    label: 'TVmaze',
    enabled: true,

    async search(query, { type = 'multi' } = {}) {
      if (type === 'movie' || type === 'person') return [];
      const r = await get(`/search/shows?q=${encodeURIComponent(query)}`, { ttlMs: ttl.search });
      return (r ?? []).slice(0, 12).map((x) => normShow(x.show));
    },

    async details(id, { refresh = false } = {}) {
      const s = await get(`/shows/${encodeURIComponent(id)}?embed[]=episodes&embed[]=cast&embed[]=crew`, { ttlMs: ttl.details, refresh });
      const episodes = s._embedded?.episodes ?? [];
      const bySeason = new Map();
      for (const e of episodes) {
        if (!e.season) continue;
        const cur = bySeason.get(e.season) ?? { number: e.season, name: `Temporada ${e.season}`, episodes: 0, airDate: e.airdate || null };
        cur.episodes++;
        if (e.airdate && (!cur.airDate || e.airdate < cur.airDate)) cur.airDate = e.airdate;
        bySeason.set(e.season, cur);
      }
      const seasonList = [...bySeason.values()].sort((a, b) => a.number - b.number);
      const country = s.network?.country?.code || s.webChannel?.country?.code;
      const poster = https(s.image?.original || s.image?.medium);
      return {
        kind: 'tv',
        title: s.name,
        originalTitle: null,
        year: yearOf(s.premiered),
        tagline: null,
        overview: strip(s.summary),
        posterRef: poster ? `tvmaze:${poster}` : null,
        backdropRef: null,
        runtime: s.runtime || s.averageRuntime || null,
        originalLanguage: s.language ?? null,
        genres: canonicalGenres(s.genres),
        countries: country ? [region(country)] : [],
        directors: (s._embedded?.crew ?? [])
          .filter((c) => c.type === 'Creator')
          .slice(0, 4)
          .map((c) => ({ name: c.person.name, id: null, role: 'Criação' })),
        cast: (s._embedded?.cast ?? []).slice(0, 12).map((c) => ({ name: c.person.name, id: null, character: c.character?.name ?? null })),
        seasons: seasonList.length || null,
        episodes: episodes.length || null,
        seasonList,
        ids: { tmdb: null, imdb: s.externals?.imdb ?? null, tvmaze: s.id, wikidata: null },
        externalScore: s.rating?.average ?? null,
        externalVotes: null,
        extra: {
          tvmaze: {
            status: s.status ?? null,
            network: s.network?.name ?? s.webChannel?.name ?? null,
            premiered: s.premiered ?? null,
            ended: s.ended ?? null,
            rating: s.rating?.average ?? null,
            officialSite: https(s.officialSite),
            seasons: seasonList.length || null,
            episodes: episodes.length || null,
          },
        },
        origin: { primary: 'tvmaze', ids: { tvmaze: 'tvmaze', imdb: 'tvmaze' } },
        source: 'tvmaze',
      };
    },

    /** Só aceita IMDb no formato tt1234567 (nada de montar URL com texto livre). */
    async lookupByImdb(imdb, { refresh = false } = {}) {
      if (!/^tt\d{5,12}$/.test(imdb ?? '')) return null;
      const s = await get(`/lookup/shows?imdb=${imdb}`, { ttlMs: ttl.details, refresh, nullOn404: true });
      return s ? normShow(s) : null;
    },
  };
}
