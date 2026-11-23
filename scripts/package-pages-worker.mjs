import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isBuiltin } from "node:module";

const buildEntry = new URL("../.wrangler/pages-worker/index.js", import.meta.url);
const workerDirectory = new URL("../public/_worker.js/", import.meta.url);

const builtWorker = await readFile(buildEntry, "utf8");
// Keep runtime imports explicit when the generated module is uploaded as-is.
const worker = builtWorker.replace(
  /^(import(?:[^\r\n]+?\bfrom)?\s+)(["'])([^"'\r\n]+)\2/gm,
  (statement, prefix, quote, specifier) => {
    if (specifier.startsWith("node:") || !isBuiltin(specifier)) return statement;
    return `${prefix}${quote}node:${specifier}${quote}`;
  },
);

await mkdir(workerDirectory, { recursive: true });
// Pages bundles this small entry point and uploads the application as a separate module.
await writeFile(new URL("application.mjs", workerDirectory), worker);
await writeFile(new URL("index.js", workerDirectory), 'export { default } from "./application.mjs";\n');
