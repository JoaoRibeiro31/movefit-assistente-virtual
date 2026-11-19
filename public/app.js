// RASCUNHO: somente interface demonstrativa. A integração com Gemini será
// implementada no backend (Cloudflare Pages Functions) pela equipe.
const form = document.querySelector('#chat-form');
const input = document.querySelector('#user-input');
const messages = document.querySelector('#messages');
const quickButtons = document.querySelectorAll('[data-question]');

function addMessage(text, role = 'assistant') {
  const element = document.createElement('div');
  element.className = `message ${role}`;
  element.textContent = text; // Evita interpretar conteúdo digitado como HTML.
  messages.appendChild(element);
  messages.scrollTop = messages.scrollHeight;
}

function getDemoResponse(question) {
  const text = question.toLocaleLowerCase('pt-BR');
  if (text.includes('horário') || text.includes('aula')) {
    if (text.includes('agendar')) return 'Posso demonstrar o fluxo de agendamento, mas ainda não consigo reservar vagas. A integração será implementada pela equipe.';
    return 'Os horários ainda serão cadastrados pela equipe. Não vou inventar informações sobre aulas.';
  }
  if (text.includes('agendar') || text.includes('reserva')) return 'O agendamento ainda é demonstrativo. A confirmação real de vagas será implementada em outra etapa.';
  if (text.includes('aquec')) return 'Como orientação geral, o aquecimento pode incluir movimentos leves e progressivos. Para uma orientação individual, consulte o profissional de Educação Física.';
  if (text.includes('iniciante') || text.includes('exercício') || text.includes('treino')) return 'Para iniciantes, é importante começar gradualmente e aprender a execução com acompanhamento profissional. As sugestões específicas ainda serão desenvolvidas.';
  if (text.includes('dor') || text.includes('lesão')) return 'Se você está com dor ou lesão, procure um profissional de saúde ou Educação Física qualificado. Não posso avaliar sua condição.';
  return 'Ainda estou no modo demonstrativo! Em breve, a equipe conectará a IA generativa para responder a mais perguntas.';
}

function submitDemoMessage(text) {
  const cleaned = text.trim();
  if (!cleaned) return;
  addMessage(cleaned, 'user');
  addMessage(getDemoResponse(cleaned));
}

form.addEventListener('submit', event => {
  event.preventDefault();
  submitDemoMessage(input.value);
  input.value = '';
  input.focus();
});
quickButtons.forEach(button => button.addEventListener('click', () => submitDemoMessage(button.dataset.question)));
