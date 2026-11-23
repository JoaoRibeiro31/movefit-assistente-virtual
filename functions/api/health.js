import { dataMode } from "../../server/catalog.js";
import { endpoint } from "../../server/http.js";

// Indica presença da configuração, sem chamar os serviços nem devolver valores de credenciais.
export const onRequest = endpoint("GET", ({ env }) => ({
  gemini: env.GEMINI_API_KEY?.trim() ? "configured" : "demo",
  catalog: dataMode(env) === "atlas" ? "configured" : "demo",
}));
