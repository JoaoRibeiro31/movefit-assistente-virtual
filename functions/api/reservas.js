import { formatDate, localDateTime, parseDate, readCatalog, sessionsOnDate, validCode } from "../../server/catalog.js";
import { endpoint, json, readJson, RequestError } from "../../server/http.js";
import { bookingVisitor, reserveSession } from "../../server/reservations.js";

export const onRequest = endpoint("POST", async ({ request, env }) => {
  const { date, sessionId, confirmed } = await readJson(request);
  parseDate(date);
  const now = localDateTime();
  if (date < now.date) throw new RequestError(400, "Escolha hoje ou uma data futura.");
  if (!validCode(sessionId)) throw new RequestError(400, "Selecione uma sessão válida.");
  if (confirmed !== true) throw new RequestError(400, "Confirme a reserva antes de continuar.");
  const visitor = bookingVisitor(request);
  if (!visitor) throw new RequestError(400, "Consulte os horários neste navegador antes de confirmar a reserva.");

  const catalog = await readCatalog(env, { atlasOnly: true });
  const session = sessionsOnDate(catalog, date, now).find(item => item.id === sessionId);
  if (!session) throw new RequestError(404, "Esta sessão não está disponível na data e no horário selecionados.");
  const code = await reserveSession(env, { date, session, visitor });
  const { id, classId, className, time } = session;
  return json({
    reserved: true,
    booking: { code, date, session: { id, classId, className, time } },
    reply: `Reserva registrada: ${className}, em ${formatDate(date)} às ${time}. Código: ${code}.`,
  }, 201);
});
