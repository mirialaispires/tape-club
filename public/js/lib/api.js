// Cliente da API do tape-club. Erros viram ApiError com mensagem pronta para mostrar ao usuário.
export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields ?? null;
  }
}

const PUBLIC_PATHS = ['/api/session', '/api/login', '/api/setup', '/api/logout'];

async function request(method, path, body, { signal, raw, headers = {} } = {}) {
  const init = { method, signal, credentials: 'same-origin', headers: { Accept: 'application/json', ...headers } };
  if (method !== 'GET') init.headers['X-Requested-With'] = 'tape-club';
  if (raw !== undefined) init.body = raw;
  else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, 'network', 'Sem sinal com a locadora. Confira sua conexão e tente de novo.');
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    if (res.status === 401 && !PUBLIC_PATHS.includes(path.split('?')[0])) {
      window.dispatchEvent(new CustomEvent('tc:unauthorized'));
    }
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Algo deu errado. Tente novamente.', e.fields);
  }
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body ?? {}, opts),
  patch: (path, body, opts) => request('PATCH', path, body ?? {}, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),
  upload: (path, blob, opts) => request('POST', path, undefined, { ...opts, raw: blob, headers: { 'Content-Type': 'application/octet-stream' } }),
};

/** Monta uma query string ignorando valores vazios. */
export function qs(params) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}
