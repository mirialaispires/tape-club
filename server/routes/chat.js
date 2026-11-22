// Ponte autenticada entre o site e o serviço REST Python do Tape Club Bot.
import { HttpError } from '../http.js';

export default function registerChat(router, app) {
  const { config } = app;

  async function relay(ctx, path, method, payload) {
    let response;
    try {
      response = await fetch(new URL(path, config.botUrl), {
        method,
        headers: { Accept: 'application/json', ...(payload ? { 'Content-Type': 'application/json' } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new HttpError(503, 'bot_unavailable', 'O Tape Club Bot está indisponível. Inicie o serviço Python e tente novamente.');
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new HttpError(502, 'bot_bad_response', 'O serviço do Tape Club Bot retornou uma resposta inválida.');
    }
    if (!response.ok) {
      const error = data?.error ?? {};
      throw new HttpError(response.status, error.code ?? 'bot_error', error.message ?? 'O Tape Club Bot não conseguiu concluir a solicitação.');
    }
    ctx.status = response.status;
    return data;
  }

  router.post('/api/chat', async (ctx) => {
    const body = await ctx.body();
    return relay(ctx, '/api/chat', 'POST', body);
  });

  router.post('/api/chat/conversations', async (ctx) => {
    await ctx.body();
    return relay(ctx, '/api/conversations', 'POST', {});
  });

  router.get('/api/chat/conversations/:id', async (ctx) => {
    return relay(ctx, `/api/conversations/${encodeURIComponent(ctx.params.id)}`, 'GET');
  });
}
