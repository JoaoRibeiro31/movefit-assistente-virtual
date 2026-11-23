import { availableSessionsOnDate, localDateTime, parseDate, readCatalog } from "../../server/catalog.js";
import { endpoint, json } from "../../server/http.js";
import { bookingVisitor, newBookingCookie } from "../../server/reservations.js";

export const onRequest = endpoint("GET", async ({ request, env }) => {
  const now = localDateTime();
  const date = new URL(request.url).searchParams.get("date") ?? now.date;
  parseDate(date);
  const catalog = await readCatalog(env);
  const sessions = await availableSessionsOnDate(env, catalog, date, now);
  const headers = catalog.mode === "atlas" && !bookingVisitor(request)
    ? { "Set-Cookie": newBookingCookie(request) }
    : {};
  return json({ ...catalog, date, sessions }, 200, headers);
});
