// Estado compartilhado do app: quem está no balcão, fontes de dados e a lista de integrantes.
import { api } from './api.js';

export const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export const state = {
  ready: false,
  setup: false,
  me: null,
  providers: [],
  imageBase: 'https://image.tmdb.org/t/p/',
  members: [],
  totals: null,
};

export async function loadSession() {
  const s = await api.get('/api/session');
  state.setup = s.setup;
  state.me = s.member;
  state.providers = s.providers;
  state.imageBase = s.imageBase;
  state.ready = true;
  emit('session');
  return s;
}

export function setMe(member) {
  state.me = member;
  state.setup = false;
  state.members = [];
  emit('session');
}

let membersPromise = null;
export function loadMembers(force = false) {
  if (!membersPromise || force) {
    membersPromise = api.get('/api/members').then((r) => {
      state.members = r.members;
      return r;
    }).catch((e) => { membersPromise = null; throw e; });
  }
  return membersPromise;
}
export const invalidateMembers = () => { membersPromise = null; };

export const memberById = (id) => state.members.find((m) => m.id === id) ?? null;
export const tmdbEnabled = () => state.providers.find((p) => p.name === 'tmdb')?.enabled ?? false;

export function setTotals(totals) {
  state.totals = totals;
  emit('totals');
}
