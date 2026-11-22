// SQLite embutido (node:sqlite): zero dependências, um único arquivo, simples de fazer backup.
import { DatabaseSync } from 'node:sqlite';

// Escala de notas: inteiro de 1 a 10 = meias-estrelas (1 = ½★, 10 = 5★). Tudo no servidor usa essa unidade.
const MIGRATIONS = [
  /* 1 */ `
  CREATE TABLE members (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    color TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    session_epoch INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE titles (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('movie','tv')),
    title TEXT NOT NULL,
    original_title TEXT,
    year INTEGER,
    tagline TEXT,
    overview TEXT,
    poster_ref TEXT,
    backdrop_ref TEXT,
    runtime INTEGER,
    original_language TEXT,
    genres TEXT NOT NULL DEFAULT '[]',
    countries TEXT NOT NULL DEFAULT '[]',
    directors TEXT NOT NULL DEFAULT '[]',
    "cast" TEXT NOT NULL DEFAULT '[]',
    seasons INTEGER,
    episodes INTEGER,
    season_list TEXT NOT NULL DEFAULT '[]',
    tmdb_id INTEGER,
    imdb_id TEXT,
    tvmaze_id INTEGER,
    wikidata_id TEXT,
    external_score REAL,
    external_votes INTEGER,
    extra TEXT NOT NULL DEFAULT '{}',
    origin TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL CHECK (source IN ('tmdb','tvmaze','wikidata','manual')),
    search_text TEXT NOT NULL DEFAULT '',
    added_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
    added_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT
  );
  -- Uma produção = um registro, mesmo vinda de fontes diferentes.
  CREATE UNIQUE INDEX titles_tmdb ON titles(kind, tmdb_id) WHERE tmdb_id IS NOT NULL;
  CREATE UNIQUE INDEX titles_imdb ON titles(imdb_id) WHERE imdb_id IS NOT NULL;
  CREATE UNIQUE INDEX titles_tvmaze ON titles(tvmaze_id) WHERE tvmaze_id IS NOT NULL;
  CREATE UNIQUE INDEX titles_wikidata ON titles(wikidata_id) WHERE wikidata_id IS NOT NULL;
  CREATE INDEX titles_added ON titles(added_at DESC);

  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    on_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('planned','watching','watched','abandoned')),
    rewatch INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    created_by INTEGER REFERENCES members(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX sessions_title ON sessions(title_id);
  CREATE INDEX sessions_date ON sessions(on_date DESC, id DESC);

  CREATE TABLE session_members (
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, member_id)
  );

  CREATE TABLE reviews (
    id INTEGER PRIMARY KEY,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 10),
    body TEXT,
    would_rewatch INTEGER CHECK (would_rewatch IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE UNIQUE INDEX reviews_unique ON reviews(member_id, title_id, COALESCE(session_id, 0));
  CREATE INDEX reviews_title ON reviews(title_id);

  -- Opinião atual de cada integrante sobre cada título = a avaliação mais recente.
  CREATE VIEW current_opinions AS
  SELECT r.* FROM reviews r
  WHERE r.id = (
    SELECT r2.id FROM reviews r2 LEFT JOIN sessions s2 ON s2.id = r2.session_id
    WHERE r2.member_id = r.member_id AND r2.title_id = r.title_id
    ORDER BY COALESCE(s2.on_date, substr(r2.created_at, 1, 10)) DESC, r2.id DESC LIMIT 1
  );

  CREATE TABLE http_cache (
    key TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  `,
  /* 2 */ `
  -- Favoritos: marcação pessoal de cada integrante (diferente da nota).
  CREATE TABLE favorites (
    member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (member_id, title_id)
  );
  CREATE INDEX favorites_title ON favorites(title_id);
  `,
];

export function openDb(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  const { user_version: current } = db.prepare('PRAGMA user_version').get();
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  return db;
}

const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

/** Pequeno invólucro: cache de statements, undefined→null, ids numéricos. */
export function wrapDb(db) {
  const stmts = new Map();
  const prep = (sql) => {
    let s = stmts.get(sql);
    if (!s) stmts.set(sql, (s = db.prepare(sql)));
    return s;
  };
  let depth = 0;
  return {
    raw: db,
    all: (sql, ...p) => prep(sql).all(...clean(p)),
    get: (sql, ...p) => prep(sql).get(...clean(p)) ?? null,
    run: (sql, ...p) => {
      const r = prep(sql).run(...clean(p));
      return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
    },
    /** Transação (aninhamento reaproveita a transação externa). */
    tx(fn) {
      if (depth > 0) return fn();
      db.exec('BEGIN IMMEDIATE');
      depth++;
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      } finally {
        depth--;
      }
    },
    close: () => db.close(),
  };
}
