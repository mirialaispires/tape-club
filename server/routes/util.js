import { HttpError } from '../http.js';
import { ProviderError } from '../providers/index.js';

/** Converte falhas de provedor em respostas HTTP compreensíveis. */
export function providerHttpError(err) {
  if (!(err instanceof ProviderError)) return err;
  const label = { tmdb: 'TMDB', tvmaze: 'TVmaze', wikidata: 'Wikidata' }[err.provider] ?? err.provider;
  const map = {
    not_configured: [503, 'A busca no TMDB ainda não foi configurada neste servidor (defina TMDB_API_KEY).'],
    auth: [502, `${label} recusou a chave configurada. Confira TMDB_API_KEY no servidor.`],
    not_found: [404, `Não encontramos esse registro no ${label}.`],
    rate_limited: [429, `${label} pediu para aguardar um instante. Tente de novo em alguns segundos.`],
    timeout: [504, `${label} demorou demais para responder. Tente novamente.`],
    network: [502, `Não foi possível falar com ${label} agora. Tente novamente em instantes.`],
    upstream: [502, `${label} respondeu com erro. Tente novamente em instantes.`],
  };
  const [status, message] = map[err.code] ?? map.upstream;
  return new HttpError(status, `provider_${err.code}`, message, { provider: err.provider });
}

export const asInt = (v, fallback = null) => {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return fallback; // Number(null) === 0: não deixar "ausente" virar zero
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
};

export const clampInt = (v, { min, max, def }) => {
  const n = asInt(v, def);
  return Math.min(max, Math.max(min, n));
};

export const memberOut = (m) => ({ id: m.id, name: m.name, color: m.color, createdAt: m.created_at ? m.created_at.replace(' ', 'T') + 'Z' : null });
