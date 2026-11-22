import { localDateTime, parseDate, readCatalog, sessionsOnDate } from "../../server/catalog.js";
import { endpoint } from "../../server/http.js";

export const onRequest = endpoint("GET", async ({ request, env }) => {
  const now = localDateTime();
  const date = new URL(request.url).searchParams.get("date") ?? now.date;
  parseDate(date);
  const catalog = await readCatalog(env);
  return { ...catalog, date, sessions: sessionsOnDate(catalog, date, now) };
});
