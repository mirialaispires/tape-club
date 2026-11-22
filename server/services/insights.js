// Indicadores do clube. Funções puras: recebem linhas do banco, devolvem números.
// Unidade de nota: inteiro 1..10 (meias-estrelas). Nada aqui é fictício: tudo vem das avaliações reais.

export const THRESHOLDS = {
  sintoniaZeroAt: 4, // diferença média de 4 unidades (2★) zera a sintonia de uma dupla
  divergence: 3, // amplitude ≥ 1,5★ entre integrantes = divergência
  consensus: 1, // amplitude ≤ 0,5★ = consenso
  outlier: 4, // ≥ 2★ longe da média dos demais...
  outlierOthersRange: 2, // ...enquanto os demais concordam entre si (amplitude ≤ 1★, abaixo do limiar de divergência)
  favorite: 8, // média ≥ 4★...
  favoriteMin: 6, // ...e ninguém abaixo de 3★
  minPairCommon: 2, // títulos em comum para calcular a sintonia de uma dupla
};

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Opinião atual = avaliação mais recente de cada integrante sobre cada título. */
export function latestOpinions(reviews) {
  const best = new Map();
  for (const r of reviews) {
    const k = `${r.title_id}:${r.member_id}`;
    const cur = best.get(k);
    if (!cur || r.date > cur.date || (r.date === cur.date && r.id > cur.id)) best.set(k, r);
  }
  const byTitle = new Map();
  for (const r of best.values()) {
    if (!byTitle.has(r.title_id)) byTitle.set(r.title_id, new Map());
    byTitle.get(r.title_id).set(r.member_id, r.rating);
  }
  return byTitle;
}

/** Leitura de um título a partir das notas dos integrantes (Map memberId → nota). */
export function analyzeTitle(ratings, { minRaters = 2 } = {}) {
  const entries = [...ratings.entries()];
  const n = entries.length;
  if (!n) return null;
  const rs = entries.map(([, r]) => r);
  const avg = mean(rs);
  const min = Math.min(...rs);
  const max = Math.max(...rs);
  const range = max - min;
  const tags = [];
  let outlier = null;
  let tone = null;

  if (n >= 3) {
    for (const [memberId, rating] of entries) {
      const others = entries.filter(([m]) => m !== memberId).map(([, r]) => r);
      const othersAvg = mean(others);
      const diff = Math.abs(rating - othersAvg);
      const othersRange = Math.max(...others) - Math.min(...others);
      if (diff >= THRESHOLDS.outlier && othersRange <= THRESHOLDS.outlierOthersRange && (!outlier || diff > outlier.diff)) {
        outlier = { memberId, rating, diff: round(diff), othersAvg: round(othersAvg) };
      }
    }
  }
  if (n >= minRaters) {
    if (outlier) tags.push('outlier');
    else if (range >= THRESHOLDS.divergence) tags.push('divergence');
    else if (range <= THRESHOLDS.consensus) {
      tags.push('consensus');
      tone = avg >= 7 ? 'high' : avg <= 4 ? 'low' : 'mid';
    }
    if (avg >= THRESHOLDS.favorite && min >= THRESHOLDS.favoriteMin) tags.push('favorite');
  }
  return { n, avg: round(avg), min, max, range, tags, tone, outlier };
}

const monthKey = (d) => d.slice(0, 7);

function lastMonths(now, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const tally = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
const top = (map, limit) =>
  [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')).slice(0, limit);

export function computeInsights({ members, titles, sessions, attendees, reviews, favorites: favRows = [] }, { now = new Date() } = {}) {
  const titleById = new Map(titles.map((t) => [t.id, t]));
  const brief = (id) => {
    const t = titleById.get(id);
    return t ? { id: t.id, title: t.title, year: t.year, kind: t.kind, posterRef: t.poster_ref } : null;
  };
  const minRaters = members.length < 2 ? 1 : 2;
  const opinions = latestOpinions(reviews);

  // ---- por título
  const perTitle = new Map();
  for (const [titleId, ratings] of opinions) perTitle.set(titleId, analyzeTitle(ratings, { minRaters }));

  const withInfo = (titleId, a) => ({ title: brief(titleId), ...a, ratings: Object.fromEntries(opinions.get(titleId)) });
  const all = [...perTitle.entries()].filter(([id, a]) => a && titleById.has(id));

  const collectiveFavorites = all
    .filter(([, a]) => a.tags.includes('favorite'))
    .sort((x, y) => y[1].avg - x[1].avg || y[1].n - x[1].n)
    .map(([id, a]) => withInfo(id, a));
  const divergences = all
    .filter(([, a]) => a.tags.includes('divergence') || a.tags.includes('outlier'))
    .sort((x, y) => y[1].range - x[1].range || y[1].n - x[1].n)
    .map(([id, a]) => withInfo(id, a));
  const consensus = all
    .filter(([, a]) => a.tags.includes('consensus'))
    .sort((x, y) => y[1].n - x[1].n || y[1].avg - x[1].avg)
    .map(([id, a]) => withInfo(id, a));
  const outliers = all
    .filter(([, a]) => a.outlier)
    .sort((x, y) => y[1].outlier.diff - x[1].outlier.diff)
    .map(([id, a]) => withInfo(id, a));

  // ---- sintonia entre duplas
  const memberIds = members.map((m) => m.id);
  const pairs = [];
  const rawScore = new Map(); // pontuação sem arredondar, para o agregado do clube
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = memberIds[i];
      const b = memberIds[j];
      const diffs = [];
      for (const ratings of opinions.values()) {
        if (ratings.has(a) && ratings.has(b)) diffs.push(Math.abs(ratings.get(a) - ratings.get(b)));
      }
      const common = diffs.length;
      const enough = common >= THRESHOLDS.minPairCommon;
      const mad = enough ? mean(diffs) : null;
      const raw = enough ? clamp(1 - mad / THRESHOLDS.sintoniaZeroAt, 0, 1) * 100 : null;
      rawScore.set(`${a}:${b}`, raw);
      pairs.push({ a, b, common, mad: round(mad), score: enough ? Math.round(raw) : null });
    }
  }
  const raw = (p) => rawScore.get(`${p.a}:${p.b}`);
  const weighted = (list) => {
    const w = list.reduce((s, p) => s + p.common, 0);
    return w ? Math.round(list.reduce((s, p) => s + raw(p) * p.common, 0) / w) : null;
  };
  const scored = pairs.filter((p) => p.score !== null);
  const clubSintonia = weighted(scored);
  const memberSintonia = members.map((m) => {
    const mine = scored.filter((p) => p.a === m.id || p.b === m.id);
    return { memberId: m.id, score: weighted(mine), pairs: mine.length };
  });

  // ---- totais, gêneros, diretores
  const watchedSessions = sessions.filter((s) => s.status === 'watched');
  const watchedTitleIds = new Set(watchedSessions.map((s) => s.title_id));
  const genreCount = new Map();
  const directorCount = new Map();
  let movieMinutes = 0;
  for (const s of watchedSessions) {
    const t = titleById.get(s.title_id);
    if (t?.kind === 'movie' && t.runtime) movieMinutes += t.runtime;
  }
  for (const id of watchedTitleIds) {
    const t = titleById.get(id);
    if (!t) continue;
    for (const g of t.genres ?? []) tally(genreCount, g);
    for (const d of new Set((t.directors ?? []).map((x) => x.name))) tally(directorCount, d);
  }

  const allOpinions = [...opinions.values()].flatMap((m) => [...m.values()]);
  const distribution = Array.from({ length: 10 }, (_, i) => ({ rating: i + 1, count: allOpinions.filter((r) => r === i + 1).length }));

  const favorites = all
    .map(([id, a]) => ({ id, a }))
    .sort((x, y) => y.a.avg - x.a.avg || y.a.n - x.a.n)
    .slice(0, 10)
    .map(({ id, a }) => ({ title: brief(id), avg: a.avg, n: a.n }));

  const favCount = new Map();
  for (const f of favRows) if (titleById.has(f.title_id)) tally(favCount, f.title_id);
  const favoritedTitles = [...favCount.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 10)
    .map(([id, n]) => ({ title: brief(id), n }));

  const months = lastMonths(now, 12);
  const monthly = months.map((month) => {
    const ss = watchedSessions.filter((s) => monthKey(s.on_date) === month);
    const rr = reviews.filter((r) => monthKey(r.date) === month);
    return { month, sessions: ss.length, reviews: rr.length, avgRating: rr.length ? round(mean(rr.map((r) => r.rating))) : null };
  });

  // ---- por integrante
  const sessionsByMember = new Map();
  for (const a of attendees) {
    const s = sessions.find((x) => x.id === a.session_id);
    if (s?.status === 'watched') tally(sessionsByMember, a.member_id);
  }
  // títulos efetivamente assistidos por cada integrante (sessões "watched" em que estava presente)
  const watchedByMember = new Map();
  for (const a of attendees) {
    const s = sessions.find((x) => x.id === a.session_id);
    if (s?.status !== 'watched') continue;
    if (!watchedByMember.has(a.member_id)) watchedByMember.set(a.member_id, new Set());
    watchedByMember.get(a.member_id).add(s.title_id);
  }
  const perMember = members.map((m) => {
    const mine = reviews.filter((r) => r.member_id === m.id);
    const seen = [...(watchedByMember.get(m.id) ?? [])];
    const genreCount = new Map();
    for (const id of seen) for (const g of titleById.get(id)?.genres ?? []) tally(genreCount, g);
    const topGenres = [...genreCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt')).slice(0, 5).map(([name, count]) => ({ name, count }));
    const myOpinions = [...opinions.entries()].filter(([, r]) => r.has(m.id));
    const biases = [];
    const genreRating = new Map();
    for (const [titleId, ratings] of myOpinions) {
      const others = [...ratings.entries()].filter(([id]) => id !== m.id).map(([, r]) => r);
      if (others.length) biases.push(ratings.get(m.id) - mean(others));
      for (const g of titleById.get(titleId)?.genres ?? []) {
        const cur = genreRating.get(g) ?? { sum: 0, n: 0 };
        cur.sum += ratings.get(m.id);
        cur.n++;
        genreRating.set(g, cur);
      }
    }
    const favGenre = [...genreRating.entries()].sort((a, b) => b[1].n - a[1].n || b[1].sum / b[1].n - a[1].sum / a[1].n)[0]?.[0] ?? null;
    return {
      memberId: m.id,
      reviews: mine.length,
      titlesRated: myOpinions.length,
      avgGiven: myOpinions.length ? round(mean(myOpinions.map(([, r]) => r.get(m.id)))) : null,
      bias: biases.length >= 3 ? round(mean(biases)) : null, // >0 generoso, <0 rigoroso (em meias-estrelas)
      sessionsAttended: sessionsByMember.get(m.id) ?? 0,
      titlesWatched: seen.length,
      topGenres,
      titlesAdded: titles.filter((t) => t.added_by === m.id).length,
      favorites: favRows.filter((f) => f.member_id === m.id && titleById.has(f.title_id)).length,
      favoriteGenre: favGenre,
    };
  });

  const titleIndicators = Object.fromEntries(
    [...perTitle.entries()].filter(([, a]) => a).map(([id, a]) => [id, { ...a, ratings: Object.fromEntries(opinions.get(id)) }]),
  );

  return {
    totals: {
      members: members.length,
      titles: titles.length,
      titlesWatched: watchedTitleIds.size,
      sessionsWatched: watchedSessions.length,
      reviews: reviews.length,
      ratedTitles: opinions.size,
      favorites: favRows.filter((f) => titleById.has(f.title_id)).length,
      avgRating: allOpinions.length ? round(mean(allOpinions)) : null,
      movieMinutes,
    },
    topGenres: top(genreCount, 8),
    topDirectors: top(directorCount, 8),
    favorites,
    favoritedTitles,
    distribution,
    monthly,
    comparison: {
      thresholds: THRESHOLDS,
      minRaters,
      sintonia: { score: clubSintonia, pairs, members: memberSintonia },
      collectiveFavorites,
      divergences,
      consensus,
      outliers,
    },
    perMember,
    titleIndicators,
  };
}
