// tape-club — servidor. Node puro: HTTP + SQLite embutido + arquivos estáticos.
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createConfig } from './config.js';
import { openDb, wrapDb } from './db.js';
import { createRouter, sendJson, readJson, serveFile, parseCookies, HttpError } from './http.js';
import { COOKIE, readSessionToken } from './auth.js';
import { createProviders } from './providers/index.js';
import { loadInsights } from './services/data.js';
import { providerHttpError } from './routes/util.js';
import registerAuth from './routes/auth.js';
import registerSearch from './routes/search.js';
import registerTitles from './routes/titles.js';
import registerSessions from './routes/sessions.js';
import registerReviews from './routes/reviews.js';
import registerOverview from './routes/overview.js';
import registerChat from './routes/chat.js';

const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https://image.tmdb.org https://static.tvmaze.com",
  "style-src 'self' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "script-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

function securityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export function createApp(overrides = {}, { fetchImpl } = {}) {
  const config = createConfig(overrides);
  const db = wrapDb(openDb(config.dbFile));
  const providers = createProviders({ config, db, fetchImpl });
  const app = { config, db, providers, insights: (opts) => loadInsights(db, opts) };

  const router = createRouter();
  [registerAuth, registerSearch, registerTitles, registerSessions, registerReviews, registerOverview, registerChat].forEach((r) => r(router, app));

  function memberFrom(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const s = readSessionToken(config.sessionSecret, token);
    if (!s) return null;
    const m = db.get('SELECT * FROM members WHERE id = ?', s.memberId);
    return m && m.session_epoch === s.epoch ? m : null;
  }

  async function api(req, res, url) {
    const { route, params, pathMatched } = router.match(req.method, url.pathname);
    if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method_not_allowed' : 'not_found', pathMatched ? 'Método não permitido.' : 'Rota não encontrada.');

    if (!['GET', 'HEAD'].includes(req.method)) {
      // Defesa contra CSRF: cabeçalho customizado (exige CORS, que não habilitamos) + Origin igual ao Host.
      const origin = req.headers.origin;
      if (req.headers['x-requested-with'] !== 'tape-club' || (origin && new URL(origin).host !== req.headers.host)) {
        throw new HttpError(403, 'csrf', 'Requisição recusada por segurança. Recarregue a página e tente de novo.');
      }
    }
    const member = memberFrom(req);
    if (route.opts.auth && !member) throw new HttpError(401, 'unauthorized', 'Entre na locadora para continuar.');

    const cookies = [];
    let bodyPromise;
    const ctx = {
      req, res, params, member,
      query: url.searchParams,
      ip: req.socket.remoteAddress ?? 'local',
      status: 200,
      setCookie: (c) => cookies.push(c),
      body: () => (bodyPromise ??= readJson(req, config.limits.jsonBody)),
    };
    const data = await route.handler(ctx);
    sendJson(res, ctx.status, data, cookies.length ? { 'Set-Cookie': cookies } : {});
  }

  async function handle(req, res) {
    securityHeaders(res);
    let url;
    let pathname;
    try {
      url = new URL(req.url, 'http://localhost');
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return sendJson(res, 400, { error: { code: 'bad_request', message: 'Endereço inválido.' } });
    }
    if (pathname.startsWith('/api/')) return api(req, res, url);

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Método não permitido.' } });
    }
    if (pathname.startsWith('/media/')) {
      if (await serveFile(req, res, config.uploadsDir, pathname.slice('/media/'.length), { immutable: true })) return;
      res.writeHead(404).end();
      return;
    }
    const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (await serveFile(req, res, config.publicDir, rel)) return;
    // Rotas do app (SPA) não têm extensão: devolvem o index.html.
    if (!/\.[a-z0-9]+$/i.test(rel) && (await serveFile(req, res, config.publicDir, 'index.html'))) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado.');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((raw) => {
      const err = providerHttpError(raw);
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } });
      } else {
        console.error('[tape-club] erro inesperado:', raw);
        sendJson(res, 500, { error: { code: 'internal', message: 'Algo deu errado do nosso lado. Tente novamente.' } });
      }
    });
  });

  return {
    app,
    server,
    listen: () => new Promise((resolve) => server.listen(config.port, config.host, () => resolve(server.address()))),
    close: () => new Promise((resolve) => server.close(() => { db.close(); resolve(); })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { app, listen, close } = createApp();
  app.providers.prune();
  const addr = await listen();
  console.log(`tape-club aberto em http://${app.config.host}:${addr.port}`);
  if (!app.providers.registry.tmdb.enabled) {
    console.log('  ! TMDB_API_KEY não definida: a busca principal fica desligada (TVmaze e Wikidata continuam disponíveis).');
  }
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => close().then(() => process.exit(0)));
}
