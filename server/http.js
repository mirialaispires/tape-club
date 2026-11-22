// Mini-framework HTTP: roteador, corpo JSON, erros padronizados e arquivos estáticos.
import { readFile, stat } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}
export const notFound = (what = 'Não encontrado.') => new HttpError(404, 'not_found', what);
export const forbidden = (msg = 'Você não tem permissão para isso.') => new HttpError(403, 'forbidden', msg);

export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-zA-Z]+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    routes.push({ method, re, keys, handler, opts: { auth: true, ...opts } });
  };
  return {
    get: (p, h, o) => add('GET', p, h, o),
    post: (p, h, o) => add('POST', p, h, o),
    patch: (p, h, o) => add('PATCH', p, h, o),
    delete: (p, h, o) => add('DELETE', p, h, o),
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
      return { route: null, pathMatched };
    },
  };
}

export async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'too_large', 'O envio é maior do que o permitido.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit) {
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try {
    const data = JSON.parse(buf.toString('utf8'));
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('shape');
    return data;
  } catch {
    throw new HttpError(400, 'bad_json', 'Não foi possível ler os dados enviados.');
  }
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt', '.webmanifest']);
const gzCache = new Map();

/** Serve um arquivo dentro de `root` (nunca fora dele), com ETag e gzip. */
export async function serveFile(req, res, root, relPath, { immutable = false } = {}) {
  const abs = path.resolve(root, '.' + path.sep + relPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return false;
  let st;
  try {
    st = await stat(abs);
    if (!st.isFile()) return false;
  } catch {
    return false;
  }
  const ext = path.extname(abs).toLowerCase();
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    ETag: etag,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    Vary: 'Accept-Encoding',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  let body = await readFile(abs);
  if (COMPRESSIBLE.has(ext) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && body.length > 800) {
    const key = abs + etag;
    let gz = gzCache.get(key);
    if (!gz) {
      gz = gzipSync(body);
      if (gzCache.size > 200) gzCache.clear();
      gzCache.set(key, gz);
    }
    body = gz;
    headers['Content-Encoding'] = 'gzip';
  }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Limitador de tentativas em memória (janela deslizante simples). */
export function createLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      let e = hits.get(key);
      if (!e || e.reset < now) hits.set(key, (e = { n: 0, reset: now + windowMs }));
      e.n++;
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return { ok: e.n <= max, retryAfter: Math.ceil((e.reset - now) / 1000) };
    },
    clear: (key) => hits.delete(key),
  };
}
