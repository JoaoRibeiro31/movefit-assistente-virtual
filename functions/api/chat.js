import { answerChat, readChatInput } from "../../server/chat.js";
import { endpoint, readJson } from "../../server/http.js";

export const onRequest = endpoint("POST", async ({ request, env }) => {
  // A rota valida a mensagem e delega a decisão de atendimento ao servidor.
  const input = readChatInput(await readJson(request));
  return answerChat(env, input);
});
