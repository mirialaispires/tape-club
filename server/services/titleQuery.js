// Consulta de títulos com agregados (nota média, status derivado, última sessão).
import { normText, titleBrief } from './catalog.js';

const CTE = `
  WITH op AS (SELECT title_id, AVG(rating) AS avg, COUNT(*) AS n FROM current_opinions GROUP BY title_id),
  fav AS (SELECT title_id, COUNT(*) AS n FROM favorites GROUP BY title_id),
  ss AS (
    SELECT title_id,
      SUM(status = 'watched') AS watched, SUM(status = 'watching') AS watching,
      SUM(status = 'planned') AS planned, SUM(status = 'abandoned') AS abandoned, COUNT(*) AS total,
      MAX(CASE WHEN status = 'watched' THEN on_date END) AS last_watched
    FROM sessions GROUP BY title_id
  )`;
const FROM = `
  FROM (
    SELECT t.*, op.avg AS avg_rating, COALESCE(op.n, 0) AS n_ratings, COALESCE(ss.total, 0) AS n_sessions,
      ss.last_watched, mine.rating AS my_rating,
      COALESCE(fav.n, 0) AS n_favs, (myf.member_id IS NOT NULL) AS my_fav,
      CASE WHEN ss.watched > 0 THEN 'watched' WHEN ss.watching > 0 THEN 'watching'
           WHEN ss.planned > 0 THEN 'planned' WHEN ss.abandoned > 0 THEN 'abandoned' ELSE 'none' END AS status
    FROM titles t
    LEFT JOIN op ON op.title_id = t.id
    LEFT JOIN ss ON ss.title_id = t.id
    LEFT JOIN fav ON fav.title_id = t.id
    LEFT JOIN current_opinions mine ON mine.title_id = t.id AND mine.member_id = ?
    LEFT JOIN favorites myf ON myf.title_id = t.id AND myf.member_id = ?
  ) x`;

export const SORTS = {
  recent: 'x.added_at DESC, x.id DESC',
  title: 'x.search_text ASC, x.id ASC',
  year: 'x.year IS NULL, x.year DESC, x.id DESC',
  rating: 'x.avg_rating IS NULL, x.avg_rating DESC, x.n_ratings DESC, x.id DESC',
  watched: 'x.last_watched IS NULL, x.last_watched DESC, x.id DESC',
};
export const STATUSES = ['watched', 'watching', 'planned', 'abandoned', 'none'];

export function cardOf(r) {
  return {
    ...titleBrief(r),
    overview: r.overview,
    source: r.source,
    addedAt: r.added_at ? r.added_at.replace(' ', 'T') + 'Z' : null,
    avgRating: r.avg_rating === null ? null : Math.round(r.avg_rating * 100) / 100,
    nRatings: r.n_ratings,
    nSessions: r.n_sessions,
    lastWatched: r.last_watched,
    myRating: r.my_rating,
    favorite: !!r.my_fav,
    nFavs: r.n_favs,
    status: r.status,
  };
}

export function listTitles(db, f = {}, memberId = null) {
  const where = [];
  const params = [];
  if (f.q) {
    for (const tok of normText(f.q).split(' ').filter(Boolean).slice(0, 6)) {
      where.push('x.search_text LIKE ?');
      params.push(`%${tok}%`);
    }
  }
  if (f.genre) { where.push('EXISTS (SELECT 1 FROM json_each(x.genres) WHERE value = ?)'); params.push(f.genre); }
  if (f.kind) { where.push('x.kind = ?'); params.push(f.kind); }
  if (f.status) { where.push('x.status = ?'); params.push(f.status); }
  if (f.yearFrom != null) { where.push('x.year >= ?'); params.push(f.yearFrom); }
  if (f.yearTo != null) { where.push('x.year <= ?'); params.push(f.yearTo); }
  if (f.watchedBy != null) {
    where.push("EXISTS (SELECT 1 FROM sessions s JOIN session_members sm ON sm.session_id = s.id WHERE s.title_id = x.id AND s.status = 'watched' AND sm.member_id = ?)");
    params.push(f.watchedBy);
  }
  if (f.favorite) where.push('x.my_fav = 1');
  if (f.minRating != null) { where.push('x.avg_rating >= ?'); params.push(f.minRating); }
  const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const order = SORTS[f.sort] ?? SORTS.recent;
  const total = db.get(`${CTE} SELECT COUNT(*) AS n ${FROM}${w}`, memberId, memberId, ...params).n;
  const rows = db.all(`${CTE} SELECT x.* ${FROM}${w} ORDER BY ${order} LIMIT ? OFFSET ?`, memberId, memberId, ...params, f.limit ?? 60, f.offset ?? 0);
  return { total, items: rows.map(cardOf) };
}

export function getTitleRow(db, id, memberId = null) {
  return db.get(`${CTE} SELECT x.* ${FROM} WHERE x.id = ?`, memberId, memberId, id);
}
