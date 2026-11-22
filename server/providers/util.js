// Cliente HTTP compartilhado pelos provedores: timeout, nova tentativa e espaçamento entre chamadas.

export class ProviderError extends Error {
  /** code: not_configured | auth | not_found | rate_limited | timeout | network | upstream */
  constructor(provider, message, { code = 'upstream', status } = {}) {
    super(message);
    this.provider = provider;
    this.code = code;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHttp({ userAgent, fetchImpl = globalThis.fetch }) {
  const gates = new Map();

  async function throttle(provider, ms) {
    if (!ms) return;
    const prev = gates.get(provider) ?? Promise.resolve();
    gates.set(provider, prev.then(() => sleep(ms)));
    await prev;
  }

  async function json(url, { provider, headers = {}, timeoutMs = 8000, minIntervalMs = 0, retries = 1 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await throttle(provider, minIntervalMs);
      let res;
      try {
        res = await fetchImpl(url, {
          headers: { 'User-Agent': userAgent, Accept: 'application/json', ...headers },
          signal: AbortSignal.timeout(timeoutMs),
          redirect: 'follow',
        });
      } catch (err) {
        const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        lastErr = new ProviderError(
          provider,
          timeout ? 'A fonte demorou demais para responder.' : 'Não foi possível conectar à fonte.',
          { code: timeout ? 'timeout' : 'network' },
        );
        if (attempt < retries) {
          await sleep(300);
          continue;
        }
        throw lastErr;
      }
      if (res.ok) {
        try {
          return await res.json();
        } catch {
          throw new ProviderError(provider, 'A fonte respondeu algo que não foi possível entender.');
        }
      }
      const status = res.status;
      if (status === 401 || status === 403) {
        throw new ProviderError(provider, 'A fonte recusou as credenciais configuradas.', { code: 'auth', status });
      }
      if (status === 404) throw new ProviderError(provider, 'Não encontrado na fonte.', { code: 'not_found', status });
      if ((status === 429 || status >= 500) && attempt < retries) {
        const wait = Math.min(Number(res.headers.get('retry-after')) * 1000 || 700, 2500);
        await sleep(wait);
        continue;
      }
      lastErr = new ProviderError(
        provider,
        status === 429 ? 'A fonte pediu para aguardar um pouco antes de novas buscas.' : `A fonte respondeu com erro (${status}).`,
        { code: status === 429 ? 'rate_limited' : 'upstream', status },
      );
      throw lastErr;
    }
    throw lastErr;
  }

  return { json };
}
