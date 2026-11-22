// Cliente HTTP mínimo para testes e demo: guarda o cookie de sessão e envia o cabeçalho anti-CSRF.
export function createClient(baseUrl) {
  let cookie = '';
  async function request(method, path, body, { raw = false, headers = {} } = {}) {
    const h = { 'X-Requested-With': 'tape-club', ...headers };
    if (cookie) h.Cookie = cookie;
    let payload;
    if (body !== undefined && !raw) { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    else if (raw) payload = body;
    const res = await fetch(baseUrl + path, { method, headers: h, body: payload });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) {
      const pair = c.split(';')[0];
      cookie = pair.endsWith('=') ? '' : pair;
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  }
  return {
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b ?? {}),
    patch: (p, b) => request('PATCH', p, b ?? {}),
    del: (p) => request('DELETE', p),
    postRaw: (p, buf, headers) => request('POST', p, buf, { raw: true, headers }),
    request,
    get hasCookie() { return Boolean(cookie); },
    clear: () => { cookie = ''; },
  };
}
