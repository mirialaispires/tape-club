// Catálogo: listagem, ficha, cadastro (importado ou manual), sincronização, remoção e capa enviada.
import { createHash } from 'node:crypto';
import { writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { HttpError, notFound, forbidden, readBody } from '../http.js';
import { Fields } from '../validate.js';
import { insertTitle, updateFromDraft, manualDraft, serializeTitle, titleBrief } from '../services/catalog.js';
import { listTitles, getTitleRow, SORTS, STATUSES } from '../services/titleQuery.js';
import { latestOpinions, analyzeTitle } from '../services/insights.js';
import { canonicalGenres } from '../providers/genres.js';
import { providerHttpError, asInt, clampInt } from './util.js';

const UPLOAD_REF = /^upload:\/media\/[a-f0-9]{32}\.(jpg|png|webp)$/;

function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

export default function register(router, app) {
  const { db, providers, config } = app;
  const thisYear = new Date().getFullYear();

  async function manualFields(body) {
    const f = new Fields(body);
    f.oneOf('kind', ['movie', 'tv'], { label: 'O tipo', required: true });
    f.str('title', { label: 'O título', required: true, max: 200 });
    f.str('originalTitle', { label: 'O título original', max: 200 });
    f.int('year', { label: 'O ano', min: 1870, max: thisYear + 6 });
    f.list('directors', { label: 'Direção' });
    f.list('genres', { label: 'Gêneros', maxItems: 12 });
    f.list('countries', { label: 'Países', maxItems: 8 });
    f.str('originalLanguage', { label: 'O idioma original', max: 40 });
    f.int('runtime', { label: 'A duração', min: 1, max: 1500 });
    f.text('overview', { label: 'A sinopse', max: 4000 });
    f.int('seasons', { label: 'As temporadas', min: 1, max: 300 });
    f.int('episodes', { label: 'Os episódios', min: 1, max: 20000 });
    f.str('posterRef', { label: 'A capa', max: 80 });
    const v = f.done();
    if (v.posterRef) {
      if (!UPLOAD_REF.test(v.posterRef)) throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { posterRef: 'Capa inválida. Envie a imagem de novo.' });
      await access(path.join(config.uploadsDir, v.posterRef.split('/').pop())).catch(() => {
        throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { posterRef: 'A imagem enviada não foi encontrada. Envie de novo.' });
      });
    }
    v.genres = canonicalGenres(v.genres);
    return v;
  }

  router.get('/api/titles', (ctx) => {
    const q = ctx.query;
    const f = new Fields({ q: q.get('q'), genre: q.get('genre'), kind: q.get('kind'), status: q.get('status'), sort: q.get('sort') });
    f.str('q', { max: 100 });
    f.str('genre', { max: 40 });
    f.oneOf('kind', ['movie', 'tv']);
    f.oneOf('status', STATUSES);
    f.oneOf('sort', Object.keys(SORTS));
    const v = f.done();
    const minStars = Number(q.get('min_rating'));
    return listTitles(db, {
      ...v,
      yearFrom: asInt(q.get('year_from')),
      yearTo: asInt(q.get('year_to')),
      watchedBy: asInt(q.get('watched_by')),
      favorite: q.get('favorite') === '1',
      minRating: Number.isFinite(minStars) && minStars > 0 ? minStars * 2 : null,
      limit: clampInt(q.get('limit'), { min: 1, max: 200, def: 60 }),
      offset: clampInt(q.get('offset'), { min: 0, max: 100000, def: 0 }),
    }, ctx.member.id);
  });

  router.get('/api/titles/facets', () => {
    const genres = db.all(`SELECT value AS name, COUNT(*) AS count FROM titles, json_each(titles.genres) GROUP BY value ORDER BY count DESC, name`);
    const years = db.get('SELECT MIN(year) AS min, MAX(year) AS max FROM titles');
    const kinds = db.all('SELECT kind, COUNT(*) AS count FROM titles GROUP BY kind');
    return { genres, years, kinds, total: db.get('SELECT COUNT(*) AS n FROM titles').n };
  });

  router.get('/api/titles/:id', (ctx) => {
    const id = asInt(ctx.params.id);
    const row = id && getTitleRow(db, id, ctx.member.id);
    if (!row) throw notFound('Esta fita não está na estante.');
    const members = db.all('SELECT id, name, color FROM members ORDER BY id');
    const sessions = db.all('SELECT * FROM sessions WHERE title_id = ? ORDER BY on_date DESC, id DESC', id);
    const attendees = db.all('SELECT sm.session_id, sm.member_id FROM session_members sm JOIN sessions s ON s.id = sm.session_id WHERE s.title_id = ?', id);
    const reviews = db.all(
      `SELECT r.*, COALESCE(s.on_date, substr(r.created_at, 1, 10)) AS date
         FROM reviews r LEFT JOIN sessions s ON s.id = r.session_id
        WHERE r.title_id = ? ORDER BY date DESC, r.id DESC`, id);
    const opinions = latestOpinions(reviews.map((r) => ({ id: r.id, title_id: r.title_id, member_id: r.member_id, rating: r.rating, date: r.date })));
    const mine = opinions.get(id) ?? new Map();
    const indicator = analyzeTitle(mine, { minRaters: members.length < 2 ? 1 : 2 });
    const ts = serializeTitle(row, {
      avgRating: row.avg_rating === null ? null : Math.round(row.avg_rating * 100) / 100,
      nRatings: row.n_ratings,
      status: row.status,
      myRating: row.my_rating,
      favorite: !!row.my_fav,
      nFavs: row.n_favs,
      favoritedBy: db.all('SELECT member_id FROM favorites WHERE title_id = ? ORDER BY created_at', id).map((r) => r.member_id),
    });
    return {
      title: ts,
      sessions: sessions.map((s) => ({
        id: s.id, onDate: s.on_date, status: s.status, rewatch: !!s.rewatch, note: s.note, createdBy: s.created_by,
        attendees: attendees.filter((a) => a.session_id === s.id).map((a) => a.member_id),
      })),
      reviews: reviews.map((r) => ({
        id: r.id, memberId: r.member_id, sessionId: r.session_id, rating: r.rating, body: r.body,
        wouldRewatch: r.would_rewatch === null ? null : !!r.would_rewatch, date: r.date,
        createdAt: r.created_at.replace(' ', 'T') + 'Z', updatedAt: r.updated_at.replace(' ', 'T') + 'Z',
      })),
      opinions: Object.fromEntries(mine),
      indicator,
      members,
      canEdit: row.source === 'manual' && row.added_by === ctx.member.id,
      canDelete: row.added_by === null || row.added_by === ctx.member.id,
    };
  });

  router.post('/api/titles', async (ctx) => {
    const body = await ctx.body();
    let id;
    if (body.manual) {
      const v = await manualFields(body.manual);
      const dup = db.get(
        `SELECT id, title FROM titles WHERE source = 'manual' AND kind = ? AND lower(title) = lower(?) AND COALESCE(year, 0) = COALESCE(?, 0)`,
        v.kind, v.title, v.year);
      if (dup) throw new HttpError(409, 'duplicate', `“${dup.title}” já foi cadastrado manualmente.`, { existingId: dup.id });
      id = insertTitle(db, manualDraft(v), ctx.member.id);
    } else if (body.draft) {
      const f = new Fields(body.draft);
      f.oneOf('provider', ['tmdb', 'tvmaze', 'wikidata'], { label: 'A fonte', required: true });
      f.str('id', { label: 'O identificador', required: true, max: 40 });
      f.oneOf('kind', ['movie', 'tv']);
      const ref = f.done();
      // O servidor busca os metadados de novo (do cache): o cliente nunca dita o conteúdo importado.
      let draft;
      try {
        ({ draft } = await providers.buildDraft(ref));
      } catch (err) {
        throw providerHttpError(err);
      }
      id = insertTitle(db, draft, ctx.member.id);
    } else {
      throw new HttpError(400, 'bad_request', 'Informe uma produção importada ou um cadastro manual.');
    }
    ctx.status = 201;
    const row = getTitleRow(db, id, ctx.member.id);
    return { id, title: titleBrief(row) };
  });

  router.patch('/api/titles/:id', async (ctx) => {
    const row = db.get('SELECT * FROM titles WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Esta fita não está na estante.');
    if (row.source !== 'manual') throw new HttpError(409, 'not_manual', 'Fitas importadas se atualizam pela sincronização com a fonte.');
    if (row.added_by !== ctx.member.id) throw forbidden('Só quem cadastrou esta fita pode editá-la.');
    const v = await manualFields(await ctx.body());
    db.tx(() => {
      updateFromDraft(db, row.id, manualDraft(v));
      db.run('UPDATE titles SET synced_at = NULL WHERE id = ?', row.id); // cadastro manual nunca "sincroniza"
    });
    return { ok: true };
  });

  router.post('/api/titles/:id/sync', async (ctx) => {
    const row = db.get('SELECT * FROM titles WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Esta fita não está na estante.');
    const ref = row.tmdb_id
      ? { provider: 'tmdb', id: String(row.tmdb_id), kind: row.kind }
      : row.tvmaze_id
        ? { provider: 'tvmaze', id: String(row.tvmaze_id) }
        : row.wikidata_id
          ? { provider: 'wikidata', id: row.wikidata_id }
          : null;
    if (!ref) throw new HttpError(409, 'not_syncable', 'Cadastros manuais não têm fonte para sincronizar.');
    let draft;
    try {
      ({ draft } = await providers.buildDraft(ref, { refresh: true }));
    } catch (err) {
      throw providerHttpError(err);
    }
    db.tx(() => updateFromDraft(db, row.id, draft));
    return { ok: true, syncedFrom: draft.source };
  });

  // Favoritar / desfavoritar (por integrante). Corpo: { favorite: true|false }
  router.post('/api/titles/:id/favorite', async (ctx) => {
    const id = asInt(ctx.params.id);
    if (!id || !db.get('SELECT 1 FROM titles WHERE id = ?', id)) throw notFound('Esta fita não está na estante.');
    const body = await ctx.body();
    if (typeof body.favorite !== 'boolean') throw new HttpError(422, 'invalid', 'Informe se a fita é favorita.', { favorite: 'Valor inválido.' });
    if (body.favorite) db.run('INSERT OR IGNORE INTO favorites (member_id, title_id) VALUES (?, ?)', ctx.member.id, id);
    else db.run('DELETE FROM favorites WHERE member_id = ? AND title_id = ?', ctx.member.id, id);
    return { favorite: body.favorite, nFavs: db.get('SELECT COUNT(*) AS n FROM favorites WHERE title_id = ?', id).n };
  });

  router.delete('/api/titles/:id', (ctx) => {
    const row = db.get('SELECT * FROM titles WHERE id = ?', asInt(ctx.params.id));
    if (!row) throw notFound('Esta fita não está na estante.');
    if (row.added_by !== null && row.added_by !== ctx.member.id) throw forbidden('Só quem cadastrou esta fita pode retirá-la da estante.');
    db.run('DELETE FROM titles WHERE id = ?', row.id); // sessões e reviews saem junto (ON DELETE CASCADE)
    return { ok: true };
  });

  // Capa enviada à mão (o navegador já reduz a imagem antes de enviar).
  router.post('/api/uploads/poster', async (ctx) => {
    const buf = await readBody(ctx.req, config.limits.upload);
    const ext = sniffImage(buf);
    if (!ext) throw new HttpError(415, 'bad_image', 'Envie uma imagem JPG, PNG ou WebP.');
    const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
    await writeFile(path.join(config.uploadsDir, name), buf);
    return { ref: `upload:/media/${name}` };
  });
}
