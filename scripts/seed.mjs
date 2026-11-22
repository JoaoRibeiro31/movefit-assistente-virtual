import { MongoClient } from "mongodb";
import aulas from "../data/aulas.json" with { type: "json" };
import horarios from "../data/horarios.json" with { type: "json" };

const uri = process.env.MONGODB_SEED_URI;
if (!uri) {
  console.error("Configure MONGODB_SEED_URI em .dev.vars com um usuário de escrita do Atlas.");
  process.exitCode = 1;
} else {
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 7000 });
    try {
      const db = client.db(process.env.MONGODB_DB || "movefit");
      for (const [name, records] of Object.entries({ aulas, horarios })) {
        const collection = db.collection(name);
        await collection.createIndex({ codigo: 1 }, { unique: true });
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
  } catch (error) {
    console.error(`Falha ao importar dados (${error.name}). Confira a conexão, o acesso de escrita e possíveis códigos duplicados.`);
    process.exitCode = 1;
  }
}
