// A fachada: letreiro, barra de departamentos, boas-vindas, navegação do celular e rodapé do balcão.
import { h, clear } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, bus, setMe, invalidateMembers } from '../lib/store.js';
import { navigate } from '../lib/router.js';
import { onColor, initial } from '../lib/format.js';
import { Logo } from './logo.js';
import { toast } from './toast.js';
import { cardFor } from './shelf.js';

export const NAV = [
  { key: 'inicio', href: '/', label: 'Início', short: 'Início' },
  { key: 'catalogo', href: '/catalogo', label: 'Catálogo', short: 'Catálogo' },
  { key: 'minhas-fitas', href: '/minhas-fitas', label: 'Minhas Fitas', short: 'Fitas' },
  { key: 'avaliacoes', href: '/avaliacoes', label: 'Avaliações', short: 'Mural' },
  { key: 'estatisticas', href: '/estatisticas', label: 'Perfil', short: 'Perfil' },
  { key: 'bot', href: '/bot', label: 'Tape Bot', short: 'Bot' },
  { key: 'sobre', href: '/sobre', label: 'Sobre o Clube', short: 'Sobre' },
];

const homeIcon = () => h('svg', { class: 'nav-ico', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: 'M10 2.5 1.8 9.6h2.4V17h4.3v-4.6h3V17h4.3V9.6h2.4z', fill: 'currentColor' }));
const searchIcon = () => h('svg', { class: 'nav-ico', viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' }, h('circle', { cx: 8.5, cy: 8.5, r: 5.6, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.2 }), h('path', { d: 'm13 13 5 5', stroke: 'currentColor', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));

export function mountLayout(app) {
  const head = h('header', { class: 'head' });
  const main = h('main', { class: 'page', id: 'main', tabindex: '-1' });
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Departamentos' });
  const foot = h('footer', { class: 'foot' });
  app.append(h('a', { class: 'skip', href: '#main', onClick: (e) => { e.preventDefault(); main.focus(); } }, 'Pular para o conteúdo'), head, main, foot, bottom);

  const openAdd = async () => (await import('../flows/addTitle.js')).openAddTitle();
  const openAccount = async () => (await import('../flows/account.js')).openAccount();

  async function raffle(btn) {
    btn.disabled = true;
    try {
      const pool = [];
      for (const status of ['none', 'planned']) {
        const r = await api.get(`/api/titles?status=${status}&limit=200`);
        pool.push(...r.items);
      }
      if (!pool.length) {
        toast('Todas as fitas da estante já foram assistidas. Cadastre uma nova para o próximo sorteio.', { kind: 'info', title: 'Estante em dia' });
        return;
      }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      (await import('../flows/ficha.js')).openFicha(pick.id, null, pick);
    } catch (e) {
      toast(e.message, { kind: 'error' });
    } finally {
      btn.disabled = false;
    }
  }

  function render() {
    const me = state.me;
    const items = me ? NAV : [];
    clear(head).append(
      h('div', { class: 'head__in' },
        Logo(),
        me ? h('nav', { class: 'nav-bar', 'aria-label': 'Departamentos' }, items.map((n, i) => h('a', { href: n.href, 'data-nav': n.key }, i === 0 ? homeIcon() : null, h('span', null, n.label)))) : h('span', { class: 'head__fill' }),
        me ? h('div', { class: 'head__tools' },
          h('a', { class: 'tool tool--search', href: '/catalogo?busca=1', 'aria-label': 'Buscar no catálogo' }, searchIcon()),
          h('button', { class: 'btn btn--primary btn--sm head__add', type: 'button', onClick: openAdd }, '+ ', h('span', null, 'Cadastrar fita')),
          h('button', { class: 'welcome', type: 'button', onClick: openAccount, 'aria-label': `Conta de ${me.name}` },
            h('span', { class: 'welcome__text' }, h('small', null, 'Bem-vindo(a) ao'), h('b', null, 'Tape Club')),
            h('span', { class: 'dot', style: { '--c': me.color, '--fg': onColor(me.color), '--size': '30px' }, 'aria-hidden': 'true' }, initial(me.name)),
            h('span', { class: 'sr-only' }, me.name))) : null));
    clear(bottom).append(...items.map((n) => h('a', { href: n.href, 'data-nav': n.key }, n.short)));
    bottom.hidden = !me;

    const playBtn = h('button', { class: 'play', type: 'button', 'aria-label': 'Sortear uma fita que ainda não foi assistida' }, h('span', { class: 'play__label' }, 'Play'), h('span', { class: 'play__sub' }, 'sortear fita'));
    playBtn.addEventListener('click', () => raffle(playBtn));
    clear(foot).append(h('div', { class: 'foot__in' },
      h('div', { class: 'foot__brand' }, h('span', { class: 'foot__reel', 'aria-hidden': 'true' }), h('div', null, h('b', null, 'Tape Club'), h('span', null, 'Mais que um clube, uma locadora virtual.'))),
      h('nav', { class: 'foot__links', 'aria-label': 'Rodapé' },
        h('a', { href: '/sobre#creditos' }, 'Créditos e fontes'),
        h('a', { href: '/', onClick: (e) => { if (location.pathname === '/') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); } } }, 'Voltar à entrada'),
        me ? h('button', { class: 'link-btn', type: 'button', onClick: logout }, 'Sair') : null),
      me ? playBtn : null));
  }

  function setActive(key) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  render();
  bus.addEventListener('session', render);
  let lastNav = null;
  document.addEventListener('tc:route', (e) => { lastNav = e.detail.nav; setActive(lastNav); });
  bus.addEventListener('session', () => setActive(lastNav));
  return main;
}

export async function logout() {
  try { await api.post('/api/logout'); } catch { /* sair deve sempre funcionar do lado do navegador */ }
  invalidateMembers();
  setMe(null);
  toast('Até a próxima sessão.', { kind: 'info', title: 'Saiu' });
  navigate('/entrar', { replace: true });
}
