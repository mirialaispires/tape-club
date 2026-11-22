// Entrada na locadora: abrir o clube (primeiro integrante), login, logout e gestão de integrantes.
import { HttpError } from '../http.js';
import { Fields } from '../validate.js';
import { hashPassword, verifyPassword, createSessionToken, sessionCookie, clearCookie, checkPassword } from '../auth.js';
import { memberOut } from './util.js';
import { createLimiter } from '../http.js';

export const MEMBER_COLORS = ['#B8322A', '#1F4E8C', '#2F6B4F', '#C98A12', '#6B3F7A', '#B8561E', '#2A6C73', '#7A4B2A', '#8A2F57', '#4B5B2A'];

export default function register(router, app) {
  const { db, config } = app;
  const loginLimiter = createLimiter({ max: 8, windowMs: 10 * 60_000 });
  const setupLimiter = createLimiter({ max: 5, windowMs: 10 * 60_000 });

  const issue = (ctx, member) =>
    ctx.setCookie(sessionCookie(createSessionToken(config.sessionSecret, member), { secure: config.secureCookies }));

  const nextColor = () => {
    const used = new Set(db.all('SELECT color FROM members').map((r) => r.color));
    return MEMBER_COLORS.find((c) => !used.has(c)) ?? MEMBER_COLORS[db.get('SELECT COUNT(*) AS n FROM members').n % MEMBER_COLORS.length];
  };

  const nameFields = (body, required = true) => {
    const f = new Fields(body);
    f.str('name', { label: 'O nome', required, max: 40 });
    return f;
  };

  router.get('/api/session', (ctx) => ({
    setup: db.get('SELECT COUNT(*) AS n FROM members').n === 0,
    member: ctx.member ? memberOut(ctx.member) : null,
    providers: app.providers.describe(),
    imageBase: config.tmdb.imageBase,
  }), { auth: false });

  router.post('/api/setup', async (ctx) => {
    if (!setupLimiter.hit(ctx.ip).ok) throw new HttpError(429, 'rate_limited', 'Muitas tentativas. Aguarde alguns minutos.');
    const body = await ctx.body();
    const f = nameFields(body);
    const pwErr = checkPassword(body.password);
    if (pwErr) f.err('password', pwErr);
    const { name } = f.done();
    const member = db.tx(() => {
      if (db.get('SELECT COUNT(*) AS n FROM members').n > 0) throw new HttpError(409, 'already_setup', 'O clube já foi aberto. Entre com o seu nome e senha.');
      const { id } = db.run('INSERT INTO members (name, color, pass_hash) VALUES (?, ?, ?)', name, MEMBER_COLORS[0], hashPassword(body.password));
      return db.get('SELECT * FROM members WHERE id = ?', id);
    });
    issue(ctx, member);
    ctx.status = 201;
    return { member: memberOut(member) };
  }, { auth: false });

  router.post('/api/login', async (ctx) => {
    const body = await ctx.body();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const key = `${ctx.ip}|${name.toLowerCase()}`;
    const lim = loginLimiter.hit(key);
    if (!lim.ok) throw new HttpError(429, 'rate_limited', `Muitas tentativas. Tente de novo em ${Math.ceil(lim.retryAfter / 60)} min.`);
    const member = name ? db.get('SELECT * FROM members WHERE name = ?', name) : null;
    // Mesma resposta para nome inexistente e senha errada (não revela quem é do clube).
    if (!member || typeof body.password !== 'string' || !verifyPassword(body.password, member.pass_hash)) {
      throw new HttpError(401, 'bad_credentials', 'Nome ou senha incorretos.');
    }
    loginLimiter.clear(key);
    issue(ctx, member);
    return { member: memberOut(member) };
  }, { auth: false });

  router.post('/api/logout', (ctx) => {
    ctx.setCookie(clearCookie(config.secureCookies));
    return { ok: true };
  }, { auth: false });

  router.get('/api/members', () => {
    const insights = app.insights();
    const members = db.all('SELECT * FROM members ORDER BY id').map((m) => {
      const stats = insights.perMember.find((p) => p.memberId === m.id);
      const recent = db.all(
        `SELECT r.id, r.rating, r.body, r.created_at, t.id AS title_id, t.title, t.year, t.poster_ref
           FROM reviews r JOIN titles t ON t.id = r.title_id WHERE r.member_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT 3`,
        m.id,
      ).map((r) => ({ id: r.id, rating: r.rating, body: r.body, titleId: r.title_id, title: r.title, year: r.year, posterRef: r.poster_ref }));
      return { ...memberOut(m), stats, recentReviews: recent };
    });
    return { members, sintonia: insights.comparison.sintonia };
  });

  router.post('/api/members', async (ctx) => {
    const body = await ctx.body();
    const f = nameFields(body);
    const pwErr = checkPassword(body.password);
    if (pwErr) f.err('password', pwErr);
    const { name } = f.done();
    if (db.get('SELECT 1 FROM members WHERE name = ?', name)) {
      throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { name: 'Já existe um integrante com esse nome.' });
    }
    const { id } = db.run('INSERT INTO members (name, color, pass_hash) VALUES (?, ?, ?)', name, nextColor(), hashPassword(body.password));
    ctx.status = 201;
    return { member: memberOut(db.get('SELECT * FROM members WHERE id = ?', id)) };
  });

  router.patch('/api/me', async (ctx) => {
    const body = await ctx.body();
    const f = new Fields(body);
    f.str('name', { label: 'O nome', max: 40 });
    f.oneOf('color', MEMBER_COLORS, { label: 'A cor' });
    const v = f.done();
    if (v.name && v.name.toLowerCase() !== ctx.member.name.toLowerCase() && db.get('SELECT 1 FROM members WHERE name = ?', v.name)) {
      throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { name: 'Já existe um integrante com esse nome.' });
    }
    db.run('UPDATE members SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?', v.name, v.color, ctx.member.id);
    return { member: memberOut(db.get('SELECT * FROM members WHERE id = ?', ctx.member.id)) };
  });

  router.post('/api/me/password', async (ctx) => {
    const body = await ctx.body();
    if (typeof body.current !== 'string' || !verifyPassword(body.current, ctx.member.pass_hash)) {
      throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { current: 'A senha atual não confere.' });
    }
    const pwErr = checkPassword(body.next);
    if (pwErr) throw new HttpError(422, 'invalid', 'Confira os campos destacados.', { next: pwErr });
    db.run('UPDATE members SET pass_hash = ?, session_epoch = session_epoch + 1 WHERE id = ?', hashPassword(body.next), ctx.member.id);
    issue(ctx, db.get('SELECT * FROM members WHERE id = ?', ctx.member.id)); // esta sessão continua; as outras caem
    return { ok: true };
  });
}
