// Carteirinha do integrante: nome, cor, senha, convidar novo integrante e sair.
import { h } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, setMe, invalidateMembers, loadMembers } from '../lib/store.js';
import { refresh } from '../lib/router.js';
import { onColor } from '../lib/format.js';
import { openModal } from '../ui/modal.js';
import { field, input, withBusy, showFieldErrors } from '../ui/form.js';
import { MemberDot } from '../ui/member.js';
import { toast } from '../ui/toast.js';
import { logout } from '../ui/layout.js';

export const MEMBER_COLORS = ['#B8322A', '#1F4E8C', '#2F6B4F', '#C98A12', '#6B3F7A', '#B8561E', '#2A6C73', '#7A4B2A', '#8A2F57', '#4B5B2A'];

export function openAccount() {
  const me = state.me;
  let color = me.color;
  const name = field({ label: 'Nome', name: 'name', control: input({ value: me.name, maxlength: 40, 'data-autofocus': '' }) });
  const preview = h('div', { class: 'acct__preview' });
  const drawPreview = () => preview.replaceChildren(MemberDot({ name: name.control.value || me.name, color }, { size: 'lg' }), h('b', { class: 'sign' }, name.control.value || me.name));
  name.control.addEventListener('input', drawPreview);

  const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Cor do integrante' }, MEMBER_COLORS.map((c) => {
    const b = h('button', { type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(c === color), 'aria-label': `Cor ${c}`, style: { '--c': c, '--fg': onColor(c) }, onClick: () => {
      color = c;
      swatches.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s === b)));
      drawPreview();
    } }, '✓');
    return b;
  }));
  drawPreview();

  const err1 = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const profile = h('form', { class: 'acct__sec', novalidate: true, id: 'acct-profile' },
    h('h3', { class: 'acct__h' }, 'Seu cartão'), err1, preview, name.el,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Cor'), swatches),
    h('button', { class: 'btn btn--primary', type: 'submit', id: 'acct-save' }, 'Salvar cartão'));
  profile.addEventListener('submit', (e) => {
    e.preventDefault();
    err1.hidden = true; name.clearError();
    withBusy(document.getElementById('acct-save'), async () => {
      try {
        const r = await api.patch('/api/me', { name: name.control.value.trim(), color });
        setMe(r.member); invalidateMembers(); await loadMembers(true);
        toast('Cartão atualizado.', { title: 'Salvo' });
        refresh({ soft: true });
      } catch (ex) {
        const rest = showFieldErrors([name], ex.fields);
        if (rest.length || !ex.fields) { err1.textContent = rest[0] || ex.message; err1.hidden = false; }
      }
    });
  });

  const cur = field({ label: 'Senha atual', name: 'current', control: input({ type: 'password', autocomplete: 'current-password' }) });
  const nxt = field({ label: 'Nova senha', name: 'next', hint: 'Pelo menos 8 caracteres.', control: input({ type: 'password', autocomplete: 'new-password' }) });
  const err2 = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const pass = h('form', { class: 'acct__sec', novalidate: true, id: 'acct-pass' },
    h('h3', { class: 'acct__h' }, 'Trocar senha'), err2, cur.el, nxt.el,
    h('button', { class: 'btn', type: 'submit', id: 'acct-pass-save' }, 'Trocar senha'));
  pass.addEventListener('submit', (e) => {
    e.preventDefault();
    err2.hidden = true;
    withBusy(document.getElementById('acct-pass-save'), async () => {
      try {
        await api.post('/api/me/password', { current: cur.control.value, next: nxt.control.value });
        cur.control.value = ''; nxt.control.value = '';
        cur.clearError(); nxt.clearError();
        toast('Outras sessões abertas foram encerradas.', { title: 'Senha trocada' });
      } catch (ex) {
        const rest = showFieldErrors([cur, nxt], ex.fields);
        if (rest.length || !ex.fields) { err2.textContent = rest[0] || ex.message; err2.hidden = false; }
      }
    });
  });

  return openModal({
    title: 'Minha carteirinha', no: me.name, width: 560, closeOnBackdrop: true,
    body: h('div', { class: 'acct' }, profile, pass),
    foot: (m) => [
      h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Fechar'),
      h('button', { class: 'btn btn--danger', type: 'button', onClick: () => { m.close(); logout(); } }, 'Sair do clube'),
    ],
  });
}

/** Cadastrar um novo integrante (nome + senha inicial que a pessoa troca depois). */
export function openAddMember({ onSaved } = {}) {
  const name = field({ label: 'Nome', name: 'name', control: input({ maxlength: 40, 'data-autofocus': '' }) });
  const pw = field({ label: 'Senha inicial', name: 'password', hint: 'Pelo menos 8 caracteres. Combine com a pessoa e peça para trocar.', control: input({ type: 'password', autocomplete: 'new-password' }) });
  const err = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const form = h('form', { novalidate: true, id: 'member-form' }, err, name.el, pw.el);
  const modal = openModal({
    title: 'Novo integrante', no: 'Cadastro', width: 480, body: form,
    foot: (m) => [
      h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn btn--primary', type: 'submit', form: 'member-form', id: 'member-save' }, 'Fazer carteirinha'),
    ],
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true;
    withBusy(document.getElementById('member-save'), async () => {
      try {
        const r = await api.post('/api/members', { name: name.control.value.trim(), password: pw.control.value });
        invalidateMembers(); await loadMembers(true);
        toast(`${r.member.name} agora é do clube.`, { title: 'Carteirinha emitida' });
        modal.close();
        onSaved?.(r.member);
      } catch (ex) {
        const rest = showFieldErrors([name, pw], ex.fields);
        if (rest.length || !ex.fields) { err.textContent = rest[0] || ex.message; err.hidden = false; }
      }
    });
  });
  return modal;
}
