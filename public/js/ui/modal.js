// Janelas: foco preso, Esc fecha, devolve o foco a quem abriu, entrada e saída suaves.
import { h, trapFocus, focusables } from '../lib/dom.js';
import { reduced } from '../lib/motion.js';

const stack = [];

export function openModal({ title, no, width = 680, body, foot, closeOnBackdrop = false, onClose, label } = {}) {
  const opener = document.activeElement;
  const appRoot = document.getElementById('app');
  let closed = false;
  let busy = false;

  const root = h('div', { class: 'modal-root' });
  const bodyEl = h('div', { class: 'modal__body' });
  const footEl = h('div', { class: 'modal__foot' });
  const titleId = `m-${Math.random().toString(36).slice(2, 8)}`;
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, style: { '--w': `${width}px` }, tabindex: '-1' },
    h('div', { class: 'modal__head' },
      h('div', null, h('span', { class: 'modal__title', id: titleId }, title), no ? h('span', { class: 'modal__no' }, no) : null),
      h('button', { class: 'modal__close', type: 'button', 'aria-label': 'Fechar janela', onClick: () => api.close() }, '×')),
    bodyEl, footEl);
  const backdrop = h('div', { class: 'modal-backdrop', onClick: () => closeOnBackdrop && api.close() });
  root.append(backdrop, modal);

  const api = {
    el: modal, body: bodyEl, foot: footEl,
    setBusy(v) { busy = v; modal.toggleAttribute('aria-busy', v); },
    setBody(...nodes) { bodyEl.replaceChildren(...nodes.flat().filter(Boolean)); },
    setFoot(...nodes) { footEl.replaceChildren(...nodes.flat().filter(Boolean)); footEl.hidden = !footEl.childNodes.length; },
    setTitle(t, n) { document.getElementById(titleId).textContent = t; },
    close(result) {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(api);
      if (i >= 0) stack.splice(i, 1);
      document.removeEventListener('keydown', onKey, true);
      const done = () => {
        root.remove();
        if (!stack.length) { document.body.style.removeProperty('overflow'); appRoot?.removeAttribute('inert'); }
        else stack[stack.length - 1].el.closest('.modal-root')?.removeAttribute('inert');
        if (opener?.isConnected) opener.focus({ preventScroll: true });
        onClose?.(result);
      };
      if (reduced()) return done();
      root.classList.add('is-leaving');
      setTimeout(done, 200);
    },
  };

  function onKey(e) {
    if (stack[stack.length - 1] !== api) return;
    if (e.key === 'Escape' && !busy) { e.stopPropagation(); api.close(); }
    else trapFocus(modal, e);
  }

  if (body) api.setBody(typeof body === 'function' ? body(api) : body);
  if (foot) api.setFoot(typeof foot === 'function' ? foot(api) : foot);
  footEl.hidden = !footEl.childNodes.length;

  stack.at(-1)?.el.closest('.modal-root')?.setAttribute('inert', '');
  stack.push(api);
  document.body.appendChild(root);
  document.body.style.overflow = 'hidden';
  appRoot?.setAttribute('inert', '');
  document.addEventListener('keydown', onKey, true);
  requestAnimationFrame(() => {
    const target = modal.querySelector('[data-autofocus]') ?? focusables(bodyEl)[0] ?? modal;
    target.focus({ preventScroll: true });
  });
  return api;
}

/** Confirmação para ações que não têm volta. Resolve true/false. */
export function confirmDialog({ title = 'Confirmar', message, confirmLabel = 'Confirmar', cancelLabel = 'Voltar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title, width: 480, closeOnBackdrop: true,
      body: h('p', { class: 'modal__lead' }, message),
      foot: (m) => [
        h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, cancelLabel),
        h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button', 'data-autofocus': '', onClick: () => { answer = true; m.close(); } }, confirmLabel),
      ],
      onClose: () => resolve(answer),
    });
  });
}
