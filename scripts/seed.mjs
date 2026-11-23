import { MongoClient } from "mongodb";
import aulas from "../data/aulas.json" with { type: "json" };
import horarios from "../data/horarios.json" with { type: "json" };
import { requireVerifiedTls } from "../server/atlas.js";

// A carga de exemplos usa um segredo local separado do utilizado pelo site.
const uri = process.env.MONGODB_SEED_URI;
if (!uri) {
  console.error("Configure MONGODB_SEED_URI em .dev.vars com um usuário de escrita do Atlas.");
  process.exitCode = 1;
} else {
  try {
    const client = new MongoClient(uri, { tls: true, serverSelectionTimeoutMS: 7000 });
    try {
      requireVerifiedTls(client.options);
      const db = client.db(process.env.MONGODB_DB || "movefit");
      for (const [name, records] of Object.entries({ aulas, horarios })) {
        const collection = db.collection(name);
        await collection.createIndex({ codigo: 1 }, { unique: true });
        // Insere registros ausentes por código e preserva os dados existentes.
        const result = await collection.bulkWrite(records.map(record => ({
          updateOne: {
            filter: { codigo: record.codigo },
            update: { $setOnInsert: record },
            upsert: true,
          },
        })));
        console.log(`${name}: ${result.upsertedCount} registros inseridos.`);
      }
    } finally {
      await client.close();
    }
  } catch {
    // A exceção do driver pode incluir detalhes de conexão, por isso o aviso é fixo.
    console.error("Falha ao importar dados. Confira o TLS, a conexão, o acesso de escrita e possíveis códigos duplicados.");
    process.exitCode = 1;
  }
}
