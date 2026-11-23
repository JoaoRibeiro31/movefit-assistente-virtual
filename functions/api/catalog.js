import { availableSessionsOnDate, localDateTime, parseDate, readCatalog } from "../../server/catalog.js";
import { endpoint, json } from "../../server/http.js";
import { bookingVisitor, newBookingCookie } from "../../server/reservations.js";

export const onRequest = endpoint("GET", async ({ request, env }) => {
  // O formulário tem uma data selecionada. Sem parâmetro, usa o dia atual em São Paulo.
  const now = localDateTime();
  const date = new URL(request.url).searchParams.get("date") ?? now.date;
  parseDate(date);
  const catalog = await readCatalog(env);
  const sessions = await availableSessionsOnDate(env, catalog, date, now);
  // Só a reserva registrada no Atlas precisa identificar o navegador.
  const headers = catalog.mode === "atlas" && !bookingVisitor(request)
    ? { "Set-Cookie": newBookingCookie(request) }
    : {};
  // O contrato público é explícito para impedir que novos campos internos sejam expostos.
  return json({ mode: catalog.mode, hours: catalog.hours, classes: catalog.classes, date, sessions }, 200, headers);
});
