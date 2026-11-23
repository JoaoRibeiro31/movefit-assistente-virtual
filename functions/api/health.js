import { dataMode } from "../../server/catalog.js";
import { endpoint } from "../../server/http.js";

export const onRequest = endpoint("GET", ({ env }) => ({
  gemini: env.GEMINI_API_KEY?.trim() ? "configured" : "demo",
  catalog: dataMode(env) === "atlas" ? "configured" : "demo",
}));
