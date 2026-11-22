// Entrada: abrir o clube (primeira vez) ou entrar com nome e senha. Sempre sobre o corredor.
import { h } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, setMe, loadMembers } from '../lib/store.js';
import { navigate } from '../lib/router.js';
import { Paper } from '../ui/paper.js';
import { field, input, withBusy, showFieldErrors } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { stampOverlay } from '../lib/motion.js';

export default async function entrar({ query }) {
  const setup = state.setup;
  const next = query.get('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

  const name = field({ label: setup ? 'Seu nome de sócio' : 'Nome de sócio', name: 'name', control: input({ autocomplete: 'username', maxlength: 60, required: true, 'data-autofocus': '' }), hint: setup ? 'É assim que o clube vai te chamar nas fichas.' : null });
  const pass = field({ label: 'Senha', name: 'password', control: input({ type: 'password', autocomplete: setup ? 'new-password' : 'current-password', required: true }), hint: setup ? 'Pelo menos 8 caracteres.' : null });
  const err = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, setup ? 'Abrir o clube' : 'Entrar na locadora');

  const form = h('form', { class: 'stack entrar__form', novalidate: true }, name.el, pass.el, err, h('div', { class: 'row' }, submit));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    name.clearError(); pass.clearError();
    if (!name.control.value.trim()) return name.setError('Diga seu nome de sócio.'), name.control.focus();
    if (!pass.control.value) return pass.setError('Digite a senha.'), pass.control.focus();
    withBusy(submit, async () => {
      try {
        const body = { name: name.control.value.trim(), password: pass.control.value };
        const r = await api.post(setup ? '/api/setup' : '/api/login', body);
        setMe(r.member);
        await loadMembers(true).catch(() => {});
        stampOverlay(setup ? 'Clube aberto' : 'Bem-vindo(a)', 'red', { ms: 1100 });
        navigate(safeNext, { replace: true });
      } catch (ex) {
        const rest = showFieldErrors([name, pass], ex.fields);
        if (ex.fields && !rest.length) return;
        err.textContent = rest[0] || ex.message;
        err.hidden = false;
      }
    });
  });

  const card = Paper([
    h('p', { class: 'note-kicker' }, setup ? 'Primeira visita' : 'Ficha de sócio'),
    h('h1', { class: 'note-title' }, setup ? 'Abra o' : 'Bem-vindo(a)', h('em', null, setup ? 'seu clube' : 'ao Tape Club')),
    h('i', { class: 'note-rule', 'aria-hidden': 'true' }),
    h('p', { class: 'note-text' }, setup
      ? 'Ainda não há nenhum sócio. Você será o primeiro: depois de entrar, cadastre os outros integrantes pela página Sobre o Clube.'
      : 'Um clube particular de cinema: só entra quem tem ficha. Use o nome e a senha que o clube te deu.'),
    form,
  ], { tone: 'cream', tilt: -1, seed: 5, tape: true, stars: true, cls: 'entrar__card' });

  const el = h('div', { class: 'entrar' }, card);
  return { title: setup ? 'Abrir o clube' : 'Entrar', el, layout: 'wide' };
}
