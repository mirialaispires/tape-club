// `npm run demo` — sobe o tape-club com provedores SIMULADOS e um clube de exemplo (4 integrantes).
// Serve para explorar a interface offline. Nada daqui vai para produção: em produção, defina TMDB_API_KEY.
// Uso: node dev/demo.js [--reset]   (porta 3100; login: Ana / demo-demo-1)
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { createMockFetch } from './fixtures/providers.js';
import { createClient } from './fixtures/client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data-demo');
if (process.argv.includes('--reset') && existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true });

const port = Number(process.env.PORT ?? 3100);
const club = createApp({ dataDir, port, host: '127.0.0.1', tmdbKey: 'demo', sessionSecret: 'demo-secret' }, { fetchImpl: createMockFetch().fetchImpl });
const addr = await club.listen();
const base = `http://127.0.0.1:${addr.port}`;
const { db } = club.app;

if (db.get('SELECT COUNT(*) AS n FROM members').n === 0) {
  const PASS = 'demo-demo-1';
  const names = ['Ana', 'Bia', 'Caio', 'Duda'];
  const cl = names.map(() => createClient(base));
  await cl[0].post('/api/setup', { name: names[0], password: PASS });
  for (const n of names.slice(1)) await cl[0].post('/api/members', { name: n, password: PASS });
  for (let i = 1; i < 4; i++) await cl[i].post('/api/login', { name: names[i], password: PASS });
  const ids = (await cl[0].get('/api/members')).data.members.map((m) => m.id);

  // [tmdb, kind, importador, data, presentes, notas (1–10 = meias-estrelas), comentários]
  const log = [
    [900001, 'movie', 0, '2026-01-17', [0, 1, 2, 3], [10, 9, 10, 9], { 0: 'A câmera não deixa a gente respirar. Primeira vez que vi no cinema e saí sem falar por dez minutos.', 3: 'Pesado e lindo. A montagem da primeira meia hora é aula.' }],
    [900002, 'movie', 1, '2026-02-07', [0, 1, 2, 3], [9, 7, 9, 8], { 1: 'Os diálogos são ótimos, mas já vi melhor do mesmo diretor.', 2: 'O restaurante, a dança, a mala. Cada cena é uma figurinha.' }],
    [900003, 'movie', 0, '2026-02-28', [0, 1, 2, 3], [8, 5, 9, 4], { 1: 'Lindo de ver, vazio de sentir. A chuva faz o trabalho todo.', 2: 'A versão do diretor é outro filme. Sinto cheiro de neon até hoje.', 3: 'Dormi no meio. Tentei de novo e dormi de novo.' }],
    [900004, 'movie', 2, '2026-03-21', [0, 1, 2, 3], [8, 8, 7, 8], { 0: 'Cinema de matinê em estado puro.' }],
    [900005, 'movie', 1, '2026-04-11', [0, 1, 2, 3], [10, 9, 10, 3], { 3: 'Entendi a graça, mas passei o filme inteiro esperando acontecer algo que não aconteceu.', 0: 'A virada do meio me pegou de surpresa total.' }],
    [900006, 'movie', 3, '2026-05-02', [0, 1, 2], [8, 7, 8, null], { 2: 'Chaplin ainda faz rir sem diálogo, e a crítica continua atual.' }],
    [900007, 'movie', 0, '2026-05-23', [0, 1, 2, 3], [9, 9, 4, 9], { 2: 'Esperava terror, achei um filme sobre um homem chato num hotel vazio.', 0: 'Cada corredor parece te observar.' }],
    [900008, 'movie', 2, '2026-06-13', [0, 1, 2, 3], [9, 10, 8, 9], { 1: 'Chorei no trem e no ônibus de volta.' }],
    [900009, 'movie', 1, '2026-07-04', [0, 1, 2], [9, 6, 8, null], { 1: 'Bonito, mas lento demais para a minha sexta à noite.', 0: 'Sobre o tempo que a gente não passa com quem importa.' }],
    [900010, 'movie', 3, '2026-08-01', [0, 1, 2, 3], [8, 9, 9, 10], { 3: 'Duas horas de perseguição e nenhum minuto sobrando.' }],
    [900011, 'movie', 0, '2026-09-05', [0, 1, 2, 3], [10, 10, 9, 10], { 0: 'A cena do trem sobre a água, em silêncio, é das mais bonitas que já vi.', 3: 'Assisti com a sobrinha e ela decorou o filme inteiro.' }],
    [900012, 'movie', 2, '2026-10-03', [0, 1, 2, 3], [10, 8, 10, 7], { 2: 'Não há o que dizer que já não tenha sido dito.', 3: 'Respeito, mas não me conquistou.' }],
  ];

  for (const [tmdb, kind, who, date, present, rates, comments] of log) {
    const r = await cl[who].post('/api/titles', { draft: { provider: 'tmdb', id: String(tmdb), kind } });
    const titleId = r.data.id;
    const s = await cl[who].post('/api/sessions', { titleId, onDate: date, attendees: present.map((i) => ids[i]) });
    for (const i of present) {
      if (rates[i] == null) continue;
      await cl[i].post('/api/reviews', { titleId, sessionId: s.data.session.id, rating: rates[i], body: comments[i] ?? null, wouldRewatch: rates[i] >= 8 });
    }
    // a fita entrou na estante poucos dias antes da sessão
    db.run("UPDATE titles SET added_at = datetime(?, '-4 days') WHERE id = ?", date + ' 12:00:00', titleId);
  }

  // Segunda sessão de Cidade de Deus: a opinião mais recente de cada pessoa vale.
  const cdd = (await cl[0].get('/api/titles?q=cidade')).data.items[0].id;
  const rw = await cl[0].post('/api/sessions', { titleId: cdd, onDate: '2026-11-08', attendees: [ids[0], ids[1]], note: 'Sessão de reencontro, versão restaurada.' });
  await cl[0].post('/api/reviews', { titleId: cdd, sessionId: rw.data.session.id, rating: 10, body: 'Revi e subi de 9 para 10.', wouldRewatch: true });
  await cl[1].post('/api/reviews', { titleId: cdd, sessionId: rw.data.session.id, rating: 10, wouldRewatch: true });

  // Em andamento, na fila e só no catálogo
  const wire = await cl[0].post('/api/titles', { draft: { provider: 'tmdb', id: '910001', kind: 'tv' } });
  await cl[0].post('/api/sessions', { titleId: wire.data.id, onDate: '2026-10-17', status: 'watching', attendees: [ids[0], ids[1], ids[2]], note: 'Na temporada 2. Um episódio por semana.' });
  const wall = await cl[3].post('/api/titles', { draft: { provider: 'tmdb', id: '900013', kind: 'movie' } });
  await cl[3].post('/api/sessions', { titleId: wall.data.id, onDate: '2026-11-28', status: 'planned', attendees: ids });
  await cl[1].post('/api/titles', { draft: { provider: 'tmdb', id: '900014', kind: 'movie' } });
  await cl[2].post('/api/titles', { draft: { provider: 'tmdb', id: '910002', kind: 'tv' } });
  await cl[0].post('/api/titles', { manual: { kind: 'movie', title: 'Curta da Esquina', year: 1998, directors: 'Zé Filho', genres: ['Drama'], countries: 'Brasil', runtime: 12, overview: 'Filme caseiro rodado numa esquina de bairro. Cadastro manual de exemplo.' } });
  db.run("UPDATE titles SET added_at = datetime('now', '-2 days') WHERE id IN (?, ?)", wall.data.id, wire.data.id);
  console.log(`  clube de exemplo criado: ${names.join(', ')} (senha: ${PASS})`);
}

console.log(`tape-club (DEMO, provedores simulados) em ${base}`);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => club.close().then(() => process.exit(0)));
