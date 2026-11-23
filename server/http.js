// Erros previstos carregam apenas uma mensagem escrita para o público.
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
      ...headers,
      // APIs podem devolver cookies ou comprovantes de reserva. Evite cache e uso em outros sites.
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// Todas as rotas usam a mesma validação de método e o mesmo tratamento de erros.
export function endpoint(method, handler) {
  return async context => {
    if (context.request.method !== method) {
      return json({ error: "Método não permitido." }, 405, { Allow: method });
    }

    try {
      const result = await handler(context);
      return result instanceof Response ? result : json(result);
    } catch (error) {
      if (error instanceof RequestError) return json({ error: error.message }, error.status);
      // Mensagens e exceções externas podem conter segredos ou texto de visitantes.
      console.error("MoveFIT: falha inesperada na API.");
      return json({ error: "Não consegui responder agora. Tente novamente." }, 500);
    }
  };
}

export async function readJson(request) {
  // Navegadores sinalizam requisições de outros sites. Clientes sem esses cabeçalhos
  // continuam sujeitos à validação do conteúdo e às regras de cada rota.
  const origin = request.headers.get("Origin");
  const site = request.headers.get("Sec-Fetch-Site");
  if ((origin && origin !== new URL(request.url).origin) || site === "cross-site" || site === "same-site") {
    throw new RequestError(403, "Origem não autorizada.");
  }
  const contentType = request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" || !request.body) {
    throw new RequestError(415, "Envie os dados em JSON.");
  }

  // Conte os bytes durante a leitura para aplicar o limite mesmo sem Content-Length.
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
