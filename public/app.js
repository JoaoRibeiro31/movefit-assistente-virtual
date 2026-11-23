const chatForm = document.querySelector('#chat-form');
const messageInput = document.querySelector('#user-input');
const sendButton = document.querySelector('#send-message');
const messages = document.querySelector('#messages');
const conversation = document.querySelector('#conversation');
const chatProgress = document.querySelector('#chat-progress');
const quickButtons = [...document.querySelectorAll('[data-action]')];
const scheduleAction = document.querySelector('#schedule-action');

const booking = document.querySelector('#booking');
const bookingTitle = document.querySelector('#booking-title');
const bookingDescription = document.querySelector('#booking-description');
const bookingForm = document.querySelector('#booking-form');
const bookingDate = document.querySelector('#booking-date');
const bookingClass = document.querySelector('#booking-class');
const bookingSession = document.querySelector('#booking-session');
const bookingStatus = document.querySelector('#booking-status');
const bookingConfirm = document.querySelector('#booking-confirm');
const bookingClose = document.querySelector('#close-booking');

const history = [];
let chatBusy = false;
let bookingBusy = false;
let catalog;
let catalogRequest;

const saoPauloDate = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const chatTime = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' });

function today() {
  const date = Object.fromEntries(saoPauloDate.formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${date.year}-${date.month}-${date.day}`;
}

function appendMessage(text, role, source = '') {
  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('span');
    avatar.className = 'chat-avatar muvinho-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    row.append(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'message';
  const author = document.createElement('span');
  author.className = role === 'assistant' ? 'message-author' : 'sr-only';
  author.textContent = role === 'assistant' ? 'Muvinho' : 'Você';
  const content = document.createElement('p');
  content.textContent = text;
  const meta = document.createElement('div');
  meta.className = 'message-meta';
  if (source) {
    const details = document.createElement('span');
    details.textContent = source;
    meta.append(details);
  }
  const now = new Date();
  const time = document.createElement('time');
  time.dateTime = now.toISOString();
  time.textContent = chatTime.format(now);
  meta.append(time);
  bubble.append(author, content, meta);
  row.append(bubble);
  messages.append(row);
  if (booking.hidden) conversation.scrollTop = conversation.scrollHeight;
}

function sourceLabel({ mode, dataMode }, action) {
  if (mode === 'gemini') return dataMode === 'demo' ? 'Gemini · Dados demonstrativos' : 'Gemini';
  if (action === 'hours' || action === 'faq') return 'Informações da MoveFIT';
  if (dataMode === 'atlas') return 'Resposta automática · Dados do Atlas';
  return 'Modo demonstração';
}

async function requestJSON(path, options = {}) {
  const timeout = AbortSignal.timeout(25000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(path, { ...options, signal, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(typeof data.error === 'string' ? data.error : 'O servidor está indisponível. Tente novamente.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function postJSON(path, body) {
  return requestJSON(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function submitMessage(raw, action) {
  const message = raw.trim();
  if (!message || chatBusy || bookingBusy) return;

  chatBusy = true;
  sendButton.disabled = true;
  quickButtons.forEach(button => { button.disabled = true; });
  chatProgress.textContent = 'O Muvinho está respondendo…';
  closeBooking(false);
  appendMessage(message, 'user');

  try {
    const result = await postJSON('/api/chat', { message, history, action });
    if (typeof result.reply !== 'string' || !result.reply.trim()) {
      throw new Error('O servidor não enviou uma resposta. Tente novamente.');
    }
    history.push({ role: 'user', text: message }, { role: 'assistant', text: result.reply.slice(0, 500) });
    if (history.length > 8) history.splice(0, history.length - 8);
    appendMessage(result.reply, 'assistant', sourceLabel(result, action));
    if (result.nextAction === 'schedule') openBooking(!messageInput.value);
  } catch (error) {
    appendMessage(error.status ? error.message : 'Não consegui responder agora. Tente enviar sua mensagem novamente.', 'assistant');
    if (!messageInput.value) messageInput.value = message;
  } finally {
    chatBusy = false;
    chatProgress.textContent = '';
    sendButton.disabled = false;
    quickButtons.forEach(button => { button.disabled = false; });
  }
}

function resetSelect(select, label) {
  const option = new Option(label, '', true, true);
  option.disabled = true;
  select.replaceChildren(option);
}

function updateBookingCopy(mode) {
  const demo = mode === 'demo';
  bookingTitle.textContent = demo ? 'Simular agendamento' : 'Agendar aula';
  bookingDescription.textContent = demo
    ? 'Escolha uma data, uma modalidade e um horário para testar o atendimento.'
    : 'Escolha uma data, uma modalidade e um horário.';
  bookingConfirm.textContent = demo ? 'Confirmar simulação' : 'Confirmar reserva';
}

function showSessions() {
  resetSelect(bookingSession, 'Escolha um horário');
  bookingSession.disabled = true;
  bookingConfirm.disabled = true;
  if (!catalog || !bookingClass.value) return;

  const sessions = catalog.sessions.filter(session => session.classId === bookingClass.value);
  if (!sessions.length) {
    bookingStatus.textContent = 'Essa modalidade não tem sessão nessa data. Escolha outra data ou modalidade.';
    return;
  }

  for (const session of sessions) {
    const vacancies = session.available === 1 ? '1 vaga' : `${session.available} vagas`;
    const option = new Option(`${session.time} · ${session.available > 0 ? vacancies : 'Lotado'}`, session.id);
    option.disabled = session.available <= 0;
    bookingSession.add(option);
  }
  bookingSession.disabled = !sessions.some(session => session.available > 0);
  bookingStatus.textContent = bookingSession.disabled
    ? 'Todas as sessões dessa modalidade estão lotadas na data escolhida.'
    : catalog.mode === 'atlas'
      ? 'A confirmação registra a reserva e ocupa uma vaga nessa data.'
      : 'A confirmação conclui a simulação sem ocupar uma vaga.';
}

async function loadCatalog() {
  const previousClass = bookingClass.value;
  catalogRequest?.abort();
  catalog = undefined;
  resetSelect(bookingClass, 'Escolha uma modalidade');
  bookingClass.disabled = true;
  showSessions();
  if (!bookingDate.value || !bookingDate.validity.valid) {
    bookingStatus.textContent = 'Escolha a data de hoje ou uma data futura.';
    return;
  }

  const controller = new AbortController();
  catalogRequest = controller;
  bookingStatus.textContent = 'Consultando aulas e vagas…';
  try {
    const result = await requestJSON(`/api/catalog?date=${encodeURIComponent(bookingDate.value)}`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    if (!['atlas', 'demo'].includes(result.mode) || !Array.isArray(result.classes) || !Array.isArray(result.sessions)) throw new Error();
    catalog = result;
    updateBookingCopy(result.mode);
    for (const item of catalog.classes) bookingClass.add(new Option(item.name, item.id));
    bookingClass.disabled = catalog.classes.length === 0;
    bookingStatus.textContent = bookingClass.disabled
      ? 'Nenhuma modalidade disponível para consulta.'
      : catalog.mode === 'atlas' ? 'Escolha a modalidade para consultar os horários cadastrados.' : 'Escolha a modalidade para consultar os horários de demonstração.';
    if (catalog.classes.some(item => item.id === previousClass)) {
      bookingClass.value = previousClass;
      showSessions();
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      bookingStatus.textContent = error.status ? error.message : 'Não consegui consultar as aulas. Feche e abra o agendamento para tentar novamente.';
    }
  }
}

function openBooking(focusHeading = true) {
  booking.hidden = false;
  updateBookingCopy(catalog?.mode);
  bookingDate.min = today();
  if (!bookingDate.value || bookingDate.value < bookingDate.min) bookingDate.value = bookingDate.min;
  if (focusHeading) bookingTitle.focus();
  void loadCatalog();
}

function closeBooking(restoreFocus = true) {
  booking.hidden = true;
  catalogRequest?.abort();
  if (restoreFocus) scheduleAction.focus();
}

bookingForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (bookingBusy || chatBusy || !catalog || !bookingSession.value || !bookingDate.validity.valid) return;
  const reserve = catalog.mode === 'atlas';
  bookingBusy = true;
  const fields = [bookingDate, bookingClass, bookingSession, bookingConfirm, bookingClose, sendButton, ...quickButtons];
  fields.forEach(field => { field.disabled = true; });
  bookingStatus.textContent = reserve ? 'Registrando a reserva…' : 'Conferindo os dados da simulação…';

  try {
    const result = await postJSON(reserve ? '/api/reservas' : '/api/simulate', {
      date: bookingDate.value,
      sessionId: bookingSession.value,
      confirmed: true,
    });
    const succeeded = reserve ? result.reserved === true && typeof result.booking?.code === 'string' : result.simulated === true;
    if (!succeeded || typeof result.reply !== 'string' || !result.reply.trim()) throw new Error();
    closeBooking(false);
    appendMessage(result.reply, 'assistant', reserve ? 'Reserva registrada' : 'Simulação de agendamento');
    messageInput.focus();
  } catch (error) {
    await loadCatalog();
    bookingStatus.textContent = error.status ? error.message : reserve
      ? 'Não consegui confirmar se a reserva foi registrada. Tente novamente.'
      : 'Não consegui concluir a simulação. Tente novamente.';
  } finally {
    bookingBusy = false;
    bookingDate.disabled = false;
    bookingClose.disabled = false;
    sendButton.disabled = false;
    quickButtons.forEach(button => { button.disabled = false; });
  }
});

bookingDate.addEventListener('change', loadCatalog);
bookingClass.addEventListener('change', showSessions);
bookingSession.addEventListener('change', () => { bookingConfirm.disabled = !bookingSession.value; });
bookingClose.addEventListener('click', () => closeBooking());

chatForm.addEventListener('submit', event => {
  event.preventDefault();
  if (chatBusy || bookingBusy || !messageInput.value.trim()) return;
  const message = messageInput.value;
  messageInput.value = '';
  void submitMessage(message);
});

for (const button of quickButtons) {
  button.addEventListener('click', () => {
    const { action, question } = button.dataset;
    if (action === 'schedule') openBooking();
    else void submitMessage(question, action);
  });
}

messageInput.disabled = false;
sendButton.disabled = false;
