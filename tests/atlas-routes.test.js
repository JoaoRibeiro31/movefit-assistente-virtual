import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { onRequest as aulas } from "../functions/api/aulas.js";
import { onRequest as horarios } from "../functions/api/horarios.js";

const env = { MONGODB_URI: "mongodb://fake.test:27017/", MONGODB_DB: "movefit" };

async function call(route, path, bindings = env, method = "GET") {
  const response = await route({ request: new Request(`https://movefit.test/api/${path}`, { method }), env: bindings });
  return { status: response.status, body: await response.json() };
}

test("aulas e horários retornam campos públicos e usam apenas as coleções esperadas", async t => {
  const queried = [];
  const collections = {
    aulas: [{ codigo: "AULA001", nome: "Funcional", duracaoMinutos: 50, campoPrivado: "omitir" }],
    horarios: [
      { codigo: "H01", aulaCodigo: "AULA001", diaSemana: 4, horario: "18:00", vagasTotais: 15, vagasDisponiveis: 0 },
      { codigo: "H02", aulaCodigo: "inexistente", diaSemana: 4, horario: "19:00", vagasTotais: 15, vagasDisponiveis: 3 },
    ],
  };
  t.mock.method(MongoClient.prototype, "db", function (name) {
    assert.equal(name, "movefit");
    assert.equal(this.options.tls, true);
    return {
      collection(collection) {
        queried.push(collection);
        return {
          find(filter, { projection }) {
            assert.deepEqual(filter.$or, [{ ativo: true }, { ativa: true }]);
            assert.equal(projection._id, 0);
            return { sort: () => ({ limit: () => ({ toArray: async () => collections[collection] }) }) };
          },
        };
      },
    };
  });

  assert.deepEqual(await call(aulas, "aulas"), {
    status: 200,
    body: { mode: "atlas", aulas: [{ codigo: "AULA001", nome: "Funcional", descricao: "", nivel: "", duracaoMinutos: 50 }] },
  });
  assert.deepEqual(queried, ["aulas"]);

  const result = await call(horarios, "horarios?aula=AULA001&data=2099-11-26");
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "atlas");
  assert.deepEqual(result.body.horarios, [{
    codigo: "H01", aulaCodigo: "AULA001", aulaNome: "Funcional", diaSemana: 4,
    horario: "18:00", vagasTotais: 15, vagasDisponiveis: 0,
  }]);
  assert.deepEqual(queried, ["aulas", "aulas", "horarios"]);
});

test("rotas Atlas validam entradas e falham sem exibir dados de exemplo ou detalhes da conexão", async t => {
  const db = t.mock.method(MongoClient.prototype, "db", () => { throw new Error("detalhe privado de teste"); });
  assert.equal((await call(aulas, "aulas", {})).status, 503);
  assert.equal((await call(horarios, "horarios?data=2099-02-30")).status, 400);
  assert.equal((await call(horarios, "horarios?aula=%24where")).status, 400);
  assert.equal((await call(aulas, "aulas", env, "POST")).status, 405);
  assert.equal((await call(aulas, "aulas", { ...env, MONGODB_URI: `${env.MONGODB_URI}?tlsInsecure=true` })).status, 502);
  assert.equal(db.mock.callCount(), 0);

  const result = await call(horarios, "horarios");
  assert.equal(result.status, 502);
  assert.doesNotMatch(result.body.error, /detalhe privado|fake\.test/);
});
