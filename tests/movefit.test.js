import assert from "node:assert/strict";
import test from "node:test";
import { MongoClient } from "mongodb";
import { onRequest as catalog } from "../functions/api/catalog.js";
import { onRequest as chat } from "../functions/api/chat.js";
import { onRequest as health } from "../functions/api/health.js";
import { onRequest as simulate } from "../functions/api/simulate.js";
import { localDateTime } from "../server/catalog.js";

async function call(route, { query = "", payload, env = {} } = {}) {
  // Chama a função do Pages em memória. Os testes não publicam nada nem consomem a cota da IA.
  const request = new Request(`https://movefit.test/api${query}`, payload === undefined ? {} : {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://movefit.test" },
    body: JSON.stringify(payload),
  });
  const response = await route({ request, env });
  return { status: response.status, body: await response.json() };
}

function nextWeekday(day) {
  // Usa a próxima semana completa para que a hora do teste não esconda sessões já encerradas.
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
    ["bike-qui-1900", 14], ["muay-thai-qui-1900", 12],
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

test("o Gemini classifica pedidos de treino e o servidor valida as orientações", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
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
  assert.equal(fetch.mock.callCount(), 1);
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

test("o Gemini recebe apenas nomes e IDs do catálogo e a API lista os horários", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async (_url, options) => {
    const request = JSON.parse(options.body);
    assert.match(request.systemInstruction.parts[0].text, /"id":"funcional","name":"Funcional"/);
    assert.doesNotMatch(request.systemInstruction.parts[0].text, /funcional-qui-1800|academyHours|"capacity"|"available"/);
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

test("o chat limita o contexto do Gemini e remove identificadores comuns da entrada e da resposta", async t => {
  const key = "segredo-ficticio-de-teste";
  const email = "pessoa@example.com";
  const phone = "(11) 90000-0000";
  const cpf = "123.456.789-00";
  const mongoUri = "mongodb+srv://usuario:segredo@example.com";
  const code = "11111111-2222-4333-8444-555555555555";
  let contents;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    contents = JSON.parse(options.body).contents;
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        intent: "general", classId: "", date: "", reply: `Olá! ${key} ${email} ${code}`,
      }) }] } }],
    });
  });

  const result = await call(chat, {
    env: { GEMINI_API_KEY: key },
    payload: {
      message: `Funcional em 2029-10-16? ${email} ${phone} ${key} ${code}`,
      history: [
        { role: "user", text: `Posso ver os horários? CPF ${cpf}` },
        { role: "user", text: `Tenho dor no joelho. ${mongoUri}` },
        { role: "user", text: `Preciso de ajuda. ${mongoUri}` },
        { role: "assistant", text: "Resposta anterior do Muvinho" },
      ],
    },
  });

  assert.equal(result.status, 200);
  const context = JSON.parse(contents[0].parts[0].text);
  assert.match(context.question, /^Funcional em 2029-10-16\?/);
  assert.deepEqual(context.previousQuestions, [
    "Posso ver os horários? CPF [dado removido]",
    "Preciso de ajuda. [dado removido]",
  ]);
  for (const secret of [key, email, phone, cpf, mongoUri, code]) {
    assert.ok(!JSON.stringify(contents).includes(secret));
    assert.ok(!result.body.reply.includes(secret));
  }
});

test("quando o Gemini configurado falha, o atendimento continua pelas regras locais", async t => {
  const warn = t.mock.method(console, "warn", () => {});
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({
    error: {
      message: "detalhe privado do provedor",
      details: [{ reason: "API_KEY_SERVICE_BLOCKED" }],
    },
  }, { status: 403 }));
  const warmup = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key" },
    payload: { message: "Como posso me aquecer antes do treino?", action: "warmup" },
  });
  assert.equal(warmup.status, 200);
  assert.equal(warmup.body.mode, "demo");
  assert.match(warmup.body.reply, /aquecimento|5 a 10 minutos/i);
  assert.equal(fetch.mock.callCount(), 1);

  const result = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key" },
    payload: { message: "Como começo a treinar?" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "demo");
  assert.match(result.body.reply, /começando|nível/i);
  assert.equal(fetch.mock.callCount(), 2);

  const general = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key" },
    payload: { message: "Olá, como você pode me ajudar?" },
  });
  assert.equal(general.status, 200);
  assert.equal(general.body.mode, "demo");
  assert.match(general.body.reply, /horários/i);
  assert.equal(fetch.mock.callCount(), 3);
  assert.match(warn.mock.calls[0].arguments[0], /HTTP 403 \(API_KEY_SERVICE_BLOCKED\)/);
  assert.doesNotMatch(warn.mock.calls[0].arguments[0], /detalhe privado/);
});

test("uma pergunta aberta recebe a resposta do Gemini pelo modelo alternativo quando o primeiro está indisponível", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async url => {
    if (url.endsWith("/gemini-3.5-flash-lite:generateContent")) {
      return new Response(null, { status: 503 });
    }
    return Response.json({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        intent: "general", classId: "", date: "", reply: "Exercícios aeróbicos sustentam o esforço por mais tempo.",
      }) }] } }],
    });
  });
  const result = await call(chat, {
    env: { GEMINI_API_KEY: "fake-test-key", GEMINI_MODEL: "models/gemini-3.5-flash-lite" },
    payload: { message: "O que é um exercício aeróbico?" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "gemini");
  assert.match(result.body.reply, /sustentam o esforço/);
  assert.equal(fetch.mock.callCount(), 2);
  assert.match(fetch.mock.calls[1].arguments[0], /\/gemini-3\.1-flash-lite:generateContent$/);
});

test("o chat responde à pergunta aberta com Gemini mesmo quando o catálogo está indisponível", async t => {
  t.mock.method(MongoClient.prototype, "db", () => { throw new Error("falha simulada no catálogo"); });
  t.mock.method(globalThis, "fetch", async () => Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      intent: "general", classId: "", date: "", reply: "Exercícios aeróbicos sustentam o esforço por mais tempo.",
    }) }] } }],
  }));
  const env = { MONGODB_URI: "mongodb://fake.test:27017/", GEMINI_API_KEY: "fake-test-key" };
  const result = await call(chat, { env, payload: { message: "O que é um exercício aeróbico?" } });
  assert.equal(result.status, 200);
  assert.equal(result.body.mode, "gemini");
  assert.equal(result.body.dataMode, "unavailable");
  assert.match(result.body.reply, /sustentam o esforço/);

  const classes = await call(chat, { env, payload: { message: "Quais aulas vocês oferecem?", action: "classes" } });
  assert.equal(classes.status, 502);
  assert.match(classes.body.error, /catálogo está indisponível/);
});
