import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';
import { createClient } from '../dev/fixtures/client.js';

let dir, bot, club, member, guest, base, seen;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'tapeclub-chat-'));
  seen = [];
  bot = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    seen.push({ method: req.method, url: req.url, body });
    const send = (status, data) => {
      const json = JSON.stringify(data);
      res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
      res.end(json);
    };
    if (req.url === '/api/chat' && body.message === 'upstream error') {
      return send(503, { error: { code: 'not_configured', message: 'Configure o TMDB.' } });
    }
    if (req.url === '/api/conversations' && req.method === 'POST') {
      return send(201, { conversation_id: '123456789012345678901234' });
    }
    if (req.url === '/api/chat' && req.method === 'POST') {
      return send(200, {
        conversation_id: body.conversation_id,
        intent: 'buscar_por_genero',
        filters: { genre: 'Terror' },
        recommendations: [{ id: '99', kind: 'movie', title: 'Filme de teste', recommendation_score: 50 }],
        message: 'Encontrei uma opção.',
      });
    }
    if (req.url === '/api/conversations/123456789012345678901234' && req.method === 'GET') {
      return send(200, { id: '123456789012345678901234', messages: [] });
    }
    send(404, { error: { code: 'not_found', message: 'Conversa não encontrada.' } });
  });
  await new Promise((resolve) => bot.listen(0, '127.0.0.1', resolve));
  club = createApp({
    dataDir: dir,
    port: 0,
    botUrl: `http://127.0.0.1:${bot.address().port}`,
    sessionSecret: 'test-secret',
  });
  const addr = await club.listen();
  base = `http://127.0.0.1:${addr.port}`;
  member = createClient(base);
  guest = createClient(base);
  await member.post('/api/setup', { name: 'Nana', password: 'senha-da-nana' });
});

after(async () => {
  await club.close();
  await new Promise((resolve) => bot.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

test('chat API exige sessão e encaminha conversas à API Python', async () => {
  assert.equal((await guest.post('/api/chat', { message: 'terror' })).status, 401);

  const created = await member.post('/api/chat/conversations', {});
  assert.equal(created.status, 201);
  assert.equal(created.data.conversation_id, '123456789012345678901234');

  const answer = await member.post('/api/chat', {
    conversation_id: created.data.conversation_id,
    message: 'Quero terror',
  });
  assert.equal(answer.status, 200);
  assert.equal(answer.data.recommendations[0].title, 'Filme de teste');
  assert.deepEqual(seen.find((call) => call.url === '/api/chat').body, {
    conversation_id: created.data.conversation_id,
    message: 'Quero terror',
  });

  const history = await member.get(`/api/chat/conversations/${created.data.conversation_id}`);
  assert.equal(history.status, 200);
  assert.deepEqual(history.data.messages, []);
});

test('chat API preserva erros retornados pelo serviço Python', async () => {
  const error = await member.post('/api/chat', {
    conversation_id: '123456789012345678901234',
    message: 'upstream error',
  });
  assert.equal(error.status, 503);
  assert.equal(error.data.error.code, 'not_configured');
  assert.equal(error.data.error.message, 'Configure o TMDB.');
});
