import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";

const publicDirectory = new URL("../public/", import.meta.url);
const buildEntry = new URL("../.wrangler/pages-worker/index.js", import.meta.url);
const workerDirectory = new URL("_worker.js/", publicDirectory);

// O Pages publica todo o conteúdo estático de public/. Interrompa o build se alguém
// colocar por engano uma chave, um backup ou outro arquivo que não pertence ao site.
async function checkPublicDirectory(directory, { files, directories = [] }) {
  const entries = await readdir(directory, { withFileTypes: true });
  const unexpected = entries.some(entry => {
    if (entry.isFile()) return !files.includes(entry.name);
    if (entry.isDirectory()) return !directories.includes(entry.name);
    return true;
  });
  if (unexpected) {
    throw new Error("A pasta de publicação contém itens fora da lista permitida. Revise public/.");
  }
}

await checkPublicDirectory(publicDirectory, {
  files: ["_headers", "app.js", "chat.css", "chat.html", "index.html", "style.css"],
  directories: ["_worker.js", "assets"],
});
await checkPublicDirectory(new URL("assets/", publicDirectory), {
  files: ["academia.webp", "atleta-banner-ajuste.png", "muvinho-identidade.png"],
});

const builtWorker = await readFile(buildEntry, "utf8");
// Escreve importações nativas com node: para o runtime identificar cada módulo.
const worker = builtWorker.replace(
  /^(import(?:[^\r\n]+?\bfrom)?\s+)(["'])([^"'\r\n]+)\2/gm,
  (statement, prefix, quote, specifier) => {
    if (specifier.startsWith("node:") || !isBuiltin(specifier)) return statement;
    return `${prefix}${quote}node:${specifier}${quote}`;
  },
);

await mkdir(workerDirectory, { recursive: true });
await checkPublicDirectory(workerDirectory, { files: ["application.mjs", "index.js"] });
// O Pages empacota o ponto de entrada e envia a aplicação como módulo separado.
await writeFile(new URL("application.mjs", workerDirectory), worker);
await writeFile(new URL("index.js", workerDirectory), 'export { default } from "./application.mjs";\n');
