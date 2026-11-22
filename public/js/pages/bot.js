// Conversa com o serviço Python; o servidor Node mantém a autenticação e faz a ponte REST.
import { h, clear } from '../lib/dom.js';
import { api } from '../lib/api.js';
import { state } from '../lib/store.js';
import { PageHead } from '../ui/pagehead.js';

const STORAGE_KEY = `tape-club-bot-conversation-${state.me.id}`;
const SUGGESTIONS = [
  'Quero um filme de terror com menos de duas horas',
  'Me recomenda uma série de investigação',
  'Quero algo parecido com Interestelar',
  'Um romance de 1990',
];

function poster(item) {
  return h('div', { class: 'bot-card__poster' },
    item.poster
      ? h('img', { src: item.poster, alt: `Pôster de ${item.title}`, loading: 'lazy', onError: (event) => { event.currentTarget.hidden = true; } })
      : h('span', { class: 'bot-card__no-poster' }, 'Sem capa'));
}

function recommendationCard(item) {
  const rating = Number.isFinite(item.rating) ? `${item.rating.toFixed(1)} / 10` : 'Sem avaliação';
  return h('article', { class: 'bot-card' },
    poster(item),
    h('div', { class: 'bot-card__info' },
      h('div', { class: 'label-row' },
        h('span', { class: 'label label--flat label--red' }, item.kind === 'tv' ? 'Série' : 'Filme'),
        item.year ? h('span', { class: 'label label--flat label--plain' }, String(item.year)) : null),
      h('h3', { class: 'bot-card__title' }, item.title),
      h('p', { class: 'bot-card__meta' }, rating, item.runtime ? ` · ${item.runtime} min` : ''),
      item.overview ? h('p', { class: 'bot-card__overview' }, item.overview) : null,
      h('small', { class: 'bot-card__score' }, `Compatibilidade do pedido: ${item.recommendation_score} pontos`)));
}

function messageNode(message) {
  const assistant = message.role === 'assistant';
  return h('article', { class: `bot-message ${assistant ? 'bot-message--assistant' : 'bot-message--user'}` },
    h('div', { class: 'bot-message__label' }, assistant ? 'Tape Bot' : 'Você'),
    h('p', { class: 'bot-message__text' }, message.content),
    assistant && message.intent ? h('small', { class: 'bot-message__intent' }, `Intenção identificada: ${message.intent}`) : null,
    message.recommendations?.length ? h('div', { class: 'bot-cards' }, message.recommendations.map(recommendationCard)) : null);
}

export default async function botPage() {
  const log = h('div', { class: 'bot-log', role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions text' });
  const status = h('p', { class: 'bot-status', role: 'status', hidden: true });
  const input = h('textarea', {
    class: 'textarea bot-input',
    name: 'message',
    maxlength: 500,
    rows: 2,
    required: true,
    placeholder: 'Ex.: um suspense curto para hoje...',
    'aria-label': 'Mensagem para o Tape Bot',
  });
  const send = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enviar');
  const form = h('form', { class: 'bot-compose' }, input, send);
  const newButton = h('button', { class: 'btn btn--sm', type: 'button' }, 'Nova conversa');
  let conversationId = sessionStorage.getItem(STORAGE_KEY);
  let busy = false;

  function showWelcome() {
    clear(log).append(
      h('article', { class: 'bot-message bot-message--assistant' },
        h('div', { class: 'bot-message__label' }, 'Tape Bot'),
        h('p', { class: 'bot-message__text' }, 'Oi! Me conta o que você está a fim de assistir. Posso filtrar por gênero, duração, ano ou encontrar títulos parecidos.'),
        h('div', { class: 'bot-suggestions' }, SUGGESTIONS.map((text) =>
          h('button', { class: 'btn btn--quiet btn--sm', type: 'button', onClick: () => submitMessage(text) }, text)))),
    );
  }

  function setBusy(value) {
    busy = value;
    send.disabled = value;
    input.disabled = value;
    newButton.disabled = value;
    status.hidden = !value;
    status.textContent = value ? 'Consultando o catálogo do TMDB…' : '';
  }

  async function createConversation() {
    const result = await api.post('/api/chat/conversations', {});
    conversationId = result.conversation_id;
    sessionStorage.setItem(STORAGE_KEY, conversationId);
  }

  async function submitMessage(text = input.value) {
    const message = text.trim();
    if (!message || busy) return;
    if (!conversationId) {
      try {
        await createConversation();
      } catch (error) {
        showWelcome();
        log.append(messageNode({ role: 'assistant', content: error.message }));
        return;
      }
    }

    log.append(messageNode({ role: 'user', content: message }));
    input.value = '';
    setBusy(true);
    try {
      const response = await api.post('/api/chat', { message, conversation_id: conversationId });
      log.append(messageNode({ role: 'assistant', ...response, content: response.message }));
      log.scrollTop = log.scrollHeight;
    } catch (error) {
      log.append(messageNode({ role: 'assistant', content: error.message }));
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitMessage();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  });
  newButton.addEventListener('click', async () => {
    if (busy) return;
    newButton.disabled = true;
    status.hidden = false;
    status.textContent = 'Abrindo uma fita nova…';
    try {
      await createConversation();
      showWelcome();
      input.focus();
    } catch (error) {
      log.append(messageNode({ role: 'assistant', content: error.message }));
    } finally {
      status.hidden = true;
      newButton.disabled = false;
    }
  });

  try {
    if (!conversationId) await createConversation();
    const history = await api.get(`/api/chat/conversations/${encodeURIComponent(conversationId)}`);
    clear(log);
    history.messages.forEach((message) => log.append(messageNode(message)));
    if (!history.messages.length) showWelcome();
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    conversationId = null;
    showWelcome();
  }

  return {
    title: 'Tape Bot',
    layout: 'wide',
    el: h('div', { class: 'bot-page' },
      PageHead({ kicker: 'Conversa no balcão', title: 'Tape Bot', lead: 'Uma ajudante de escolha que cruza seus critérios com os dados do TMDB — sem chute aleatório.', seed: 72, actions: [newButton] }),
      h('section', { class: 'bot-panel', 'aria-label': 'Conversa com o Tape Bot' },
        h('div', { class: 'bot-panel__header' }, h('span', { class: 'bot-reel', 'aria-hidden': 'true' }), h('div', null, h('b', null, 'Estação de recomendações'), h('small', null, 'Digite em português; até 500 caracteres. Evite compartilhar informações pessoais.'))),
        log,
        status,
        form,
        h('p', { class: 'bot-disclaimer' }, 'As sugestões dependem dos dados disponíveis no TMDB. Conversas e filtros ficam no banco local do Tape Club Bot.')),
    ),
  };
}
