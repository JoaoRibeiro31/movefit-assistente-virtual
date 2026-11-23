import { RequestError } from "./http.js";

function atlasFailureReason(error) {
  const serverErrors = Array.from(error?.reason?.servers?.values?.() ?? [], server => server.error);
  const errors = [error, ...serverErrors].flatMap(item => [item, item?.cause, item?.cause?.cause]);

  if (errors.some(item => item?.code === 13 || item?.code === 18 ||
    (item?.code === 8000 && /authenticat|not allowed|not authorized/i.test(item.message ?? "")))) {
    return "autenticação ou permissão negada";
  }
  if (errors.some(item => ["ENOTFOUND", "ENODATA", "EAI_AGAIN"].includes(item?.code) ||
    /^query(?:Srv|Txt)$/.test(item?.syscall ?? ""))) return "falha de DNS";
  if (errors.some(item => /^(?:ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_VERIFY_|DEPTH_ZERO_SELF_SIGNED_CERT)/
    .test(String(item?.code ?? "")))) return "falha de TLS";
  if (errors.some(item => ["ECONNREFUSED", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT"]
    .includes(item?.code))) return "falha na conexão TCP";
  if (error?.name === "MongoServerSelectionError") return "servidor inacessível";
  return "falha na configuração ou na leitura";
}

export async function withAtlas(env, operation, run) {
  if (!env.MONGODB_URI?.trim()) {
    throw new RequestError(503, "MongoDB Atlas não configurado neste ambiente.");
  }
  try {
    const { MongoClient } = await import("mongodb");
    const client = new MongoClient(env.MONGODB_URI.trim(), {
      tls: true,
      maxPoolSize: 2,
      maxConnecting: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });
    try {
      const tls = client.options;
      if (!tls.tls || tls.tlsInsecure || tls.tlsAllowInvalidCertificates ||
          tls.tlsAllowInvalidHostnames || tls.rejectUnauthorized === false) {
        throw new Error("Configuração TLS do Atlas insegura.");
      }
      return await run(client.db(env.MONGODB_DB?.trim() || "movefit"));
    } finally {
      await client.close();
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    // Mensagens do driver podem conter credenciais ou endereços.
    console.warn(`MoveFIT: ${operation.label} Atlas indisponível (${atlasFailureReason(error)}).`);
    throw new RequestError(502, operation.message);
  }
}
