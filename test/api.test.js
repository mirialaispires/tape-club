// Fluxos reais da API, de ponta a ponta, com o banco em arquivo temporário e provedores simulados.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createMockFetch } from '../dev/fixtures/providers.js';
import { createClient } from '../dev/fixtures/client.js';

let dir, club, mock, base, ana, bia, caio;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tapeclub-'));
  mock = createMockFetch();
  club = createApp({ dataDir: dir, port: 0, tmdbKey: 'chave-de-teste', sessionSecret: 'segredo-de-teste' }, { fetchImpl: mock.fetchImpl });
  const addr = await club.listen();
  base = `http://127.0.0.1:${addr.port}`;
  ana = createClient(base);
  bia = createClient(base);
  caio = createClient(base);
});
after(async () => {
  await club.close();
  rmSync(dir, { recursive: true, force: true });
});

test('sem login, nada de dados; sem cabeçalho anti-CSRF, nada de escrita', async () => {
  assert.equal((await ana.get('/api/titles')).status, 401);
  const s = await ana.get('/api/session');
  assert.equal(s.data.setup, true);
  assert.equal(s.data.member, null);
  const res = await fetch(base + '/api/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 403);
});

test('abrir o clube valida a senha, cria o primeiro integrante e só funciona uma vez', async () => {
  const bad = await ana.post('/api/setup', { name: 'Ana', password: '123' });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.password);
  const ok = await ana.post('/api/setup', { name: 'Ana', password: 'senha-da-ana' });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.member.name, 'Ana');
  assert.ok(ana.hasCookie);
  const again = await bia.post('/api/setup', { name: 'Intrusa', password: 'outra-senha-1' });
  assert.equal(again.status, 409);
});

test('integrantes: cadastro, nome único, login e senha errada', async () => {
  assert.equal((await ana.post('/api/members', { name: 'Bia', password: 'senha-da-bia' })).status, 201);
  assert.equal((await ana.post('/api/members', { name: 'caio', password: 'senha-do-caio' })).status, 201);
  const dup = await ana.post('/api/members', { name: 'BIA', password: 'senha-da-bia' });
  assert.equal(dup.status, 422);
  assert.ok(dup.data.error.fields.name);
  assert.equal((await bia.post('/api/login', { name: 'Bia', password: 'errada-errada' })).status, 401);
  assert.equal((await bia.post('/api/login', { name: 'Bia', password: 'senha-da-bia' })).status, 200);
  assert.equal((await caio.post('/api/login', { name: 'Caio', password: 'senha-do-caio' })).status, 200);
  const colors = (await ana.get('/api/members')).data.members.map((m) => m.color);
  assert.equal(new Set(colors).size, 3, 'cada integrante recebe uma cor própria');
});

test('busca: resultados do TMDB com pôster, sem expor a chave e com cache', async () => {
  const r = await ana.get('/api/search?q=cidade');
  assert.equal(r.status, 200);
  assert.equal(r.data.results[0].title, 'Cidade de Deus');
  assert.equal(r.data.results[0].poster, 'tmdb:/fx900001.jpg');
  assert.equal(r.data.results[0].inCatalog, null);
  assert.ok(!JSON.stringify(r.data).includes('chave-de-teste'), 'a chave nunca vai para o navegador');
  const before = mock.calls.length;
  await ana.get('/api/search?q=cidade');
  assert.equal(mock.calls.length, before, 'a segunda busca idêntica vem do cache');
  const tmdbCall = mock.calls.find((c) => c.host === 'api.themoviedb.org');
  assert.equal(new URL('http://x' + tmdbCall.path + tmdbCall.search).searchParams.get('api_key'), 'chave-de-teste', 'a chave viaja só do servidor ao TMDB');
});

test('busca: valida entrada e filtra por ano e tipo', async () => {
  assert.equal((await ana.get('/api/search?q=a')).status, 422);
  assert.equal((await ana.get('/api/search?q=')).status, 422);
  assert.equal((await ana.get('/api/search?q=cidade&type=xx')).status, 422);
  const y = await ana.get('/api/search?q=pulp&type=movie&year=1994');
  assert.equal(y.data.results.length, 1);
  const none = await ana.get('/api/search?q=pulp&type=movie&year=1990');
  assert.equal(none.data.results.length, 0);
  const tv = await ana.get('/api/search?q=twin&type=tv');
  assert.equal(tv.data.results[0].kind, 'tv');
  const person = await ana.get('/api/search?q=lynch&type=person');
  assert.equal(person.data.results[0].kind, 'person');
});

test('importar: preview traz metadados completos e a gravação não depende do que o cliente envia', async () => {
  const pv = await ana.post('/api/import/preview', { provider: 'tmdb', id: '900001', kind: 'movie' });
  assert.equal(pv.status, 200);
  const d = pv.data.draft;
  assert.equal(d.title, 'Cidade de Deus');
  assert.equal(d.year, 2002);
  assert.equal(d.runtime, 130);
  assert.deepEqual(d.directors.map((x) => x.name), ['Fernando Meirelles', 'Kátia Lund']);
  assert.ok(d.genres.includes('Drama'));
  assert.equal(d.ids.imdb, 'tt0317248');
  assert.equal(pv.data.existing, null);

  // O cliente tenta impor um título falso: o servidor ignora e rebusca na fonte.
  const add = await ana.post('/api/titles', { draft: { provider: 'tmdb', id: '900001', kind: 'movie', title: 'FALSO' } });
  assert.equal(add.status, 201);
  assert.equal(add.data.title.title, 'Cidade de Deus');
  const full = await ana.get(`/api/titles/${add.data.id}`);
  assert.equal(full.data.title.source, 'tmdb');
  assert.equal(full.data.title.ids.tmdb, 900001);
  assert.ok(full.data.title.syncedAt);
  assert.equal(full.data.title.cast.length, 3);
  assert.match(full.data.title.catalogNo, /^TC-\d{4}-F$/);
});

test('duplicatas: mesma produção por qualquer fonte é um registro só', async () => {
  const again = await bia.post('/api/titles', { draft: { provider: 'tmdb', id: '900001', kind: 'movie' } });
  assert.equal(again.status, 409);
  assert.ok(again.data.error.fields.existingId);
  const s = await bia.get('/api/search?q=cidade');
  assert.ok(s.data.results[0].inCatalog, 'a busca avisa que já está no catálogo');
  const pv = await bia.post('/api/import/preview', { provider: 'tmdb', id: '900001', kind: 'movie' });
  assert.ok(pv.data.existing);
});

test('série: TMDB é a base e o TVmaze só complementa, preservando a origem dos dados', async () => {
  const add = await ana.post('/api/titles', { draft: { provider: 'tmdb', id: '910001', kind: 'tv' } });
  assert.equal(add.status, 201);
  const t = (await ana.get(`/api/titles/${add.data.id}`)).data.title;
  assert.equal(t.kind, 'tv');
  assert.equal(t.seasons, 5);
  assert.equal(t.episodes, 60);
  assert.equal(t.seasonList.length, 5);
  assert.equal(t.ids.tvmaze, 915001, 'identificador TVmaze anexado via IMDb');
  assert.ok(t.extra.tvmaze, 'bloco TVmaze mantido à parte');
  assert.equal(t.title, 'The Wire', 'campos do TMDB não são sobrescritos');
  assert.equal(t.origin.primary, 'tmdb');
  // Importar a mesma série pelo TVmaze cai no mesmo registro.
  const dup = await ana.post('/api/titles', { draft: { provider: 'tvmaze', id: '915001' } });
  assert.equal(dup.status, 409);
});

test('fonte complementar sozinha: série só do TVmaze é importada e etiquetada como tal', async () => {
  const s = await ana.get('/api/search?q=estacao&sources=tvmaze');
  assert.equal(s.data.results[0].provider, 'tvmaze');
  const add = await ana.post('/api/titles', { draft: { provider: 'tvmaze', id: '4242' } });
  assert.equal(add.status, 201);
  const t = (await ana.get(`/api/titles/${add.data.id}`)).data.title;
  assert.equal(t.source, 'tvmaze');
  assert.equal(t.overview, 'Uma estação de rádio de madrugada recebe ligações estranhas.');
  assert.ok(t.posterRef.startsWith('tvmaze:https://'), 'imagem do TVmaze forçada para https');
});

test('cadastro manual: validação, duplicata e edição só por quem cadastrou', async () => {
  const bad = await ana.post('/api/titles', { manual: { kind: 'movie', title: '', year: 1500 } });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.error.fields.title && bad.data.error.fields.year);
  const ok = await ana.post('/api/titles', { manual: { kind: 'movie', title: 'Curta da Esquina', year: 1998, directors: 'Zé Filho, Maria Dona', genres: ['Drama'], runtime: 12 } });
  assert.equal(ok.status, 201);
  const t = (await ana.get(`/api/titles/${ok.data.id}`)).data;
  assert.equal(t.title.source, 'manual');
  assert.deepEqual(t.title.directors.map((d) => d.name), ['Zé Filho', 'Maria Dona']);
  assert.equal(t.canEdit, true);
  assert.equal((await ana.post('/api/titles', { manual: { kind: 'movie', title: 'curta da esquina', year: 1998 } })).status, 409);
  assert.equal((await bia.patch(`/api/titles/${ok.data.id}`, { kind: 'movie', title: 'Roubo' })).status, 403);
  assert.equal((await ana.patch(`/api/titles/${ok.data.id}`, { kind: 'movie', title: 'Curta da Esquina', year: 1999 })).status, 200);
  assert.equal((await bia.get(`/api/titles/${ok.data.id}`)).data.canEdit, false);
  const sync = await ana.post(`/api/titles/${ok.data.id}/sync`);
  assert.equal(sync.status, 409, 'cadastro manual não sincroniza');
});

test('capa enviada: aceita imagem real, recusa o resto', async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
  const up = await ana.postRaw('/api/uploads/poster', png, { 'Content-Type': 'application/octet-stream' });
  assert.equal(up.status, 200);
  assert.match(up.data.ref, /^upload:\/media\/[a-f0-9]{32}\.png$/);
  const img = await fetch(base + up.data.ref.slice('upload:'.length));
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  const bad = await ana.postRaw('/api/uploads/poster', Buffer.from('<html>não sou imagem</html>'), { 'Content-Type': 'application/octet-stream' });
  assert.equal(bad.status, 415);
  const withCover = await ana.post('/api/titles', { manual: { kind: 'movie', title: 'Com Capa', year: 2001, posterRef: up.data.ref } });
  assert.equal(withCover.status, 201);
  const fake = await ana.post('/api/titles', { manual: { kind: 'movie', title: 'Capa Falsa', posterRef: 'upload:/media/../../etc/passwd' } });
  assert.equal(fake.status, 422);
});

test('arquivos estáticos: sem escapar da pasta pública', async () => {
  assert.equal((await fetch(base + '/..%2f..%2fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404);
  const res = await fetch(base + '/api/session');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
});

test('sessões e avaliações: fluxo completo, regras de data, presença e autoria', async () => {
  const titles = (await ana.get('/api/titles?sort=title')).data;
  const cdd = titles.items.find((t) => t.title === 'Cidade de Deus');
  const members = (await ana.get('/api/members')).data.members;
  const [A, B, C] = members.map((m) => m.id);

  const future = await ana.post('/api/sessions', { titleId: cdd.id, onDate: '2999-01-01', status: 'watched' });
  assert.equal(future.status, 422);
  assert.ok(future.data.error.fields.onDate);
  const planned = await ana.post('/api/sessions', { titleId: cdd.id, onDate: '2999-01-01', status: 'planned' });
  assert.equal(planned.status, 201, 'sessão futura é permitida como "na fila"');
  await ana.del(`/api/sessions/${planned.data.session.id}`);

  const s1 = await ana.post('/api/sessions', { titleId: cdd.id, onDate: '2026-03-10', attendees: [A, B, C], review: { rating: 10, body: 'Obra-prima.', wouldRewatch: true } });
  assert.equal(s1.status, 201);
  assert.equal(s1.data.session.rewatch, false);
  assert.equal(s1.data.session.attendees.length, 3);
  assert.equal((await ana.post('/api/sessions', { titleId: cdd.id, onDate: '2026-03-10', attendees: [] })).status, 422);
  assert.equal((await ana.post('/api/sessions', { titleId: cdd.id, onDate: '2026-02-31' })).status, 422);

  const sid = s1.data.session.id;
  assert.equal((await bia.post('/api/reviews', { titleId: cdd.id, sessionId: sid, rating: 9, body: 'Muito bom.' })).status, 201);
  const edit = await bia.post('/api/reviews', { titleId: cdd.id, sessionId: sid, rating: 8, body: 'Reassisti na cabeça: 8.' });
  assert.equal(edit.status, 200, 'avaliar de novo a mesma sessão atualiza, não duplica');
  assert.equal(edit.data.created, false);
  assert.equal((await bia.post('/api/reviews', { titleId: cdd.id, rating: 11 })).status, 422);
  assert.equal((await bia.post('/api/reviews', { titleId: cdd.id, rating: 0 })).status, 422);

  const outsider = await ana.post('/api/sessions', { titleId: cdd.id, onDate: '2026-04-01', attendees: [B] });
  assert.equal((await ana.post('/api/reviews', { titleId: cdd.id, sessionId: outsider.data.session.id, rating: 5 })).status, 422, 'só quem participou avalia a sessão');
  assert.equal((await bia.patch(`/api/sessions/${sid}`, { status: 'abandoned' })).status, 403);

  const rev = (await ana.get('/api/reviews?title=' + cdd.id)).data;
  assert.equal(rev.total, 2);
  const mine = (await bia.get('/api/reviews?member=' + B)).data.items[0];
  assert.equal((await ana.patch(`/api/reviews/${mine.id}`, { rating: 1 })).status, 403);
  assert.equal((await bia.patch(`/api/reviews/${mine.id}`, { rating: 7, body: 'Revi: 7.' })).status, 200);
});

test('indicadores saem das avaliações reais (e só delas)', async () => {
  const get = async (q) => (await ana.get(`/api/titles?q=${q}`)).data.items[0];
  const pulp = await ana.post('/api/titles', { draft: { provider: 'tmdb', id: '900002', kind: 'movie' } });
  const parasita = await ana.post('/api/titles', { draft: { provider: 'tmdb', id: '900005', kind: 'movie' } });
  const members = (await ana.get('/api/members')).data.members;
  const [A, B, C] = members.map((m) => m.id);
  const rate = async (client, titleId, rating, sid) => client.post('/api/reviews', { titleId, sessionId: sid, rating });

  // Pulp Fiction: Ana 10, Bia 9, Caio 9 → consenso + favorito coletivo
  const sp = await ana.post('/api/sessions', { titleId: pulp.data.id, onDate: '2026-05-01', attendees: [A, B, C] });
  for (const [c, r] of [[ana, 10], [bia, 9], [caio, 9]]) assert.ok([200, 201].includes((await rate(c, pulp.data.id, r, sp.data.session.id)).status));
  // Parasita: Ana 2, Bia 9, Caio 8 → ponto fora da curva (Ana)
  const sq = await ana.post('/api/sessions', { titleId: parasita.data.id, onDate: '2026-05-08', attendees: [A, B, C] });
  for (const [c, r] of [[ana, 2], [bia, 9], [caio, 8]]) assert.ok([200, 201].includes((await rate(c, parasita.data.id, r, sq.data.session.id)).status));

  const stats = (await ana.get('/api/stats')).data;
  const cmp = stats.comparison;
  assert.ok(cmp.collectiveFavorites.some((f) => f.title.title.startsWith('Pulp Fiction')));
  assert.ok(cmp.consensus.some((f) => f.title.title.startsWith('Pulp Fiction')));
  const out = cmp.outliers.find((o) => o.title.title === 'Parasita');
  assert.equal(out.outlier.memberId, A);
  assert.equal(out.outlier.othersAvg, 8.5);
  // Sintonia Bia×Caio (3 títulos em comum: Cidade de Deus 7 vs –, Pulp 9×9, Parasita 9×8) → diferenças [0,1] = média 0,5 → 88
  const bc = cmp.sintonia.pairs.find((p) => p.a === B && p.b === C);
  assert.equal(bc.common, 2);
  assert.equal(bc.mad, 0.5);
  assert.equal(bc.score, 88);
  const ab = cmp.sintonia.pairs.find((p) => p.a === A && p.b === B);
  assert.ok(ab.score < bc.score, 'Ana e Bia destoam mais do que Bia e Caio');
  assert.ok(stats.totals.sessionsWatched >= 3);
  assert.equal((await get('pulp')).nRatings, 3);
});

test('catálogo: filtros, ordenação e status derivado das sessões', async () => {
  const all = (await ana.get('/api/titles')).data;
  assert.ok(all.total >= 5);
  assert.ok((await ana.get('/api/titles?kind=tv')).data.items.every((t) => t.kind === 'tv'));
  const drama = (await ana.get('/api/titles?genre=Drama')).data.items;
  assert.ok(drama.length && drama.every((t) => t.genres.includes('Drama')));
  assert.ok((await ana.get('/api/titles?status=watched')).data.items.every((t) => t.status === 'watched'));
  assert.ok((await ana.get('/api/titles?status=none')).data.items.every((t) => t.nSessions === 0));
  const best = (await ana.get('/api/titles?min_rating=4.5')).data.items;
  assert.ok(best.every((t) => t.avgRating >= 9));
  const old = (await ana.get('/api/titles?year_to=2000&sort=year')).data.items;
  assert.ok(old.every((t) => t.year <= 2000));
  assert.equal((await ana.get('/api/titles?q=KÁTIA lund')).data.total, 1, 'busca ignora acentos e caixa e acha pela direção');
  const facets = (await ana.get('/api/titles/facets')).data;
  assert.ok(facets.genres.length && facets.years.min <= facets.years.max);
});

test('favoritos: marcação pessoal, contagem do clube, filtros e indicadores', async () => {
  const t = (await ana.get('/api/titles?status=watched')).data.items[0];
  const bad = await ana.post(`/api/titles/${t.id}/favorite`, { favorite: 'sim' });
  assert.equal(bad.status, 422);
  assert.equal((await ana.post('/api/titles/999999/favorite', { favorite: true })).status, 404);
  const on = await ana.post(`/api/titles/${t.id}/favorite`, { favorite: true });
  assert.deepEqual([on.data.favorite, on.data.nFavs], [true, 1]);
  assert.equal((await ana.post(`/api/titles/${t.id}/favorite`, { favorite: true })).data.nFavs, 1, 'repetir não duplica');
  assert.equal((await bia.post(`/api/titles/${t.id}/favorite`, { favorite: true })).data.nFavs, 2);
  const mine = (await ana.get('/api/titles?favorite=1')).data.items;
  assert.deepEqual(mine.map((x) => x.id), [t.id]);
  assert.equal(mine[0].favorite, true);
  assert.equal((await caio.get(`/api/titles/${t.id}`)).data.title.favorite, false, 'favorito é pessoal');
  assert.equal((await ana.get(`/api/titles/${t.id}`)).data.title.nFavs, 2);
  const st = (await ana.get('/api/stats')).data;
  assert.equal(st.totals.favorites, 2);
  assert.equal(st.favoritedTitles[0].title.id, t.id);
  assert.equal(st.favoritedTitles[0].n, 2);
  const off = await bia.post(`/api/titles/${t.id}/favorite`, { favorite: false });
  assert.deepEqual([off.data.favorite, off.data.nFavs], [false, 1]);
});

test('filtro "assistidos por": só títulos de sessões em que a pessoa esteve', async () => {
  const ids = (await ana.get('/api/members')).data.members.map((m) => m.id);
  const all = (await ana.get('/api/titles?status=watched')).data;
  for (const id of ids) {
    const r = (await ana.get(`/api/titles?watched_by=${id}`)).data;
    assert.ok(r.total <= all.total);
    for (const t of r.items) {
      const s = (await ana.get(`/api/sessions?title=${t.id}&status=watched`)).data.items;
      assert.ok(s.some((x) => x.attendees.includes(id)), `título ${t.id} sem sessão de ${id}`);
    }
  }
});

test('home e estatísticas respondem com a estrutura que as telas esperam', async () => {
  const h = (await ana.get('/api/home')).data;
  for (const k of ['totals', 'recent', 'lastWatched', 'queue', 'highlights']) assert.ok(k in h, k);
  assert.ok(h.recent.length > 0 && h.lastWatched.length > 0);
  const s = (await ana.get('/api/stats')).data;
  for (const k of ['totals', 'topGenres', 'topDirectors', 'favorites', 'distribution', 'monthly', 'comparison', 'perMember']) assert.ok(k in s, k);
  assert.equal(s.monthly.length, 12);
  assert.equal(s.distribution.length, 10);
});

test('retirar fita apaga sessões e avaliações junto, e só quem cadastrou pode', async () => {
  const t = (await ana.get('/api/titles?q=curta')).data.items[0];
  assert.equal((await bia.del(`/api/titles/${t.id}`)).status, 403);
  assert.equal((await ana.del(`/api/titles/${t.id}`)).status, 200);
  assert.equal((await ana.get(`/api/titles/${t.id}`)).status, 404);
});

test('provedor com chave inválida: erro compreensível, nada de 500', async () => {
  const dir2 = mkdtempSync(path.join(tmpdir(), 'tapeclub2-'));
  const bad = createApp({ dataDir: dir2, port: 0, tmdbKey: 'ruim', sessionSecret: 'x' }, { fetchImpl: createMockFetch({ failTmdb: true }).fetchImpl });
  const addr = await bad.listen();
  const c = createClient(`http://127.0.0.1:${addr.port}`);
  await c.post('/api/setup', { name: 'Zé', password: 'senha-do-ze-1' });
  const r = await c.get('/api/search?q=cidade');
  assert.equal(r.status, 502);
  assert.match(r.data.error.message, /recusou|TMDB/i);
  const off = createApp({ dataDir: mkdtempSync(path.join(tmpdir(), 'tapeclub3-')), port: 0, tmdbKey: '', sessionSecret: 'x' }, { fetchImpl: createMockFetch().fetchImpl });
  const a2 = await off.listen();
  const c2 = createClient(`http://127.0.0.1:${a2.port}`);
  await c2.post('/api/setup', { name: 'Zé', password: 'senha-do-ze-1' });
  const s = (await c2.get('/api/session')).data;
  assert.equal(s.providers.find((p) => p.name === 'tmdb').enabled, false);
  const q = await c2.get('/api/search?q=estacao');
  assert.equal(q.status, 200, 'sem TMDB, TVmaze e Wikidata ainda respondem');
  await bad.close();
  await off.close();
  rmSync(dir2, { recursive: true, force: true });
});
