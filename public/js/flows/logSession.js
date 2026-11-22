// Registrar sessão (quem viu, quando, como foi) e escrever/editar avaliação. Tudo com carimbo ao salvar.
import { h, debounce } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state, loadMembers } from '../lib/store.js';
import { stampOverlay } from '../lib/motion.js';
import { STATUS, todayISO, KIND } from '../lib/format.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { field, input, textarea, segmented, check, withBusy, showFieldErrors } from '../ui/form.js';
import { RatingInput } from '../ui/rating.js';
import { MemberDot } from '../ui/member.js';
import { Tape } from '../ui/tape.js';
import { toast } from '../ui/toast.js';

const STATUS_OPTIONS = ['watched', 'watching', 'planned', 'abandoned'].map((v) => ({ value: v, label: STATUS[v].label }));

/** Campo de escolha da fita (quando a janela é aberta sem uma fita definida). */
function titlePicker(onPick) {
  const box = input({ type: 'search', placeholder: 'Procure na estante pelo título…', 'aria-label': 'Fita', 'data-autofocus': '' });
  const list = h('ul', { class: 'pickl', role: 'list' });
  const run = debounce(async () => {
    const q = box.value.trim();
    if (q.length < 1) { list.replaceChildren(); return; }
    try {
      const r = await api.get(`/api/titles?q=${encodeURIComponent(q)}&limit=8&sort=title`);
      list.replaceChildren(...(r.items.length ? r.items.map((t) => h('li', null,
        h('button', { type: 'button', class: 'pick__item', onClick: () => onPick(t) },
          h('span', { class: 'pick__cover' }, Tape(t, { sizes: '40px', alt: '' })),
          h('span', null, t.title, h('small', null, ` ${t.year ?? ''} · ${KIND[t.kind] ?? ''}`))))) : [h('li', { class: 'faint pick__none' }, 'Nenhuma fita com esse nome na estante. Cadastre primeiro em “Cadastrar fita”.')]));
    } catch (e) { list.replaceChildren(h('li', { class: 'faint' }, e.message)); }
  }, 250);
  box.addEventListener('input', run);
  return h('div', { class: 'picker' }, box, list);
}

export async function openLogSession({ title = null, session = null, onSaved, onClose } = {}) {
  await loadMembers();
  const editing = Boolean(session);
  let picked = title ?? session?.title ?? null;
  const members = state.members;
  const meId = state.me?.id;

  const slot = h('div', { class: 'log__title' });
  const drawTitle = () => {
    if (!picked) { slot.replaceChildren(titlePicker((t) => { picked = t; drawTitle(); })); return; }
    slot.replaceChildren(h('div', { class: 'log__picked' },
      h('span', { class: 'pick__cover' }, Tape(picked, { sizes: '48px', alt: '' })),
      h('div', null, h('b', null, picked.title), h('small', { class: 'faint' }, ` ${picked.year ?? ''}`)),
      !title && !editing ? h('button', { type: 'button', class: 'link-btn', onClick: () => { picked = null; drawTitle(); } }, 'Trocar') : null));
  };
  drawTitle();

  const status = segmented({ name: 'status', label: 'Situação', options: STATUS_OPTIONS, value: session?.status ?? 'watched', onChange: () => syncStatus() });
  const date = field({ label: 'Data', name: 'onDate', control: input({ type: 'date', value: session?.onDate ?? todayISO(), required: true }) });
  const note = field({ label: 'Anotação da sessão', name: 'note', optional: true, max: 1000, span2: true, hint: 'Onde, com que pipoca, quem dormiu no meio…', control: textarea({ rows: 2, value: session?.note ?? '' }) });
  note.control.value = session?.note ?? '';

  const selected = new Set(session?.attendees ?? (meId ? [meId] : []));
  const attErr = h('div', { class: 'field__error', role: 'alert' });
  const who = h('div', { class: 'who' }, members.map((m) => {
    const c = check({ label: h('span', { class: 'who__name' }, MemberDot(m), ` ${m.name}${m.id === meId ? ' (você)' : ''}`), checked: selected.has(m.id), name: 'attendees', value: String(m.id), onChange: (e) => { e.target.checked ? selected.add(m.id) : selected.delete(m.id); syncReview(); } });
    return c.el;
  }));

  // Avaliação opcional junto da sessão (só ao criar; edição de nota é na ficha da avaliação).
  let rating = null;
  const rate = RatingInput({ onChange: () => {} });
  const body = field({ label: 'Comentário', name: 'body', optional: true, max: 2000, span2: true, control: textarea({ rows: 3, placeholder: 'O que você achou? Pode ser uma linha.' }) });
  const rewatch = check({ label: 'Reveria', checked: false });
  const reviewBox = h('fieldset', { class: 'log__review' },
    h('legend', null, 'Já quer avaliar? ', h('i', null, '(opcional)')),
    rate.el, body.el, rewatch.el);
  const syncReview = () => {
    const can = selected.has(meId) && status.value !== 'planned';
    reviewBox.hidden = editing || !can;
  };
  const syncStatus = () => syncReview();
  syncReview();

  const err = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const form = h('form', { class: 'log', novalidate: true, id: 'log-form' },
    err, slot,
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Situação'), status.el),
    h('div', { class: 'form-grid' }, date.el, h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Quem assistiu'), who, attErr), note.el),
    reviewBox);

  const modal = openModal({
    title: editing ? 'Editar sessão' : 'Registrar sessão', no: 'Balcão', width: 720, body: form, onClose,
    foot: (m) => [
      editing ? h('button', { class: 'btn btn--danger', type: 'button', onClick: async () => {
        if (!(await confirmDialog({ title: 'Remover sessão', message: 'Essa sessão e as avaliações ligadas a ela serão removidas. Não tem volta.', confirmLabel: 'Remover', danger: true }))) return;
        try { await api.del(`/api/sessions/${session.id}`); toast('Sessão removida.', { kind: 'info' }); m.close(); onSaved?.(); } catch (e) { toast(e.message, { kind: 'error' }); }
      } }, 'Remover') : null,
      h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn btn--primary', type: 'submit', form: 'log-form', id: 'log-save' }, editing ? 'Salvar' : 'Carimbar sessão'),
    ],
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true; attErr.textContent = ''; date.clearError();
    if (!picked) { err.textContent = 'Escolha a fita da sessão.'; err.hidden = false; return; }
    if (!selected.size) { attErr.textContent = 'Marque pelo menos uma pessoa.'; return; }
    const payload = { onDate: date.control.value, status: status.value, note: note.control.value.trim() || null, attendees: [...selected] };
    if (!editing) {
      payload.titleId = picked.id;
      if (!reviewBox.hidden && rate.value) payload.review = { rating: rate.value, body: body.control.value.trim() || null, wouldRewatch: rewatch.input.checked };
    }
    withBusy(document.getElementById('log-save'), async () => {
      modal.setBusy(true);
      try {
        if (editing) await api.patch(`/api/sessions/${session.id}`, payload);
        else await api.post('/api/sessions', payload);
        stampOverlay(STATUS[payload.status].stamp, STATUS[payload.status].tone);
        toast(editing ? 'Sessão atualizada.' : `Sessão de “${picked.title}” registrada.`, { title: 'Carimbado' });
        modal.close();
        onSaved?.();
      } catch (ex) {
        const rest = showFieldErrors([date], ex.fields);
        if (ex.fields?.attendees) attErr.textContent = ex.fields.attendees;
        const extra = [ex.fields?.review, ex.fields?.titleId, ...rest].filter(Boolean)[0];
        if (extra || !ex.fields) { err.textContent = extra || ex.message; err.hidden = false; }
      } finally { modal.setBusy(false); }
    });
  });
  return modal;
}

export function openSessionEdit(session, opts = {}) { return openLogSession({ session, ...opts }); }

/** Escrever ou editar a própria avaliação (sem vínculo de sessão). */
export function openReviewForm({ title, review = null, onSaved, onClose } = {}) {
  const editing = Boolean(review);
  const rate = RatingInput({ value: review?.rating ?? null });
  const body = field({ label: 'Comentário', name: 'body', optional: true, max: 2000, span2: true, control: textarea({ rows: 5, placeholder: 'O que ficou? Spoilers são por sua conta.' }) });
  body.control.value = review?.body ?? '';
  const rewatch = check({ label: 'Reveria', checked: review?.wouldRewatch ?? false });
  const err = h('div', { class: 'callout callout--red', role: 'alert', hidden: true });
  const rateErr = h('div', { class: 'field__error', role: 'alert' });
  const form = h('form', { class: 'log', novalidate: true, id: 'rev-form' },
    err,
    h('div', { class: 'log__picked' }, h('span', { class: 'pick__cover' }, Tape(title, { sizes: '48px', alt: '' })), h('div', null, h('b', null, title.title), h('small', { class: 'faint' }, ` ${title.year ?? ''}`))),
    h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Sua nota'), rate.el, rateErr),
    body.el, rewatch.el);

  const modal = openModal({
    title: editing ? 'Editar avaliação' : 'Avaliar fita', no: 'Ficha', width: 640, body: form, onClose,
    foot: (m) => [
      editing ? h('button', { class: 'btn btn--danger', type: 'button', onClick: async () => {
        if (!(await confirmDialog({ title: 'Remover avaliação', message: 'Sua nota e seu comentário desta fita serão apagados.', confirmLabel: 'Remover', danger: true }))) return;
        try { await api.del(`/api/reviews/${review.id}`); toast('Avaliação removida.', { kind: 'info' }); m.close(); onSaved?.(); } catch (e) { toast(e.message, { kind: 'error' }); }
      } }, 'Remover') : null,
      h('button', { class: 'btn', type: 'button', onClick: () => m.close() }, 'Cancelar'),
      h('button', { class: 'btn btn--primary', type: 'submit', form: 'rev-form', id: 'rev-save' }, 'Salvar avaliação'),
    ],
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    err.hidden = true; rateErr.textContent = '';
    if (!rate.value) { rateErr.textContent = 'Dê uma nota de meia estrela a cinco.'; return; }
    const payload = { rating: rate.value, body: body.control.value.trim() || null, wouldRewatch: rewatch.input.checked };
    withBusy(document.getElementById('rev-save'), async () => {
      modal.setBusy(true);
      try {
        if (editing) await api.patch(`/api/reviews/${review.id}`, payload);
        else await api.post('/api/reviews', { titleId: title.id, ...payload });
        stampOverlay('Avaliada', 'blue');
        toast('Sua avaliação está no mural.', { title: 'Salvo' });
        modal.close();
        onSaved?.();
      } catch (ex) {
        const rest = showFieldErrors([body], ex.fields);
        if (ex.fields?.rating) rateErr.textContent = ex.fields.rating;
        if (rest.length || !ex.fields) { err.textContent = rest[0] || ex.message; err.hidden = false; }
      } finally { modal.setBusy(false); }
    });
  });
  return modal;
}
