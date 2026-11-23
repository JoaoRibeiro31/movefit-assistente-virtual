import { withAtlas } from "./atlas.js";
import { RequestError } from "./http.js";

const cookieName = "movefit_visitor";
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const collectionName = "reservas";
const queryOperation = {
  label: "consulta de vagas no",
  message: "Não consegui consultar as vagas agora. Tente novamente em instantes.",
};
const writeOperation = {
  label: "gravação no",
  message: "Não consegui confirmar a reserva agora. Você pode tentar novamente.",
};

// O visitante recebe um identificador aleatório para reserva, sem cadastro ou login.
export function bookingVisitor(request) {
  const entry = request.headers.get("Cookie")
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`));
  const value = entry?.slice(cookieName.length + 1);
  return uuidPattern.test(value ?? "") ? value : null;
}

export function newBookingCookie(request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  // O navegador envia o cookie somente para as rotas da API, sem acesso pelo JavaScript da página.
  return `${cookieName}=${crypto.randomUUID()}; Path=/api; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}

// Cada data da grade semanal tem sua própria contagem de reservas.
function occurrenceId(date, sessionId) {
  return `${date}:${sessionId}`;
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function countReservations(env, date, sessions) {
  const ids = sessions.map(session => occurrenceId(date, session.id));
  return withAtlas(env, queryOperation, async db => {
    // A consulta de vagas precisa apenas do total e do código público da sessão.
    const results = await db.collection(collectionName, { readPreference: "primary" }).aggregate([
      { $match: { _id: { $in: ids } } },
      { $project: { _id: 0, sessaoId: 1, total: { $size: "$reservas" } } },
    ], { maxTimeMS: 4000 }).toArray();
    return new Map(results.map(({ sessaoId, total }) => [sessaoId, total]));
  });
}

export async function reserveSession(env, { date, session, visitor }) {
  if (session.available <= 0) {
    throw new RequestError(409, "Esta sessão está sem vagas. Escolha outro horário.");
  }

  const id = occurrenceId(date, session.id);
  // Vincula o hash à sessão e à data para reduzir a correlação entre reservas.
  // Consulta também o formato antigo para reconhecer reservas já gravadas.
  const visitorHash = await hash(`${id}:${visitor}`);
  const visitorHashes = [visitorHash, await hash(visitor)];
  const code = crypto.randomUUID();
  return withAtlas(env, writeOperation, async db => {
    const collection = db.collection(collectionName, {
      readPreference: "primary",
      writeConcern: { w: "majority" },
    });
    try {
      await collection.updateOne({ _id: id }, {
        $setOnInsert: { data: date, sessaoId: session.id, reservas: [] },
      }, { upsert: true });
    } catch (error) {
      // Outro pedido pode ter criado a mesma sessão enquanto este fazia o upsert.
      if (error?.code !== 11000) throw error;
    }

    // A checagem de vaga e de duplicidade está no mesmo comando que grava a reserva.
    const result = await collection.updateOne({
      _id: id,
      "reservas.visitante": { $nin: visitorHashes },
      $expr: { $lt: [{ $size: "$reservas" }, session.available] },
    }, {
      $push: {
        reservas: {
          codigo: code,
          visitante: visitorHash,
        },
      },
    });
    if (result.modifiedCount === 1) return code;

    // A consulta só confirma que há uma reserva anterior e evita reler seu código.
    const existing = await collection.findOne(
      { _id: id, "reservas.visitante": { $in: visitorHashes } },
      { projection: { _id: 1 } },
    );
    if (existing) {
      throw new RequestError(409, "Este navegador já tem uma reserva nesta sessão.");
    }
    throw new RequestError(409, "Esta sessão está sem vagas. Escolha outro horário.");
  });
}
