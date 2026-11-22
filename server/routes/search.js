// Pesquisa nas fontes externas e pré-visualização da importação (ainda sem gravar nada).
import { HttpError } from '../http.js';
import { Fields } from '../validate.js';
import { findExisting } from '../services/catalog.js';
import { providerHttpError } from './util.js';

const SOURCES = ['tmdb', 'tvmaze', 'wikidata'];

export default function register(router, app) {
  const { db, providers } = app;

  const annotate = (results) =>
    results.map((r) => {
      if (r.kind === 'person') return r;
      const hit = findExisting(db, { kind: r.kind, ids: r.ids });
      return { ...r, inCatalog: hit ? { id: hit.id, title: hit.title } : null };
    });

  router.get('/api/search', async (ctx) => {
    const f = new Fields({
      q: ctx.query.get('q'),
      type: ctx.query.get('type') || 'multi',
      year: ctx.query.get('year'),
    });
    f.str('q', { label: 'A busca', required: true, max: 100 });
    f.oneOf('type', ['multi', 'movie', 'tv', 'person'], { label: 'O tipo' });
    f.int('year', { label: 'O ano', min: 1870, max: new Date().getFullYear() + 6 });
    const v = f.done();
    if (v.q.length < 2) throw new HttpError(422, 'invalid', 'Digite pelo menos 2 letras.', { q: 'Digite pelo menos 2 letras.' });
    const sources = (ctx.query.get('sources') ?? '').split(',').map((s) => s.trim()).filter((s) => SOURCES.includes(s));
    const { results, providers: status } = await providers.search(v.q, { type: v.type ?? 'multi', year: v.year, sources });
    // Só falhamos a requisição quando TODAS as fontes consultadas falharam.
    const failures = Object.values(status);
    if (failures.length && failures.every((s) => !s.ok)) {
      const first = Object.entries(status)[0];
      throw new HttpError(first[1].code === 'not_configured' ? 503 : 502, `provider_${first[1].code}`, first[1].error, { providers: status });
    }
    return { results: annotate(results), providers: status };
  });

  router.get('/api/search/person/:provider/:id', async (ctx) => {
    try {
      return { results: annotate(await providers.personCredits(ctx.params.provider, ctx.params.id)) };
    } catch (err) {
      throw providerHttpError(err);
    }
  });

  router.post('/api/import/preview', async (ctx) => {
    const body = await ctx.body();
    const f = new Fields(body);
    f.oneOf('provider', SOURCES, { label: 'A fonte', required: true });
    f.str('id', { label: 'O identificador', required: true, max: 40 });
    f.oneOf('kind', ['movie', 'tv'], { label: 'O tipo' });
    const ref = f.done();
    if (ref.provider === 'tmdb' && !ref.kind) throw new HttpError(422, 'invalid', 'Informe se é filme ou série.', { kind: 'Informe o tipo.' });
    try {
      const { draft, notes } = await providers.buildDraft(ref);
      const existing = findExisting(db, draft);
      return { draft, notes, existing: existing ? { id: existing.id, title: existing.title } : null };
    } catch (err) {
      throw providerHttpError(err);
    }
  });
}
