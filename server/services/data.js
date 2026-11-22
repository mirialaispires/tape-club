// Carrega do banco as linhas que os indicadores precisam (clubes pequenos: tudo em memória é barato).
import { computeInsights } from './insights.js';

const J = (s, d = []) => { try { return JSON.parse(s); } catch { return d; } };

export function loadClubData(db) {
  const members = db.all('SELECT id, name, color, created_at FROM members ORDER BY id');
  const titles = db
    .all('SELECT id, kind, title, year, runtime, genres, directors, poster_ref, added_by, added_at FROM titles')
    .map((t) => ({ ...t, genres: J(t.genres), directors: J(t.directors) }));
  const sessions = db.all('SELECT id, title_id, on_date, status, rewatch, created_by FROM sessions');
  const attendees = db.all('SELECT session_id, member_id FROM session_members');
  const reviews = db.all(
    `SELECT r.id, r.title_id, r.member_id, r.session_id, r.rating, r.would_rewatch,
            COALESCE(s.on_date, substr(r.created_at, 1, 10)) AS date
       FROM reviews r LEFT JOIN sessions s ON s.id = r.session_id`,
  );
  const favorites = db.all('SELECT member_id, title_id FROM favorites');
  return { members, titles, sessions, attendees, reviews, favorites };
}

export const loadInsights = (db, opts) => computeInsights(loadClubData(db), opts);
