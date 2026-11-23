import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { onRequest as catalog } from "../functions/api/catalog.js";
import { onRequest as reserve } from "../functions/api/reservas.js";
import { onRequest as horarios } from "../functions/api/horarios.js";

const env = { MONGODB_URI: "mongodb://fake.test:27017/" };
const date = "2099-11-26";
const sessionId = "funcional";
const payload = { date, sessionId, confirmed: true };
const url = "https://movefit.test";

// Executa a rota como o navegador faria, sem abrir o servidor nem acessar o banco real.
function call(route, path, { cookie, body, origin = url, bindings = env } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  if (body) {
    headers.set("Content-Type", "application/json");
    headers.set("Origin", origin);
  }
  return route({
    env: bindings,
    request: new Request(url + path, body ? { method: "POST", headers, body: JSON.stringify(body) } : { headers }),
  });
}

async function startVisitor() {
  const response = await call(catalog, `/api/catalog?date=${date}`);
  assert.equal(response.status, 200);
  const cookie = response.headers.get("Set-Cookie");
  assert.match(cookie, /; Path=\/api;/);
  assert.match(cookie, /; HttpOnly; SameSite=Lax; Secure$/);
  return cookie.split(";")[0];
}

function mockAtlas(t) {
  // O mapa representa os documentos de reserva. Cada atualização aplica os filtros antes de gravar.
  const documents = new Map();
  const aulas = [{ codigo: "funcional", nome: "Funcional", ativo: true }];
  const horarios = [
    { codigo: sessionId, aulaCodigo: "funcional", diaSemana: 4, horario: "18:00", vagasTotais: 3, vagasDisponiveis: 2, ativo: true },
    { codigo: "lotada", aulaCodigo: "funcional", diaSemana: 4, horario: "19:00", vagasTotais: 1, vagasDisponiveis: 0, ativo: true },
  ];
  const reservas = {
    async updateOne(filter, update, options) {
      const id = filter._id;
      if (options?.upsert) {
        assert.deepEqual(Object.keys(filter), ["_id"]);
        if (!documents.has(id)) documents.set(id, structuredClone(update.$setOnInsert));
        return { modifiedCount: 0 };
      }
      const document = documents.get(id);
      assert.deepEqual(filter.$expr.$lt[0], { $size: "$reservas" });
      const visitors = filter["reservas.visitante"].$nin;
      assert.ok(visitors.includes(update.$push.reservas.visitante));
      if (document.reservas.length >= filter.$expr.$lt[1] ||
          document.reservas.some(item => visitors.includes(item.visitante))) {
        return { modifiedCount: 0 };
      }
      document.reservas.push(update.$push.reservas);
      return { modifiedCount: 1 };
    },
    async findOne(filter, options) {
      assert.deepEqual(options.projection, { _id: 1 });
      const visitors = filter["reservas.visitante"].$in;
      const exists = documents.get(filter._id)?.reservas.some(item => visitors.includes(item.visitante));
      return exists ? { _id: filter._id } : null;
    },
    aggregate(pipeline) {
      const ids = pipeline[0].$match._id.$in;
      assert.deepEqual(pipeline[1].$project, { _id: 0, sessaoId: 1, total: { $size: "$reservas" } });
      return { toArray: async () => ids.filter(id => documents.has(id)).map(id => {
        const doc = documents.get(id);
        return { sessaoId: doc.sessaoId, total: doc.reservas.length };
      }) };
    },
  };
  t.mock.method(MongoClient.prototype, "db", () => ({
    collection(name) {
      if (name === "reservas") return reservas;
      return { find: () => ({ sort: () => ({ limit: () => ({ toArray: async () => name === "aulas" ? aulas : horarios }) }) }) };
    },
  }));
  return documents;
}

test("reservas concorrentes respeitam o limite, deduplicam por visitante e atualizam vagas somente na data", async t => {
  const documents = mockAtlas(t);
  const cookies = await Promise.all([startVisitor(), startVisitor(), startVisitor()]);
  const initial = await call(reserve, "/api/reservas", {
    cookie: cookies[0],
    body: { ...payload, nome: "Pessoa Fictícia" },
  });
  assert.equal(initial.status, 201);
  const first = await initial.json();
  assert.equal(first.reserved, true);
  assert.equal(first.booking.date, date);
  const [duplicate, ...contenders] = await Promise.all(
    cookies.map(cookie => call(reserve, "/api/reservas", { cookie, body: payload })),
  );
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: "Este navegador já tem uma reserva nesta sessão." });
  assert.deepEqual(contenders.map(result => result.status).sort(), [201, 409]);
  assert.match((await contenders.find(result => result.status === 409).json()).error, /sem vagas/);
  const stored = documents.get(`${date}:${sessionId}`).reservas;
  assert.equal(stored.length, 2);
  assert.deepEqual(Object.keys(stored[0]).sort(), ["codigo", "visitante"]);
  assert.match(stored[0].visitante, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(first).includes(stored[0].visitante));
  const persisted = await call(catalog, `/api/catalog?date=${date}`, { cookie: cookies[0] });
  assert.equal(persisted.headers.get("Set-Cookie"), null);
  assert.equal((await persisted.json()).sessions[0].available, 0);
  const dated = await call(horarios, `/api/horarios?data=${date}&aula=funcional`);
  assert.equal((await dated.json()).horarios[0].vagasDisponiveis, 0);
  const followingDate = "2099-12-03";
  const nextWeek = await call(catalog, `/api/catalog?date=${followingDate}`);
  const nextCatalog = await nextWeek.json();
  assert.equal(nextCatalog.sessions[0].available, 2);
  assert.ok(!JSON.stringify(nextCatalog).includes(first.booking.code));
  // O mesmo visitante recebe um hash diferente se reservar a mesma aula em outra data.
  const anotherDate = await call(reserve, "/api/reservas", {
    cookie: cookies[0],
    body: { ...payload, date: followingDate },
  });
  assert.equal(anotherDate.status, 201);
  const nextStored = documents.get(`${followingDate}:${sessionId}`).reservas;
  assert.notEqual(nextStored[0].visitante, stored[0].visitante);
});

test("a reserva existente com hash antigo continua valendo sem revelar seu código", async t => {
  const documents = mockAtlas(t);
  const cookie = await startVisitor();
  const visitor = cookie.slice(cookie.indexOf("=") + 1);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(visitor));
  const legacy = { codigo: "codigo-da-reserva-anterior", visitante: Buffer.from(digest).toString("hex") };
  documents.set(`${date}:${sessionId}`, { data: date, sessaoId: sessionId, reservas: [legacy] });

  const duplicate = await call(reserve, "/api/reservas", { cookie, body: payload });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: "Este navegador já tem uma reserva nesta sessão." });
  assert.deepEqual(documents.get(`${date}:${sessionId}`).reservas, [legacy]);
});

test("a rota rejeita origem externa, sessão inválida, vaga zero e pedidos sem confirmação", async t => {
  const documents = mockAtlas(t);
  const cookie = await startVisitor();
  for (const [options, status] of [
    [{ body: payload }, 400],
    [{ body: payload, cookie, origin: "https://outro.test" }, 403],
    [{ body: { ...payload, confirmed: false }, cookie }, 400],
    [{ body: { ...payload, date: "2099-02-30" }, cookie }, 400],
    [{ body: { ...payload, date: "2000-01-01" }, cookie }, 400],
    [{ body: { ...payload, sessionId: "inexistente" }, cookie }, 404],
    [{ body: { ...payload, sessionId: "lotada" }, cookie }, 409],
    [{ body: payload, cookie, bindings: {} }, 503],
  ]) {
    assert.equal((await call(reserve, "/api/reservas", options)).status, status);
  }
  assert.equal(documents.size, 0);
});
