// Sobre o clube + créditos e fontes de dados (atribuições exigidas pelas bases usadas).
import { h } from '../lib/dom.js';
import { state, loadMembers } from '../lib/store.js';
import { Paper } from '../ui/paper.js';
import { PageHead } from '../ui/pagehead.js';
import { MemberDot } from '../ui/member.js';
import { fmtDateFull } from '../lib/format.js';

const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);

export default async function sobre({ path }) {
  const { members } = await loadMembers();
  const on = (n) => state.providers.find((p) => p.name === n)?.enabled;
  const status = (n) => h('span', { class: `label label--flat ${on(n) ? 'label--green' : 'label--plain'}` }, on(n) ? 'ligada neste servidor' : 'desligada neste servidor');

  const addMember = async () => (await import('../flows/account.js')).openAddMember({ onSaved: () => import('../lib/router.js').then((r) => r.refresh({ soft: true })) });

  const intro = Paper([
    h('p', { class: 'note-kicker' }, 'Locadora particular'),
    h('h2', { class: 'note-title' }, 'Tape', h('em', null, 'Club')),
    h('p', { class: 'note-text' }, 'Um clube de vídeo só nosso: a estante guarda o que já vimos e o que vem por aí, cada sessão vira um registro no diário e cada nota alimenta os indicadores do mural. Nada de algoritmo — só a gente, as fitas e as opiniões.'),
    h('p', { class: 'note-text' }, 'As informações de filmes e séries vêm de bases abertas (veja os créditos abaixo). As notas, sessões e comentários são dos integrantes e ficam guardados neste servidor.'),
  ], { tone: 'cream', tilt: -0.8, seed: 101, amp: 5, stars: true, cls: 'about__intro' });

  const roster = Paper([
    h('div', { class: 'about__rosterhead' }, h('h2', { class: 'note-title note-title--sm' }, 'Quem é do clube'), h('button', { class: 'btn btn--sm', type: 'button', onClick: addMember }, 'Novo integrante')),
    h('ul', { class: 'roster', role: 'list' }, members.map((m) => h('li', { class: 'roster__m' }, MemberDot(m, { size: 'lg' }), h('div', null, h('b', { class: 'sign' }, m.name, m.id === state.me.id ? ' (você)' : ''), h('small', { class: 'faint' }, `sócio desde ${fmtDateFull(m.createdAt.slice(0, 10))}`))))),
  ], { tone: 'mustard', tilt: 0.7, seed: 102, amp: 4, cls: 'about__roster' });

  const how = Paper([
    h('h2', { class: 'note-title note-title--sm' }, 'Como funciona o balcão'),
    h('ul', { class: 'about__list' },
      h('li', null, h('b', null, 'Cadastrar fita: '), 'pesquise nas bases ou cadastre à mão o que elas não têm.'),
      h('li', null, h('b', null, 'Registrar sessão: '), 'data, quem assistiu e situação (assistido, assistindo, na fila, abandonado).'),
      h('li', null, h('b', null, 'Avaliar: '), 'de meia estrela a cinco, com comentário opcional. A média e os indicadores usam só as notas reais.'),
      h('li', null, h('b', null, 'Indicadores: '), 'sintonia, divergência, consenso, ponto fora da curva e favorito coletivo são calculados no servidor, com limites visíveis no mural.')),
  ], { tone: 'cream', tilt: 0.4, seed: 103, amp: 4, cls: 'about__how' });

  const credits = h('section', { class: 'credits', id: 'creditos', 'aria-labelledby': 'cred-h', tabindex: '-1' },
    Paper([
      h('h2', { class: 'note-title', id: 'cred-h' }, 'Créditos e fontes'),
      h('div', { class: 'credits__item' }, h('h3', null, 'TMDB ', status('tmdb')),
        h('p', null, 'This product uses the TMDB API but is not endorsed or certified by TMDB.'),
        h('p', { class: 'faint' }, 'Metadados, sinopses e imagens de capa de filmes e séries vêm do ', ext('https://www.themoviedb.org', 'The Movie Database (TMDB)'), '. As consultas são feitas pelo servidor; a chave nunca chega ao navegador.')),
      h('div', { class: 'credits__item' }, h('h3', null, 'TVmaze ', status('tvmaze')),
        h('p', { class: 'faint' }, 'Dados complementares de séries por ', ext('https://www.tvmaze.com', 'TVmaze'), ', sob licença ', ext('https://creativecommons.org/licenses/by-sa/4.0/', 'CC BY-SA 4.0'), '.')),
      h('div', { class: 'credits__item' }, h('h3', null, 'Wikidata ', status('wikidata')),
        h('p', { class: 'faint' }, 'Identificadores e dados estruturados de ', ext('https://www.wikidata.org', 'Wikidata'), ', em domínio público (CC0).')),
      h('div', { class: 'credits__item' }, h('h3', null, 'Fontes tipográficas'),
        h('p', { class: 'faint' }, 'Fraunces, Barlow, Barlow Condensed e Caveat, via ', ext('https://fonts.google.com', 'Google Fonts'), ' (SIL Open Font License).')),
      h('p', { class: 'faint' }, 'Cada fita mostra de qual fonte vieram seus dados. Cadastros manuais são marcados como tal.'),
    ], { tone: 'cream', tilt: -0.3, seed: 104, amp: 4, cls: 'about__credits' }));

  const el = h('div', { class: 'about' },
    PageHead({ kicker: 'Sobre', title: 'Sobre o clube', lead: 'Quem somos, como o balcão funciona e de onde vêm os dados.', seed: 46 }),
    h('div', { class: 'about__grid' }, intro, roster, how), credits);
  if (path === '/creditos') queueMicrotask(() => { credits.scrollIntoView({ block: 'start' }); credits.focus({ preventScroll: true }); });
  return { title: path === '/creditos' ? 'Créditos' : 'Sobre o clube', el, layout: 'wide' };
}
