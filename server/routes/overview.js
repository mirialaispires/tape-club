// Páginas de resumo: início (a "fachada") e estatísticas do clube.
import { listTitles, getTitleRow, cardOf } from '../services/titleQuery.js';

const DAY = 86_400_000;

export default function register(router, app) {
  const { db } = app;

  router.get('/api/home', (ctx) => {
    const insights = app.insights();
    const me = ctx.member.id;
    const recent = listTitles(db, { sort: 'recent', limit: 12 }, me).items.map((t) => ({
      ...t,
      isNew: t.addedAt ? Date.now() - Date.parse(t.addedAt) < 7 * DAY : false,
    }));

    const sessionRows = (where, order, limit) =>
      db.all(
        `SELECT s.id, s.title_id, s.on_date, s.status, s.rewatch, s.note,
                t.kind, t.title, t.original_title, t.year, t.poster_ref, t.genres, t.directors, t.runtime
           FROM sessions s JOIN titles t ON t.id = s.title_id WHERE ${where} ORDER BY ${order} LIMIT ${limit}`);
    const att = (ids) => (ids.length ? db.all(`SELECT session_id, member_id FROM session_members WHERE session_id IN (${ids.map(() => '?').join(',')})`, ...ids) : []);
    const shape = (rows) => {
      const a = att(rows.map((r) => r.id));
      return rows.map((r) => ({
        id: r.id, titleId: r.title_id, onDate: r.on_date, status: r.status, rewatch: !!r.rewatch,
        title: { id: r.title_id, kind: r.kind, title: r.title, year: r.year, posterRef: r.poster_ref },
        attendees: a.filter((x) => x.session_id === r.id).map((x) => x.member_id),
      }));
    };
    const lastWatched = shape(sessionRows("s.status = 'watched'", 's.on_date DESC, s.id DESC', 6));
    const queue = shape(sessionRows("s.status IN ('planned', 'watching')", "s.status = 'planned', s.on_date ASC, s.id ASC", 6));

    // "Recomendação do balcão": fita ainda não vista com a melhor nota pública da fonte (mín. 100 votos).
    const rec = db.get(
      `SELECT t.id FROM titles t
        WHERE t.external_score IS NOT NULL AND COALESCE(t.external_votes, 0) >= 100
          AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.title_id = t.id AND s.status IN ('watched', 'watching'))
        ORDER BY t.external_score DESC, t.external_votes DESC LIMIT 1`);
    let recommendation = null;
    if (rec) {
      const row = getTitleRow(db, rec.id, me);
      recommendation = { title: cardOf(row), score: row.external_score, votes: row.external_votes, source: row.source };
    }

    const c = insights.comparison;
    return {
      totals: insights.totals,
      recent,
      lastWatched,
      queue,
      recommendation,
      highlights: {
        collectiveFavorites: c.collectiveFavorites.slice(0, 3),
        divergence: c.divergences[0] ?? null,
        consensus: c.consensus[0] ?? null,
        sintonia: c.sintonia.score,
      },
      lastReturn: lastWatched[0] ?? null,
    };
  });

  router.get('/api/stats', () => {
    const { titleIndicators, ...stats } = app.insights();
    return stats;
  });
}
