// Operações de catálogo: serialização, busca textual, deduplicação por identificadores e gravação.
import { HttpError } from '../http.js';

const J = (s, d = []) => {
  try { return JSON.parse(s); } catch { return d; }
};
const iso = (s) => (s ? s.replace(' ', 'T') + 'Z' : null);

export const catalogNo = (r) => `TC-${String(r.id).padStart(4, '0')}-${r.kind === 'tv' ? 'S' : 'F'}`;

export function normText(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchTextOf(d) {
  return normText([d.title, d.originalTitle, d.year, ...(d.directors ?? []).map((x) => x.name), ...(d.cast ?? []).map((x) => x.name)].join(' '));
}

export function serializeTitle(r, extra = {}) {
  return {
    id: r.id,
    catalogNo: catalogNo(r),
    kind: r.kind,
    title: r.title,
    originalTitle: r.original_title,
    year: r.year,
    tagline: r.tagline,
    overview: r.overview,
    posterRef: r.poster_ref,
    backdropRef: r.backdrop_ref,
    runtime: r.runtime,
    originalLanguage: r.original_language,
    genres: J(r.genres),
    countries: J(r.countries),
    directors: J(r.directors),
    cast: J(r.cast),
    seasons: r.seasons,
    episodes: r.episodes,
    seasonList: J(r.season_list),
    ids: { tmdb: r.tmdb_id, imdb: r.imdb_id, tvmaze: r.tvmaze_id, wikidata: r.wikidata_id },
    externalScore: r.external_score,
    externalVotes: r.external_votes,
    extra: J(r.extra, {}),
    origin: J(r.origin, {}),
    source: r.source,
    addedBy: r.added_by,
    addedAt: iso(r.added_at),
    syncedAt: iso(r.synced_at),
    ...extra,
  };
}

/** Versão enxuta para listas e cartões. */
export function titleBrief(r) {
  return {
    id: r.id,
    catalogNo: catalogNo(r),
    kind: r.kind,
    title: r.title,
    originalTitle: r.original_title,
    year: r.year,
    posterRef: r.poster_ref,
    genres: J(r.genres),
    directors: J(r.directors).map((d) => d.name),
    runtime: r.runtime,
  };
}

export function findExisting(db, d) {
  const conds = [];
  const params = [];
  if (d.ids?.tmdb) { conds.push('(kind = ? AND tmdb_id = ?)'); params.push(d.kind, d.ids.tmdb); }
  if (d.ids?.imdb) { conds.push('imdb_id = ?'); params.push(d.ids.imdb); }
  if (d.ids?.tvmaze) { conds.push('tvmaze_id = ?'); params.push(d.ids.tvmaze); }
  if (d.ids?.wikidata) { conds.push('wikidata_id = ?'); params.push(d.ids.wikidata); }
  if (!conds.length) return null;
  return db.get(`SELECT id, title, year, kind FROM titles WHERE ${conds.join(' OR ')} LIMIT 1`, ...params);
}

const COLS = [
  'kind', 'title', 'original_title', 'year', 'tagline', 'overview', 'poster_ref', 'backdrop_ref', 'runtime',
  'original_language', 'genres', 'countries', 'directors', '"cast"', 'seasons', 'episodes', 'season_list',
  'tmdb_id', 'imdb_id', 'tvmaze_id', 'wikidata_id', 'external_score', 'external_votes', 'extra', 'origin', 'source', 'search_text',
];

const rowValues = (d) => [
  d.kind, d.title, d.originalTitle ?? null, d.year ?? null, d.tagline ?? null, d.overview ?? null,
  d.posterRef ?? null, d.backdropRef ?? null, d.runtime ?? null, d.originalLanguage ?? null,
  JSON.stringify(d.genres ?? []), JSON.stringify(d.countries ?? []), JSON.stringify(d.directors ?? []),
  JSON.stringify(d.cast ?? []), d.seasons ?? null, d.episodes ?? null, JSON.stringify(d.seasonList ?? []),
  d.ids?.tmdb ?? null, d.ids?.imdb ?? null, d.ids?.tvmaze ?? null, d.ids?.wikidata ?? null,
  d.externalScore ?? null, d.externalVotes ?? null, JSON.stringify(d.extra ?? {}), JSON.stringify(d.origin ?? {}),
  d.source, searchTextOf(d),
];

export function insertTitle(db, d, memberId) {
  const dup = findExisting(db, d);
  if (dup) throw new HttpError(409, 'duplicate', `“${dup.title}” já está na estante.`, { existingId: dup.id });
  const { id } = db.run(
    `INSERT INTO titles (${COLS.join(',')}, added_by, synced_at)
     VALUES (${COLS.map(() => '?').join(',')}, ?, ${d.source === 'manual' ? 'NULL' : "datetime('now')"})`,
    ...rowValues(d), memberId,
  );
  return id;
}

/** Atualiza metadados vindos da fonte, preservando identificadores já conhecidos. */
export function updateFromDraft(db, id, d) {
  const sets = COLS.map((c) => (c.endsWith('_id') ? `${c} = COALESCE(?, ${c})` : `${c} = ?`));
  try {
    db.run(`UPDATE titles SET ${sets.join(', ')}, synced_at = datetime('now') WHERE id = ?`, ...rowValues(d), id);
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) {
      throw new HttpError(409, 'duplicate', 'Outro título da estante já usa um dos identificadores desta fonte.');
    }
    throw err;
  }
}

export function manualDraft(f) {
  return {
    kind: f.kind,
    title: f.title,
    originalTitle: f.originalTitle,
    year: f.year,
    tagline: null,
    overview: f.overview,
    posterRef: f.posterRef,
    backdropRef: null,
    runtime: f.runtime,
    originalLanguage: f.originalLanguage,
    genres: f.genres,
    countries: f.countries,
    directors: f.directors.map((name) => ({ name, id: null, role: f.kind === 'tv' ? 'Criação' : 'Direção' })),
    cast: [],
    seasons: f.kind === 'tv' ? f.seasons : null,
    episodes: f.kind === 'tv' ? f.episodes : null,
    seasonList: [],
    ids: { tmdb: null, imdb: null, tvmaze: null, wikidata: null },
    externalScore: null,
    externalVotes: null,
    extra: {},
    origin: { primary: 'manual' },
    source: 'manual',
  };
}
