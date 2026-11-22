import { parseDate, readCatalog, sessionsOnDate, validCode } from "../../server/catalog.js";
import { endpoint, RequestError } from "../../server/http.js";

export const onRequest = endpoint("GET", async ({ request, env }) => {
  const params = new URL(request.url).searchParams;
  const aula = params.get("aula");
  const data = params.get("data");

  if (aula !== null && !validCode(aula)) {
    throw new RequestError(400, "Informe um código de aula válido.");
  }
  const dia = data === null ? null : parseDate(data).getUTCDay();

  const catalog = await readCatalog(env, { atlasOnly: true });
  const sessions = data === null ? catalog.sessions : sessionsOnDate(catalog, data);

  return {
    mode: catalog.mode,
    ...(data === null ? {} : { data }),
    horarios: sessions
      .filter(session => aula === null || session.classId === aula)
      .map(({ id, classId, className, weekday, time, capacity, available }) => ({
        codigo: id,
        aulaCodigo: classId,
        aulaNome: className,
        diaSemana: weekday ?? dia,
        horario: time,
        vagasTotais: capacity,
        vagasDisponiveis: available,
      })),
  };
});
