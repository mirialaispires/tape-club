// O corredor da locadora: monta os planos 3D e move a câmera.
// A câmera avança por dois motivos: (1) a estação do departamento atual; (2) o quanto a pessoa já rolou a página.
// O movimento tem inércia e velocidade máxima de "caminhada"; com redução de movimento, a câmera apenas muda de lugar.
import { h } from './dom.js';
import { reduced } from './motion.js';

export const STATIONS = [
  { key: 'inicio', path: '/', no: '01', name: 'Entrada' },
  { key: 'catalogo', path: '/catalogo', no: '02', name: 'Catálogo' },
  { key: 'minhas-fitas', path: '/minhas-fitas', no: '03', name: 'Minhas Fitas' },
  { key: 'avaliacoes', path: '/avaliacoes', no: '04', name: 'Avaliações' },
  { key: 'estatisticas', path: '/estatisticas', no: '05', name: 'Perfil' },
  { key: 'sobre', path: '/sobre', no: '06', name: 'Sobre o Clube' },
];
const SPACING = 520; // px de mundo entre estações
const WALK_PAST = 0.72; // quanto do trecho até a próxima estação o scroll percorre
const V_MAX = 1500; // px/s

let world; let hall;
let station = 0;
let cur = 0;
let target = 0;
let raf = 0;
let last = 0;
let travelling = false;

export const stationIndex = (path) => Math.max(0, STATIONS.findIndex((s) => s.path !== '/' ? path === s.path || path.startsWith(s.path + '/') : path === '/'));

export function mountScene(root) {
  hall = root;
  if (!window.CSS?.supports?.('transform-style', 'preserve-3d')) document.documentElement.classList.add('no-3d');

  const signs = STATIONS.map((s, i) =>
    h('a', { class: 'sign3d', href: s.path, tabindex: '-1', style: { transform: `translate3d(${i % 2 ? 150 : -150}px, 0, ${-(i * SPACING) - 640}px)`, '--sway-delay': `${-i * 1.3}s` } },
      h('div', { class: 'sign3d__sway' }, h('div', { class: 'sign3d__board' }, h('span', { class: 'sign3d__no' }, s.no), h('span', { class: 'sign3d__name' }, s.name)))));

  world = h('div', { class: 'hall__world' },
    h('div', { class: 'plane plane--floor' }),
    h('div', { class: 'plane plane--ceil' }, h('div', { class: 'ceil__lights' }, h('i'), h('i'), h('i'))),
    h('div', { class: 'plane plane--wall plane--wall-l' }),
    h('div', { class: 'plane plane--wall plane--wall-r' }),
    h('div', { class: 'plane plane--end' },
      h('div', { class: 'end__posters' }), h('div', { class: 'end__stripe' }),
      h('div', { class: 'end__neon', 'aria-hidden': 'true' }, h('img', { src: '/img/brand/logo-full.svg', alt: '' })), h('div', { class: 'end__counter' })),
    signs);
  root.append(h('div', { class: 'hall__stage' }, world), h('div', { class: 'hall__tone' }));

  window.addEventListener('scroll', retarget, { passive: true });
  window.addEventListener('resize', retarget, { passive: true });
  retarget();
  cur = target;
  paint();
}

function scrollProgress() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 40 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
}

function retarget() {
  target = station * SPACING + scrollProgress() * SPACING * WALK_PAST;
  if (reduced()) { cur = target; paint(); return; }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}

/** Chamado a cada troca de página: a câmera caminha até o departamento. */
export function goToStation(path) {
  const next = stationIndex(path);
  travelling = next !== station;
  station = next;
  retarget();
}

function paint() {
  world?.style.setProperty('--cam', `${cur.toFixed(1)}px`);
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const diff = target - cur;
  const k = travelling ? 2.4 : 8; // viagem entre departamentos é mais lenta que o acompanhamento do scroll
  let step = diff * (1 - Math.exp(-k * dt));
  const vmax = V_MAX * dt;
  step = Math.max(-vmax, Math.min(vmax, step));
  cur += step;
  paint();
  if (Math.abs(target - cur) < 0.5) { cur = target; paint(); raf = 0; travelling = false; return; }
  raf = requestAnimationFrame(tick);
}
