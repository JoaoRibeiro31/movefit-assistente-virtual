import { availableSessionsOnDate, formatDate, localDateTime, parseDate, readCatalog, validCode } from "../../server/catalog.js";
import { endpoint, readJson, RequestError } from "../../server/http.js";

export const onRequest = endpoint("POST", async ({ request, env }) => {
  const { date, sessionId, confirmed } = await readJson(request);
  parseDate(date);
  const now = localDateTime();
  if (date < now.date) throw new RequestError(400, "Escolha hoje ou uma data futura.");
  if (!validCode(sessionId)) throw new RequestError(400, "Selecione uma sessão válida.");
  if (confirmed !== true) throw new RequestError(400, "Confirme a simulação antes de continuar.");

  const catalog = await readCatalog(env);
  const sessions = await availableSessionsOnDate(env, catalog, date, now);
  const session = sessions.find(item => item.id === sessionId);
  if (!session) throw new RequestError(404, "Esta sessão não está disponível na data e no horário selecionados.");
  if (session.available === 0) throw new RequestError(409, "Esta sessão está sem vagas. Escolha outro horário.");

  return {
    simulated: true,
    date,
    session,
    mode: catalog.mode,
    reply: `Simulação concluída: ${session.className}, em ${formatDate(date)} às ${session.time}. Nenhuma reserva real foi efetuada.`,
  };
});
