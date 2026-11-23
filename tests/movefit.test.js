import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as catalog } from "../functions/api/catalog.js";
import { onRequest as chat } from "../functions/api/chat.js";
import { onRequest as health } from "../functions/api/health.js";
import { onRequest as simulate } from "../functions/api/simulate.js";
import { localDateTime } from "../server/catalog.js";

async function call(route, { query = "", payload, env = {} } = {}) {
  const request = new Request(`https://movefit.test/api${query}`, payload === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://movefit.test" },
    body: JSON.stringify(payload),
  });
  const response = await route({ request, env });
  return { status: response.status, body: await response.json() };
}

function nextWeekday(day) {
  const date = new Date(`${localDateTime().date}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + (day - date.getUTCDay() + 7) % 7 + 7);
  return date.toISOString().slice(0, 10);
}

test("o modo demonstrativo informa horários da academia e não exige segredos", async () => {
  assert.deepEqual(await call(health), { status: 200, body: { gemini: "demo", catalog: "demo" } });
  const result = await call(chat, { payload: { message: "Quais são os horários?" } });
  assert.equal(result.body.mode, "demo");
  assert.match(result.body.reply, /Segunda a sexta: 06:00 às 23:00/);
});

test("o catálogo lista modalidades e sessões da data consultada, incluindo a lotada", async () => {
  const date = nextWeekday(4);
  const result = await call(catalog, { query: `?date=${date}` });
  assert.equal(result.status, 200);
  assert.equal(result.body.date, date);
  assert.equal(result.body.mode, "demo");
  assert.ok(result.body.classes.some(item => item.name === "Bike Indoor"));
  assert.deepEqual(result.body.sessions.map(({ id, available }) => [id, available]), [
    ["pilates-qui-1000", 0], ["funcional-qui-1800", 10],
  ]);
  assert.equal((await call(catalog, { query: "?date=2029-02-30" })).status, 400);
});

test("aquecimento e treino recebem exemplos gerais, e dor interrompe a orientação e o agendamento", async () => {
  const warmup = await call(chat, { payload: { message: "Como faço aquecimento?", action: "warmup" } });
  assert.match(warmup.body.reply, /movimentos leves/);
  const workout = await call(chat, { payload: { message: "Quero uma sugestão de treino para iniciantes." } });
  assert.match(workout.body.reply, /exemplo geral/);
  const healthResult = await call(chat, {
    env: { GEMINI_API_KEY: "unused-test-key" },
    payload: { message: "Estou com dor no joelho e quero agendar Pilates." },
  });
  assert.equal(healthResult.status, 200);
  assert.match(healthResult.body.reply, /profissional/);
  assert.equal(healthResult.body.nextAction, undefined);
});

test("o chat pede nível e objetivo e usa a resposta para dar exemplos práticos", async () => {
  const question = "Quero uma sugestão de treino.";
  const first = await call(chat, { payload: { message: question } });
  assert.match(first.body.reply, /começando ou já treina regularmente/);
  assert.match(first.body.reply, /força, condicionamento ou mobilidade/);

  const followUp = await call(chat, {
    payload: {
      message: "Sou iniciante e quero melhorar o fôlego.",
      history: [{ role: "user", text: question }, { role: "assistant", text: first.body.reply }],
    },
  });
  assert.match(followUp.body.reply, /caminhada, bicicleta ergométrica ou dança/);
  assert.match(followUp.body.reply, /começando/);
});

test("uma lesão mencionada antes impede exemplos de treino na continuação", async () => {
  const result = await call(chat, {
    payload: {
      message: "Tem exercícios para fortalecer?",
      history: [{ role: "user", text: "Estou me recuperando de uma lesão." }],
    },
  });
  assert.match(result.body.reply, /profissional/);
  assert.doesNotMatch(result.body.reply, /cadeira firme|flexão/);
});

test("a intenção de treino do Gemini usa os exemplos gerais validados pelo servidor", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      intent: "workout", classId: "", date: "", reply: "Faça 150 flexões diárias.",
    }) }] } }],
  }));
  const result = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key" },
    payload: { message: "Quero exercícios de força, já treino regularmente." },
  });
  assert.equal(result.body.mode, "gemini");
  assert.match(result.body.reply, /remada no aparelho, leg press e supino em máquina/);
  assert.doesNotMatch(result.body.reply, /150 flexões/);
});

test("a simulação exige confirmação, dia correto e vaga, sem alterar a disponibilidade", async () => {
  const booking = await call(chat, { payload: { message: "Quero agendar Pilates." } });
  assert.equal(booking.body.nextAction, "schedule");
  const date = nextWeekday(4);
  const payload = { date, sessionId: "funcional-qui-1800", confirmed: true };
  assert.equal((await call(simulate, { payload: { ...payload, confirmed: false } })).status, 400);
  assert.equal((await call(simulate, { payload: { ...payload, sessionId: "pilates-qui-1000" } })).status, 409);
  assert.equal((await call(simulate, { payload: { ...payload, date: nextWeekday(5) } })).status, 404);
  const result = await call(simulate, { payload });
  assert.equal(result.status, 200);
  assert.equal(result.body.simulated, true);
  assert.match(result.body.reply, /Nenhuma reserva real/);
  const after = await call(catalog, { query: `?date=${date}` });
  assert.equal(after.body.sessions.find(item => item.id === payload.sessionId).available, 10);
});

test("o Gemini recebe dados do catálogo e a API produz a listagem com os horários cadastrados", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.systemInstruction.parts[0].text, /funcional-qui-1800/);
    return Response.json({
      candidates: [{ content: { parts: [{
        text: JSON.stringify({ intent: "schedule", classId: "funcional", date: "", reply: "Hora inventada: 23:59" }),
      }] } }],
    });
  });
  const result = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key" },
    payload: { message: "Quando posso fazer funcional?" },
  });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "gemini");
  assert.equal(result.body.dataMode, "demo");
  assert.match(result.body.reply, /Funcional, quinta-feira às 18:00/);
  assert.doesNotMatch(result.body.reply, /23:59|Pilates/);
});

test("quando o Gemini configurado falha, a API sinaliza indisponibilidade", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 403 }));
  const result = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key" },
    payload: { message: "Como começo a treinar?" },
  });
  assert.equal(result.status, 502);
  assert.match(result.body.error, /Gemini/);
});
