// Reviews: a ficha de avaliação de cada integrante. Nota de 1 a 10 (meias-estrelas) + comentário opcional.
import { HttpError, notFound, forbidden } from '../http.js';
import { Fields } from '../validate.js';
import { titleBrief, normText } from '../services/catalog.js';
import { asInt, clampInt } from './util.js';

const SORTS = {
  recent: 'date DESC, r.id DESC',
  best: 'r.rating DESC, date DESC',
  worst: 'r.rating ASC, date DESC',
  title: 't.search_text ASC, r.id DESC',
};

export default function register(router, app) {
  const { db } = app;

  const shape = (r) => ({
    id: r.id,
    titleId: r.title_id,
    title: titleBrief({ id: r.title_id, kind: r.kind, title: r.title, original_title: r.original_title, year: r.year, poster_ref: r.poster_ref, genres: r.genres, directors: r.directors, runtime: r.runtime }),
    memberId: r.member_id,
    sessionId: r.session_id,
    rating: r.rating,
    body: r.body,
    wouldRewatch: r.would_rewatch === null ? null : !!r.would_rewatch,
    date: r.date,
    createdAt: r.created_at.replace(' ', 'T') + 'Z',
    updatedAt: r.updated_at.replace(' ', 'T') + 'Z',
  });

  const SELECT = `SELECT r.*, COALESCE(s.on_date, substr(r.created_at, 1, 10)) AS date, t.kind, t.title, t.original_title, t.year, t.poster_ref, t.genres, t.directors, t.runtime
      FROM reviews r JOIN titles t ON t.id = r.title_id LEFT JOIN sessions s ON s.id = r.session_id`;

  router.get('/api/reviews', (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];
    const memberId = asInt(q.get('member'));
    const titleId = asInt(q.get('title'));
    const text = (q.get('q') ?? '').trim().slice(0, 100);
    const min = Number(q.get('min_rating'));
    if (memberId) { where.push('r.member_id = ?'); params.push(memberId); }
    if (titleId) { where.push('r.title_id = ?'); params.push(titleId); }
    if (Number.isFinite(min) && min > 0) { where.push('r.rating >= ?'); params.push(min * 2); }
    if (text) {
      const like = `%${text.toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
      where.push("(lower(COALESCE(r.body, '')) LIKE ? ESCAPE '\\' OR t.search_text LIKE ?)");
      params.push(like, `%${normText(text)}%`);
    }
    if (q.get('only_comments') === '1') where.push("r.body IS NOT NULL AND r.body <> ''");
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const order = SORTS[q.get('sort')] ?? SORTS.recent;
    const total = db.get(`SELECT COUNT(*) AS n FROM reviews r JOIN titles t ON t.id = r.title_id ${w}`, ...params).n;
    const rows = db.all(`${SELECT} ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, clampInt(q.get('limit'), { min: 1, max: 200, def: 30 }), clampInt(q.get('offset'), { min: 0, max: 100000, def: 0 }));
    return { total, items: rows.map(shape) };
  });

  const reviewFields = (body) => {
    const f = new Fields(body);
    f.int('rating', { label: 'A nota', required: true, min: 1, max: 10 });
    f.text('body', { label: 'O comentário', max: 2000 });
    f.bool('wouldRewatch');
    return f;
  };

  router.post('/api/reviews', async (ctx) => {
    const body = await ctx.body();
    const f = reviewFields(body);
    f.int('titleId', { label: 'A fita', required: true, min: 1 });
    f.int('sessionId', { label: 'A sessão', min: 1 });
    const v = f.done();
    if (!db.get('SELECT 1 FROM titles WHERE id = ?', v.titleId)) throw notFound('Esta fita não está na estante.');
    if (v.sessionId) {
      const s = db.get('SELECT title_id FROM sessions WHERE id = ?', v.sessionId);
      if (!s || s.title_id !== v.titleId) throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { sessionId: 'Essa sessão não é desta fita.' });
      if (!db.get('SELECT 1 FROM session_members WHERE session_id = ? AND member_id = ?', v.sessionId, ctx.member.id)) {
        throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { sessionId: 'Você não participou dessa sessão.' });
      }
    }
    const existing = db.get(
      'SELECT id FROM reviews WHERE member_id = ? AND title_id = ? AND COALESCE(session_id, 0) = COALESCE(?, 0)', ctx.member.id, v.titleId, v.sessionId);
    let id;
    if (existing) {
      db.run("UPDATE reviews SET rating = ?, body = ?, would_rewatch = ?, updated_at = datetime('now') WHERE id = ?", v.rating, v.body, v.wouldRewatch, existing.id);
      id = existing.id;
    } else {
      id = db.run('INSERT INTO reviews (title_id, member_id, session_id, rating, body, would_rewatch) VALUES (?, ?, ?, ?, ?, ?)', v.titleId, ctx.member.id, v.sessionId, v.rating, v.body, v.wouldRewatch).id;
    }
    ctx.status = existing ? 200 : 201;
    return { review: shape(db.get(`${SELECT} WHERE r.id = ?`, id)), created: !existing };
  });

  router.patch('/api/reviews/:id', async (ctx) => {
    const row = db.get('SELECT * FROM reviews WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Avaliação não encontrada.');
    if (row.member_id !== ctx.member.id) throw forbidden('Só a autora ou o autor pode editar esta avaliação.');
    const v = reviewFields(await ctx.body()).done();
    db.run("UPDATE reviews SET rating = ?, body = ?, would_rewatch = ?, updated_at = datetime('now') WHERE id = ?", v.rating, v.body, v.wouldRewatch, row.id);
    return { review: shape(db.get(`${SELECT} WHERE r.id = ?`, row.id)) };
  });

  router.delete('/api/reviews/:id', (ctx) => {
    const row = db.get('SELECT * FROM reviews WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Avaliação não encontrada.');
    if (row.member_id !== ctx.member.id) throw forbidden('Só a autora ou o autor pode remover esta avaliação.');
    db.run('DELETE FROM reviews WHERE id = ?', row.id);
    return { ok: true };
  });
}
