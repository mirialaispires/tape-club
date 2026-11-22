// Sessões: cada exibição de um título pelo clube (data, quem assistiu, situação e, opcionalmente, a avaliação de quem registra).
import { HttpError, notFound, forbidden } from '../http.js';
import { Fields, todayLocal } from '../validate.js';
import { titleBrief } from '../services/catalog.js';
import { asInt, clampInt } from './util.js';

const STATUSES = ['planned', 'watching', 'watched', 'abandoned'];

export default function register(router, app) {
  const { db } = app;

  const shape = (rows) => {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const marks = ids.map(() => '?').join(',');
    const att = db.all(`SELECT session_id, member_id FROM session_members WHERE session_id IN (${marks})`, ...ids);
    const revs = db.all(`SELECT id, session_id, member_id, rating FROM reviews WHERE session_id IN (${marks})`, ...ids);
    return rows.map((r) => ({
      id: r.id,
      titleId: r.title_id,
      title: titleBrief({ id: r.title_id, kind: r.kind, title: r.title, original_title: r.original_title, year: r.year, poster_ref: r.poster_ref, genres: r.genres, directors: r.directors, runtime: r.runtime }),
      onDate: r.on_date,
      status: r.status,
      rewatch: !!r.rewatch,
      note: r.note,
      createdBy: r.created_by,
      attendees: att.filter((a) => a.session_id === r.id).map((a) => a.member_id),
      reviews: revs.filter((x) => x.session_id === r.id).map((x) => ({ id: x.id, memberId: x.member_id, rating: x.rating })),
    }));
  };

  const fetchOne = (id) =>
    shape(db.all(
      `SELECT s.*, t.kind, t.title, t.original_title, t.year, t.poster_ref, t.genres, t.directors, t.runtime
         FROM sessions s JOIN titles t ON t.id = s.title_id WHERE s.id = ?`, id))[0];

  router.get('/api/sessions', (ctx) => {
    const q = ctx.query;
    const where = [];
    const params = [];
    const titleId = asInt(q.get('title'));
    const memberId = asInt(q.get('member'));
    const status = q.get('status');
    const year = asInt(q.get('year'));
    if (titleId) { where.push('s.title_id = ?'); params.push(titleId); }
    if (memberId) { where.push('EXISTS (SELECT 1 FROM session_members sm WHERE sm.session_id = s.id AND sm.member_id = ?)'); params.push(memberId); }
    if (STATUSES.includes(status)) { where.push('s.status = ?'); params.push(status); }
    if (year) { where.push("substr(s.on_date, 1, 4) = ?"); params.push(String(year)); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = db.get(`SELECT COUNT(*) AS n FROM sessions s ${w}`, ...params).n;
    const rows = db.all(
      `SELECT s.*, t.kind, t.title, t.original_title, t.year, t.poster_ref, t.genres, t.directors, t.runtime
         FROM sessions s JOIN titles t ON t.id = s.title_id ${w}
        ORDER BY s.on_date DESC, s.id DESC LIMIT ? OFFSET ?`,
      ...params, clampInt(q.get('limit'), { min: 1, max: 200, def: 40 }), clampInt(q.get('offset'), { min: 0, max: 100000, def: 0 }));
    const years = db.all("SELECT DISTINCT substr(on_date, 1, 4) AS y FROM sessions ORDER BY y DESC").map((r) => Number(r.y));
    return { total, items: shape(rows), years };
  });

  function sessionFields(body, { partial = false } = {}) {
    const f = new Fields(body);
    if (!partial) f.int('titleId', { label: 'A fita', required: true, min: 1 });
    f.date('onDate', { label: 'A data', required: !partial });
    f.oneOf('status', STATUSES, { label: 'A situação' });
    f.text('note', { label: 'A anotação', max: 1000 });
    const v = f.done();
    let attendees = null;
    if (body.attendees !== undefined) {
      if (!Array.isArray(body.attendees) || body.attendees.some((x) => !Number.isInteger(x))) {
        throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { attendees: 'Lista de presença inválida.' });
      }
      attendees = [...new Set(body.attendees)];
      const known = new Set(db.all('SELECT id FROM members').map((m) => m.id));
      if (attendees.some((id) => !known.has(id))) throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { attendees: 'Há integrantes desconhecidos na lista.' });
      if (!attendees.length) throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { attendees: 'Marque pelo menos uma pessoa na sessão.' });
    }
    return { v, attendees };
  }

  const checkDate = (status, onDate) => {
    if ((status === 'watched' || status === 'watching' || status === 'abandoned') && onDate > todayLocal()) {
      throw new HttpError(422, 'invalid', 'Confira os campos destacados.', {
        onDate: 'Uma sessão já realizada não pode ter data no futuro. Para o que vem aí, use “Na fila”.',
      });
    }
  };

  router.post('/api/sessions', async (ctx) => {
    const body = await ctx.body();
    const { v, attendees: given } = sessionFields(body);
    const status = v.status ?? 'watched';
    checkDate(status, v.onDate);
    const attendees = given ?? [ctx.member.id];

    let review = null;
    if (body.review) {
      const rf = new Fields(body.review);
      rf.int('rating', { label: 'A nota', required: true, min: 1, max: 10 });
      rf.text('body', { label: 'O comentário', max: 2000 });
      rf.bool('wouldRewatch');
      review = rf.done();
      if (!attendees.includes(ctx.member.id)) {
        throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { review: 'Você só pode avaliar uma sessão da qual participou.' });
      }
    }
    if (!db.get('SELECT 1 FROM titles WHERE id = ?', v.titleId)) throw notFound('Esta fita não está na estante.');

    const id = db.tx(() => {
      const already = db.get("SELECT 1 FROM sessions WHERE title_id = ? AND status = 'watched'", v.titleId);
      const rewatch = already && (status === 'watched' || status === 'watching') ? 1 : 0;
      const { id: sid } = db.run('INSERT INTO sessions (title_id, on_date, status, rewatch, note, created_by) VALUES (?, ?, ?, ?, ?, ?)', v.titleId, v.onDate, status, rewatch, v.note, ctx.member.id);
      for (const m of attendees) db.run('INSERT INTO session_members (session_id, member_id) VALUES (?, ?)', sid, m);
      if (review) {
        db.run(
          `INSERT INTO reviews (title_id, member_id, session_id, rating, body, would_rewatch) VALUES (?, ?, ?, ?, ?, ?)`,
          v.titleId, ctx.member.id, sid, review.rating, review.body, review.wouldRewatch);
      }
      return sid;
    });
    ctx.status = 201;
    return { session: fetchOne(id) };
  });

  router.patch('/api/sessions/:id', async (ctx) => {
    const row = db.get('SELECT * FROM sessions WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Sessão não encontrada.');
    if (row.created_by !== ctx.member.id) throw forbidden('Só quem registrou a sessão pode alterá-la.');
    const { v, attendees } = sessionFields(await ctx.body(), { partial: true });
    const status = v.status ?? row.status;
    const onDate = v.onDate ?? row.on_date;
    checkDate(status, onDate);
    db.tx(() => {
      db.run('UPDATE sessions SET on_date = ?, status = ?, note = ? WHERE id = ?', onDate, status, v.note !== null ? v.note : row.note, row.id);
      if (attendees) {
        db.run('DELETE FROM session_members WHERE session_id = ?', row.id);
        for (const m of attendees) db.run('INSERT INTO session_members (session_id, member_id) VALUES (?, ?)', row.id, m);
      }
    });
    return { session: fetchOne(row.id) };
  });

  router.delete('/api/sessions/:id', (ctx) => {
    const row = db.get('SELECT * FROM sessions WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Sessão não encontrada.');
    if (row.created_by !== ctx.member.id) throw forbidden('Só quem registrou a sessão pode removê-la.');
    db.tx(() => {
      // As avaliações sobrevivem, soltas da sessão — a menos que isso gere duplicata.
      db.run('UPDATE OR IGNORE reviews SET session_id = NULL WHERE session_id = ?', row.id);
      db.run('DELETE FROM reviews WHERE session_id = ?', row.id);
      db.run('DELETE FROM sessions WHERE id = ?', row.id);
    });
    return { ok: true };
  });
}
