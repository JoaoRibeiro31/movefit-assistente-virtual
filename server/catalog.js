import sampleClasses from "../data/aulas.json" with { type: "json" };
import sampleSessions from "../data/horarios.json" with { type: "json" };
import { RequestError } from "./http.js";

export const hours = [
  { days: "Segunda a sexta", opens: "06:00", closes: "23:00" },
  { days: "Sábado", opens: "08:00", closes: "18:00" },
  { days: "Domingo e feriados", opens: "08:00", closes: "14:00" },
];

export const weekdays = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado",
];

const codePattern = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function localDateTime(now = new Date()) {
  const values = Object.fromEntries(clock.formatToParts(now).map(({ type, value }) => [type, value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

export function parseDate(date) {
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const value = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isNaN(+value) && value.toISOString().slice(0, 10) === date) return value;
  }
  throw new RequestError(400, "Informe uma data válida no formato AAAA-MM-DD.");
}

export function validCode(value) {
  return typeof value === "string" && codePattern.test(value);
}

export function dataMode(env) {
  return env.MONGODB_URI?.trim() ? "atlas" : "demo";
}

async function readAtlas(env) {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(env.MONGODB_URI.trim(), {
    maxPoolSize: 2,
    maxConnecting: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 5000,
  });
  try {
    const db = client.db(env.MONGODB_DB?.trim() || "movefit");
    const classes = db.collection("aulas")
      .find({ ativo: true }, { projection: { _id: 0, codigo: 1, nome: 1, descricao: 1, nivel: 1, duracao: 1 } })
      .sort({ codigo: 1 }).limit(75);
    const sessions = db.collection("horarios")
      .find({ ativo: true }, { projection: { _id: 0, codigo: 1, aulaCodigo: 1, diaSemana: 1, horario: 1, vagasTotais: 1, vagasDisponiveis: 1 } })
      .sort({ diaSemana: 1, horario: 1, codigo: 1 }).limit(200);

    return await Promise.all([classes.toArray(), sessions.toArray()]);
  } finally {
    await client.close();
  }
}

function publicClass(record) {
  return {
    id: record.codigo,
    name: record.nome.trim().slice(0, 120),
    description: typeof record.descricao === "string" ? record.descricao.trim().slice(0, 240) : "",
    level: typeof record.nivel === "string" ? record.nivel.trim().slice(0, 60) : "",
    duration: Number.isInteger(record.duracao) && record.duracao > 0 ? record.duracao : null,
  };
}

function validSession(record) {
  return validCode(record.codigo) && Number.isInteger(record.diaSemana) &&
    record.diaSemana >= 0 && record.diaSemana <= 6 &&
    typeof record.horario === "string" && timePattern.test(record.horario) &&
    Number.isSafeInteger(record.vagasTotais) && record.vagasTotais > 0 &&
    Number.isSafeInteger(record.vagasDisponiveis) && record.vagasDisponiveis >= 0 &&
    record.vagasDisponiveis <= record.vagasTotais;
}

export async function readCatalog(env) {
  const mode = dataMode(env);
  let records = [sampleClasses, sampleSessions];
  if (mode === "atlas") {
    try {
      records = await readAtlas(env);
    } catch {
      throw new RequestError(502, "A consulta ao catálogo está indisponível. Tente novamente em instantes.");
    }
  }

  const classes = records[0]
    .filter(record => record.ativo !== false && validCode(record.codigo) && typeof record.nome === "string" && record.nome.trim())
    .map(publicClass);
  const classById = new Map(classes.map(item => [item.id, item]));
  const sessions = records[1]
    .filter(record => record.ativo !== false && validSession(record) && classById.has(record.aulaCodigo))
    .map(record => ({
      id: record.codigo,
      classId: record.aulaCodigo,
      className: classById.get(record.aulaCodigo).name,
      weekday: record.diaSemana,
      time: record.horario,
      capacity: record.vagasTotais,
      available: record.vagasDisponiveis,
    }))
    .sort((first, second) => first.weekday - second.weekday || first.time.localeCompare(second.time));

  return { mode, hours, classes, sessions };
}

export function sessionsOnDate(catalog, date, now = localDateTime()) {
  const day = parseDate(date).getUTCDay();
  if (date < now.date) return [];
  return catalog.sessions
    .filter(session => session.weekday === day && (date !== now.date || session.time > now.time))
    .map(({ weekday, ...session }) => session);
}

export function formatDate(date) {
  return date.split("-").reverse().join("/");
}
