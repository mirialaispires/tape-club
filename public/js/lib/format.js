// Formatação em português do Brasil e resolução de imagens das fontes.
import { state } from './store.js';

const nf1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('pt-BR');
const utc = { timeZone: 'UTC' };
const fDay = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', ...utc });
const fFull = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...utc });
const fMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', ...utc });
const fMonthShort = new Intl.DateTimeFormat('pt-BR', { month: 'short', ...utc });

const asDate = (iso) => new Date(String(iso).slice(0, 10) + 'T00:00:00Z');

export const fmtInt = (n) => nf0.format(n);
export const fmtDate = (iso) => (iso ? fDay.format(asDate(iso)).replace(/\./g, '') : '—');
export const fmtDateFull = (iso) => (iso ? fFull.format(asDate(iso)) : '—');
export const fmtMonth = (ym) => fMonth.format(asDate(ym + '-01'));
export const fmtMonthShort = (ym) => fMonthShort.format(asDate(ym + '-01')).replace('.', '');
export const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)} às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d)}`;
};

/** Notas internas são inteiros 1–10 (meias-estrelas). Mostramos em estrelas: 9 → "4,5". */
export const fmtStars = (n) => (n === null || n === undefined ? '—' : nf1.format(Math.round((n / 2) * 10) / 10));
export const starsPct = (n) => `${Math.max(0, Math.min(10, n ?? 0)) * 10}%`;
export const starsLabel = (n) => (n === null || n === undefined ? 'sem nota' : `${fmtStars(n)} de 5 estrelas`);

export const plural = (n, one, many) => `${fmtInt(n)} ${n === 1 ? one : many}`;
export const fmtRuntime = (min) => {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

export const todayISO = () => new Intl.DateTimeFormat('en-CA').format(new Date());

export function relDays(iso) {
  if (!iso) return '';
  const d = Math.round((asDate(iso) - asDate(todayISO())) / 86_400_000);
  if (d === 0) return 'hoje';
  if (d === -1) return 'ontem';
  if (d === 1) return 'amanhã';
  if (d < 0) return d > -45 ? `há ${-d} dias` : d > -400 ? `há ${Math.round(-d / 30)} meses` : `há ${Math.round(-d / 365)} anos`;
  return d < 45 ? `em ${d} dias` : `em ${Math.round(d / 30)} meses`;
}

export const initial = (name) => (name ?? '?').trim().charAt(0).toUpperCase() || '?';

/** Escolhe tinta ou branco para o texto sobre uma cor de integrante. */
export function onColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.58 ? '#1d1a15' : '#ffffff';
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) h = Math.imul(h ^ String(str).charCodeAt(i), 16777619);
  return h >>> 0;
}

export const STATUS = {
  watched: { label: 'Assistido', stamp: 'Devolvida', tone: 'ink' },
  watching: { label: 'Assistindo', stamp: 'Em exibição', tone: 'green' },
  planned: { label: 'Na fila', stamp: 'Reservada', tone: 'blue' },
  abandoned: { label: 'Abandonado', stamp: 'Largada', tone: 'red' },
  none: { label: 'Sem sessão', stamp: '', tone: 'plain' },
};

export const KIND = { movie: 'Filme', tv: 'Série' };

export const SOURCE_LABEL = { tmdb: 'TMDB', tvmaze: 'TVmaze', wikidata: 'Wikidata', manual: 'Cadastro manual' };

/**
 * Referências de imagem guardadas no banco:
 *   tmdb:/abc.jpg  → CDN do TMDB (nunca copiamos o arquivo)
 *   tvmaze:https://… → CDN do TVmaze
 *   upload:/media/x.jpg → capa enviada pelo clube
 */
export function imageUrl(ref, size = 'w342') {
  if (!ref) return null;
  if (ref.startsWith('tmdb:')) return `${state.imageBase}${size}${ref.slice(5)}`;
  if (ref.startsWith('tvmaze:')) return ref.slice(7);
  if (ref.startsWith('upload:')) return ref.slice(7);
  return null;
}
export function imageSrcset(ref) {
  if (!ref?.startsWith('tmdb:')) return null;
  const p = ref.slice(5);
  return [['w185', 185], ['w342', 342], ['w500', 500]].map(([s, w]) => `${state.imageBase}${s}${p} ${w}w`).join(', ');
}

export const externalLinks = (title) => {
  const { ids, kind } = title;
  const out = [];
  if (ids.tmdb) out.push({ label: 'TMDB', url: `https://www.themoviedb.org/${kind === 'tv' ? 'tv' : 'movie'}/${ids.tmdb}` });
  if (ids.imdb) out.push({ label: 'IMDb', url: `https://www.imdb.com/title/${ids.imdb}/` });
  if (ids.tvmaze) out.push({ label: 'TVmaze', url: `https://www.tvmaze.com/shows/${ids.tvmaze}` });
  if (ids.wikidata) out.push({ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${ids.wikidata}` });
  return out;
};

/** Como o clube chama cada leitura dos indicadores (calculados no servidor a partir das notas reais). */
export const INDICATOR = {
  favorite: { label: 'Favorito coletivo', line: 'Caso de amor coletivo', tone: 'tomato' },
  divergence: { label: 'Divergência de opinião', line: 'Discussão na sala de cinema', tone: 'petrol' },
  outlier: { label: 'Ponto fora da curva', line: 'Opinião fora da prateleira', tone: 'mustard' },
  consensus: { label: 'Consenso do clube', line: 'Fita aprovada pelo clube', tone: 'mustard' },
};
export const consensusLine = (tone) => ({ high: 'Fita aprovada pelo clube', mid: 'Todo mundo no mesmo tom', low: 'O clube concorda: não rolou' }[tone] ?? 'Fita aprovada pelo clube');
export const fmtScore = (n) => (n == null ? '—' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n));
