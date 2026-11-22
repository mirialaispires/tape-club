// Cache de respostas dos provedores no próprio SQLite.
// - Respeita um TTL curto (buscas) e médio (detalhes), para não congelar dados dos provedores.
// - Junta chamadas simultâneas idênticas.
// - Se a fonte falhar e houver cópia vencida, entrega a cópia (melhor que nada).
import { ProviderError } from './util.js';

export function createCache(db) {
  const inflight = new Map();

  async function wrap(key, ttlMs, fn, { refresh = false } = {}) {
    const now = Date.now();
    const row = db.get('SELECT body, expires_at FROM http_cache WHERE key = ?', key);
    if (row && !refresh && row.expires_at > now) return { value: JSON.parse(row.body), cached: true };

    if (inflight.has(key) && !refresh) return inflight.get(key);
    const p = (async () => {
      try {
        const value = await fn();
        db.run(
          `INSERT INTO http_cache (key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at`,
          key,
          JSON.stringify(value ?? null),
          now,
          now + ttlMs,
        );
        return { value, cached: false };
      } catch (err) {
        const recoverable = err instanceof ProviderError && !['auth', 'not_found', 'not_configured'].includes(err.code);
        if (row && recoverable) return { value: JSON.parse(row.body), cached: true, stale: true };
        throw err;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  }

  const prune = () => db.run('DELETE FROM http_cache WHERE expires_at < ?', Date.now() - 7 * 86_400_000);
  return { wrap, prune };
}
