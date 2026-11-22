// Campos de formulário com rótulo, ajuda, contador e erro por campo (vindo do cliente ou da API).
import { h, uid } from '../lib/dom.js';

/** Envolve um controle (input/select/textarea) em .field. Devolve { el, control, setError, clearError }. */
export function field({ label, control, hint, optional = false, max, span2 = false, name }) {
  const id = uid('f');
  control.id = id;
  if (name) control.name = name;
  const errEl = h('div', { class: 'field__error', id: `${id}-err`, role: 'alert' });
  const describedBy = [hint ? `${id}-hint` : null, `${id}-err`].filter(Boolean).join(' ');
  control.setAttribute('aria-describedby', describedBy);
  let counter = null;
  if (max) {
    counter = h('span', { class: 'counter', 'aria-hidden': 'true' });
    const upd = () => {
      counter.textContent = `${control.value.length}/${max}`;
      counter.classList.toggle('is-over', control.value.length > max);
    };
    control.addEventListener('input', upd);
    upd();
    control.maxLength = max + 200; // o servidor decide o limite; o contador avisa antes
  }
  const el = h('div', { class: `field${span2 ? ' span-2' : ''}` },
    h('label', { class: 'field__label', for: id }, label, optional ? h('i', null, '(opcional)') : null),
    control,
    hint ? h('div', { class: 'field__hint', id: `${id}-hint` }, hint) : null,
    counter, errEl);
  return {
    el, control, name,
    setError(msg) {
      errEl.textContent = msg ?? '';
      el.classList.toggle('is-invalid', Boolean(msg));
      control.toggleAttribute('aria-invalid', Boolean(msg));
    },
    clearError() { this.setError(null); },
  };
}

export const input = (props = {}) => h('input', { class: 'input', type: 'text', autocomplete: 'off', ...props });
export const textarea = (props = {}) => h('textarea', { class: 'textarea', ...props });
export const select = (options, props = {}) =>
  h('select', { class: 'select', ...props }, options.map((o) => h('option', { value: o.value, selected: o.selected }, o.label)));

export function check({ label, checked = false, name, value, onChange, disabled = false }) {
  const inp = h('input', { type: 'checkbox', name, value, checked, disabled, onChange });
  return { el: h('label', { class: 'check' }, inp, h('span', { class: 'check__box' }), h('span', null, label)), input: inp };
}

/** Escolha segmentada (radio). options: [{value,label}] */
export function segmented({ name, options, value, onChange, label }) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
    options.map((o) => h('label', null,
      h('input', { type: 'radio', name, value: o.value, checked: o.value === value, onChange: () => onChange?.(o.value) }),
      h('span', null, o.label))));
  return { el: wrap, get value() { return wrap.querySelector('input:checked')?.value ?? null; }, set(v) { wrap.querySelectorAll('input').forEach((i) => { i.checked = i.value === v; }); } };
}

/** Distribui erros da API (fields) nos campos conhecidos; devolve a mensagem dos que sobraram. */
export function showFieldErrors(fields, apiFields) {
  const known = new Map(fields.filter(Boolean).map((f) => [f.name, f]));
  fields.filter(Boolean).forEach((f) => f.clearError());
  const rest = [];
  let first = null;
  for (const [k, msg] of Object.entries(apiFields ?? {})) {
    const f = known.get(k);
    if (f) { f.setError(msg); first ??= f; }
    else if (typeof msg === 'string') rest.push(msg);
  }
  first?.control.focus();
  return rest;
}

/** Executa uma ação assíncrona deixando o botão em "ocupado" e impedindo clique duplo. */
export async function withBusy(btn, fn) {
  if (btn.classList.contains('is-busy')) return;
  btn.classList.add('is-busy');
  btn.setAttribute('aria-disabled', 'true');
  try { return await fn(); } finally {
    btn.classList.remove('is-busy');
    btn.removeAttribute('aria-disabled');
  }
}
