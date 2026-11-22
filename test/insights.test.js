// Os números abaixo foram calculados à mão. Se um teste falhar, o indicador mudou de significado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTitle, latestOpinions, computeInsights, THRESHOLDS } from '../server/services/insights.js';

const m = (...pairs) => new Map(pairs);

test('analyzeTitle: consenso alto e favorito coletivo', () => {
  const a = analyzeTitle(m([1, 10], [2, 9], [3, 9]));
  assert.equal(a.n, 3);
  assert.equal(a.avg, 9.33);
  assert.equal(a.range, 1);
  assert.deepEqual(a.tags, ['consensus', 'favorite']);
  assert.equal(a.tone, 'high');
});

test('analyzeTitle: ponto fora da curva exige que os demais concordem entre si', () => {
  const a = analyzeTitle(m([1, 2], [2, 9], [3, 8]));
  assert.deepEqual(a.tags, ['outlier']);
  assert.equal(a.outlier.memberId, 1);
  assert.equal(a.outlier.othersAvg, 8.5);
  // Quando os outros também divergem, é discussão — não um ponto fora da curva.
  const b = analyzeTitle(m([1, 2], [2, 10], [3, 5]));
  assert.deepEqual(b.tags, ['divergence']);
  assert.equal(b.outlier, null);
});

test('analyzeTitle: divergência com dois integrantes e nada com uma só opinião', () => {
  assert.deepEqual(analyzeTitle(m([1, 3], [2, 7])).tags, ['divergence']);
  assert.deepEqual(analyzeTitle(m([1, 5])).tags, []);
  assert.equal(analyzeTitle(m()), null);
});

test('analyzeTitle: clube de uma pessoa só pode ter favorito (minRaters = 1)', () => {
  assert.deepEqual(analyzeTitle(m([1, 10]), { minRaters: 1 }).tags, ['consensus', 'favorite']);
});

test('analyzeTitle: favorito exige que ninguém tenha dado menos de 3★', () => {
  // média 8,5 (≥ 8) mas há um 5 (< 6) → não é "caso de amor coletivo"
  const a = analyzeTitle(m([1, 10], [2, 10], [3, 5], [4, 9]));
  assert.ok(!a.tags.includes('favorite'));
});

test('latestOpinions: vale a avaliação mais recente de cada integrante', () => {
  const ops = latestOpinions([
    { id: 1, title_id: 1, member_id: 1, rating: 7, date: '2026-01-01' },
    { id: 2, title_id: 1, member_id: 1, rating: 10, date: '2026-06-01' },
    { id: 3, title_id: 1, member_id: 2, rating: 4, date: '2026-02-01' },
    { id: 4, title_id: 1, member_id: 2, rating: 6, date: '2026-02-01' }, // mesma data: o id maior vence
  ]);
  assert.deepEqual([...ops.get(1)], [[1, 10], [2, 6]]);
});

function fixture() {
  const members = [1, 2, 3].map((id) => ({ id, name: 'M' + id, color: '#000' }));
  const titles = [
    { id: 1, kind: 'movie', title: 'Um', year: 1990, runtime: 100, genres: ['Drama'], directors: [{ name: 'Dir X' }], added_by: 1 },
    { id: 2, kind: 'movie', title: 'Dois', year: 1991, runtime: 90, genres: ['Drama', 'Terror'], directors: [{ name: 'Dir X' }], added_by: 1 },
    { id: 3, kind: 'movie', title: 'Três', year: 1992, runtime: 120, genres: ['Comédia'], directors: [{ name: 'Dir Y' }], added_by: 2 },
    { id: 4, kind: 'tv', title: 'Quatro', year: 1993, runtime: 45, genres: ['Drama'], directors: [], added_by: 2 },
    { id: 5, kind: 'movie', title: 'Cinco', year: 1994, runtime: 80, genres: ['Terror'], directors: [{ name: 'Dir Y' }], added_by: null },
  ];
  const sessions = [
    { id: 1, title_id: 1, on_date: '2026-10-05', status: 'watched', rewatch: 0, created_by: 1 },
    { id: 2, title_id: 2, on_date: '2026-10-12', status: 'watched', rewatch: 0, created_by: 1 },
    { id: 3, title_id: 3, on_date: '2026-11-02', status: 'watched', rewatch: 0, created_by: 2 },
    { id: 4, title_id: 4, on_date: '2026-11-09', status: 'watched', rewatch: 0, created_by: 2 },
    { id: 5, title_id: 5, on_date: '2026-11-20', status: 'planned', rewatch: 0, created_by: 2 },
  ];
  const attendees = [
    [1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3], [3, 1], [3, 2], [4, 1], [4, 2], [5, 1],
  ].map(([session_id, member_id]) => ({ session_id, member_id }));
  let id = 0;
  const rev = (title_id, member_id, rating, date) => ({ id: ++id, title_id, member_id, rating, date, session_id: title_id });
  const reviews = [
    rev(1, 1, 10, '2026-10-05'), rev(1, 2, 9, '2026-10-05'), rev(1, 3, 9, '2026-10-05'),
    rev(2, 1, 2, '2026-10-12'), rev(2, 2, 9, '2026-10-12'), rev(2, 3, 8, '2026-10-12'),
    rev(3, 1, 6, '2026-11-02'), rev(3, 2, 6, '2026-11-02'),
    rev(4, 1, 3, '2026-11-09'), rev(4, 2, 7, '2026-11-09'),
  ];
  return { members, titles, sessions, attendees, reviews };
}

test('computeInsights: sintonia por dupla e do clube', () => {
  const { comparison } = computeInsights(fixture(), { now: new Date('2026-11-17T12:00:00Z') });
  const pair = (a, b) => comparison.sintonia.pairs.find((p) => p.a === a && p.b === b);
  // M1×M2 em 4 títulos: |10-9|, |2-9|, |6-6|, |3-7| = 1,7,0,4 → média 3 → (1 − 3/4)·100
  assert.equal(pair(1, 2).common, 4);
  assert.equal(pair(1, 2).mad, 3);
  assert.equal(pair(1, 2).score, 25);
  // M1×M3 em 2 títulos: 1 e 6 → média 3,5 → 12,5 → 13
  assert.equal(pair(1, 3).score, 13);
  // M2×M3: 0 e 1 → média 0,5 → 87,5 → 88
  assert.equal(pair(2, 3).score, 88);
  // Clube: média ponderada pelos títulos em comum, sem arredondar antes: (25·4 + 12,5·2 + 87,5·2) / 8 = 37,5 → 38
  assert.equal(comparison.sintonia.score, 38);
});

test('computeInsights: dupla com poucos títulos em comum não ganha nota', () => {
  const d = fixture();
  d.reviews = d.reviews.filter((r) => !(r.member_id === 3 && r.title_id === 2));
  const { comparison } = computeInsights(d, { now: new Date('2026-11-17T12:00:00Z') });
  const p13 = comparison.sintonia.pairs.find((p) => p.a === 1 && p.b === 3);
  assert.equal(p13.common, THRESHOLDS.minPairCommon - 1);
  assert.equal(p13.score, null);
});

test('computeInsights: listas de indicadores', () => {
  const { comparison, totals, topGenres, topDirectors, favorites, distribution, monthly } = computeInsights(fixture(), { now: new Date('2026-11-17T12:00:00Z') });
  assert.deepEqual(comparison.collectiveFavorites.map((x) => x.title.id), [1]);
  assert.deepEqual(comparison.consensus.map((x) => x.title.id), [1, 3]); // 3 avaliações antes de 2
  assert.deepEqual(comparison.outliers.map((x) => x.title.id), [2]);
  assert.deepEqual(comparison.divergences.map((x) => x.title.id), [2, 4]); // amplitude 7 antes de 4
  assert.equal(comparison.divergences[0].ratings[1], 2);

  assert.equal(totals.members, 3);
  assert.equal(totals.titles, 5);
  assert.equal(totals.titlesWatched, 4); // o 5 só está "na fila"
  assert.equal(totals.sessionsWatched, 4);
  assert.equal(totals.reviews, 10);
  assert.equal(totals.avgRating, 6.9); // (28 + 19 + 12 + 10) / 10
  assert.equal(totals.movieMinutes, 100 + 90 + 120); // séries não entram nas horas

  // Gêneros entre títulos assistidos: Drama (1,2,4) = 3; Terror (2) = 1; Comédia (3) = 1
  assert.deepEqual(topGenres.slice(0, 3), [{ name: 'Drama', count: 3 }, { name: 'Comédia', count: 1 }, { name: 'Terror', count: 1 }]);
  assert.deepEqual(topDirectors, [{ name: 'Dir X', count: 2 }, { name: 'Dir Y', count: 1 }]);
  assert.equal(favorites[0].title.id, 1);
  assert.equal(distribution.reduce((s, d) => s + d.count, 0), 10);
  assert.equal(distribution.find((d) => d.rating === 9).count, 3);

  assert.equal(monthly.length, 12);
  assert.equal(monthly.at(-1).month, '2026-11');
  assert.equal(monthly.at(-1).sessions, 2); // 03/11 e 09/11 assistidas; a de 20/11 é só reserva
  assert.equal(monthly.at(-2).sessions, 2);
});

test('computeInsights: contribuições por integrante', () => {
  const { perMember } = computeInsights(fixture(), { now: new Date('2026-11-17T12:00:00Z') });
  const m1 = perMember.find((p) => p.memberId === 1);
  assert.equal(m1.reviews, 4);
  assert.equal(m1.titlesAdded, 2);
  assert.equal(m1.sessionsAttended, 4); // a sessão 5 está "na fila"
  assert.equal(m1.avgGiven, 5.25); // (10 + 2 + 6 + 3) / 4
  const m3 = perMember.find((p) => p.memberId === 3);
  assert.equal(m3.avgGiven, 8.5);
  assert.equal(m3.bias, null); // menos de 3 títulos com comparação
});

test('computeInsights: clube vazio não quebra nem inventa números', () => {
  const r = computeInsights({ members: [], titles: [], sessions: [], attendees: [], reviews: [] });
  assert.equal(r.totals.avgRating, null);
  assert.equal(r.comparison.sintonia.score, null);
  assert.deepEqual(r.comparison.divergences, []);
  assert.equal(r.monthly.length, 12);
});

test('computeInsights: fitas assistidas por integrante ignoram sessões planejadas', () => {
  const { perMember } = computeInsights(fixture(), { now: new Date('2026-11-17T12:00:00Z') });
  const get = (id) => perMember.find((p) => p.memberId === id);
  assert.equal(get(1).titlesWatched, 4); // a sessão 5 (planned) não conta
  assert.equal(get(3).titlesWatched, 2);
  assert.ok(Array.isArray(get(1).topGenres));
  assert.ok(get(1).topGenres.every((g) => typeof g.name === 'string' && g.count >= 1));
  assert.ok(get(1).topGenres.length <= 5);
});
