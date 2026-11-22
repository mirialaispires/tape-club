// Configuração central. Tudo que varia por ambiente passa por aqui.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || m[1] in process.env) continue;
    let v = m[2];
    if (/^(".*"|'.*')$/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

function persistedSecret(dataDir) {
  const file = path.join(dataDir, 'session.key');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

const HOUR = 3600_000;

export function createConfig(overrides = {}) {
  loadDotEnv(path.join(ROOT, '.env'));
  const env = process.env;
  const dataDir = path.resolve(overrides.dataDir ?? env.DATA_DIR ?? path.join(ROOT, 'data'));
  mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

  const raw = (overrides.tmdbKey ?? env.TMDB_API_KEY ?? '').trim();
  const explicitToken = (env.TMDB_READ_TOKEN ?? '').trim();
  const readToken = explicitToken || (raw.startsWith('eyJ') ? raw : '');
  const apiKey = readToken ? '' : raw;
  const contact = env.CONTACT_EMAIL || 'sem-contato-informado';

  return {
    port: Number(overrides.port ?? env.PORT ?? 3000),
    host: overrides.host ?? env.HOST ?? '127.0.0.1',
    botUrl: overrides.botUrl ?? env.BOT_URL ?? 'http://127.0.0.1:3101',
    dataDir,
    dbFile: overrides.dbFile ?? path.join(dataDir, 'tape-club.db'),
    uploadsDir: path.join(dataDir, 'uploads'),
    publicDir: path.join(ROOT, 'public'),
    secureCookies: overrides.secureCookies ?? env.COOKIE_SECURE === '1',
    sessionSecret: overrides.sessionSecret ?? env.SESSION_SECRET ?? persistedSecret(dataDir),
    userAgent: `tape-club/1.0 (clube de cinema particular; contato: ${contact})`,
    tmdb: {
      apiKey,
      readToken,
      base: overrides.tmdbBase ?? env.TMDB_BASE_URL ?? 'https://api.themoviedb.org/3',
      imageBase: 'https://image.tmdb.org/t/p/',
      language: 'pt-BR',
    },
    tvmaze: { base: overrides.tvmazeBase ?? 'https://api.tvmaze.com' },
    wikidata: {
      api: overrides.wikidataApi ?? 'https://www.wikidata.org/w/api.php',
      sparql: overrides.wikidataSparql ?? 'https://query.wikidata.org/sparql',
    },
    // Validade do cache de respostas dos provedores.
    cacheTtl: {
      search: overrides.searchTtl ?? 1 * HOUR,
      details: overrides.detailsTtl ?? 24 * HOUR,
    },
    limits: { jsonBody: 64 * 1024, upload: 1_500_000 },
  };
}
