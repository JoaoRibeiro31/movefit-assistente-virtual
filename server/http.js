export class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export function endpoint(method, handler) {
  return async context => {
    if (context.request.method !== method) {
      return json({ error: "Método não permitido." }, 405, { Allow: method });
    }

    try {
      return json(await handler(context));
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      // Mensagens e exceções externas podem conter segredos ou texto de visitantes.
      console.error("MoveFIT: falha inesperada na API.");
      return json({ error: "Não consegui responder agora. Tente novamente." }, 500);
    }
  };
}

export async function readJson(request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new RequestError(403, "Origem não autorizada.");
  }
  const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" || !request.body) {
    throw new RequestError(415, "Envie os dados em JSON.");
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 24_000) {
      await reader.cancel();
      throw new RequestError(413, "A mensagem excede o tamanho permitido.");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new RequestError(400, "Os dados enviados são inválidos.");
  }
}
