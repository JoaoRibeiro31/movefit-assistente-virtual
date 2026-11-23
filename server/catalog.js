import sampleClasses from "../data/aulas.json" with { type: "json" };
import sampleSessions from "../data/horarios.json" with { type: "json" };
import { RequestError } from "./http.js";
import { withAtlas } from "./atlas.js";
import { countReservations } from "./reservations.js";

// Horário de abertura da academia, separado da grade recorrente de aulas.
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

// Interpreta hoje e o horário atual no fuso da academia, mesmo em um servidor remoto.
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
    // A comparação evita aceitar datas que o JavaScript ajusta para outro dia.
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

// Aceita os dois nomes utilizados nos registros antigos e novos do catálogo.
const activeRecords = {
  $or: [{ ativo: true }, { ativa: true }],
  ativo: { $ne: false },
  ativa: { $ne: false },
};

async function readAtlas(env, includeSessions) {
  return withAtlas(env, {
    label: "consulta",
    message: "A consulta ao catálogo está indisponível. Tente novamente em instantes.",
  }, async db => {
    // Solicita somente os campos que fazem parte do catálogo público.
    const classes = db.collection("aulas")
      .find(activeRecords, {
        projection: { _id: 0, codigo: 1, nome: 1, descricao: 1, nivel: 1, duracao: 1, duracaoMinutos: 1 },
        maxTimeMS: 4000,
      })
      .sort({ codigo: 1 }).limit(75).toArray();
    if (!includeSessions) return [await classes, []];

    const sessions = db.collection("horarios")
      .find(activeRecords, {
        projection: { _id: 0, codigo: 1, aulaCodigo: 1, diaSemana: 1, horario: 1, vagasTotais: 1, vagasDisponiveis: 1 },
        maxTimeMS: 4000,
      })
      .sort({ diaSemana: 1, horario: 1, codigo: 1 }).limit(200).toArray();

    return await Promise.all([classes, sessions]);
  });
}

function publicClass(record) {
  const duration = record.duracaoMinutos ?? record.duracao;
  return {
    id: record.codigo,
    name: record.nome.trim().slice(0, 120),
    description: typeof record.descricao === "string" ? record.descricao.trim().slice(0, 240) : "",
    level: typeof record.nivel === "string" ? record.nivel.trim().slice(0, 60) : "",
    duration: Number.isInteger(duration) && duration > 0 ? duration : null,
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

export async function readCatalog(env, { atlasOnly = false, includeSessions = true } = {}) {
  const mode = dataMode(env);
  if (atlasOnly && mode !== "atlas") {
    throw new RequestError(503, "MongoDB Atlas não configurado neste ambiente.");
  }

  // Atlas e dados fictícios passam pela mesma validação e produzem o mesmo formato.
  const records = mode === "atlas"
    ? await readAtlas(env, includeSessions)
    : [sampleClasses, includeSessions ? sampleSessions : []];

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
  // Uma regra semanal vira uma sessão para a data solicitada; horários encerrados ficam de fora.
  const day = parseDate(date).getUTCDay();
  if (date < now.date) return [];
  return catalog.sessions
    .filter(session => session.weekday === day && (date !== now.date || session.time > now.time))
    .map(({ weekday, ...session }) => session);
}

export async function availableSessionsOnDate(env, catalog, date, now = localDateTime()) {
  const sessions = sessionsOnDate(catalog, date, now);
  if (catalog.mode !== "atlas" || !sessions.length) return sessions;
  // A consulta devolve a contagem, sem expor detalhes ou códigos das reservas.
  const counts = await countReservations(env, date, sessions);
  return sessions.map(session => ({
    ...session,
    available: Math.max(0, session.available - (counts.get(session.id) ?? 0)),
  }));
}

export function formatDate(date) {
  return date.split("-").reverse().join("/");
}
