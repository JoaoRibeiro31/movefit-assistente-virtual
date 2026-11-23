import { readCatalog } from "../../server/catalog.js";
import { endpoint } from "../../server/http.js";

export const onRequest = endpoint("GET", async ({ env }) => {
  const { mode, classes } = await readCatalog(env, { atlasOnly: true, includeSessions: false });

  return {
    mode,
    aulas: classes.map(({ id, name, description, level, duration }) => ({
      codigo: id,
      nome: name,
      descricao: description,
      nivel: level,
      duracaoMinutos: duration,
    })),
  };
});
