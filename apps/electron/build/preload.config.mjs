// Sprint 1.7.2 — Build do preload via esbuild (em vez de tsc).
//
// tsc tem comportamento problematico: mesmo com module:commonjs + source .cts,
// ele pode emitir `import` statements em vez de `require()`. esbuild eh deterministico
// e converte corretamente pra CJS, bundleando tudo num unico arquivo.
//
// Output: dist/preload/index.js (CJS, sem deps externas, com contextBridge do electron)
// Alem disso escreve dist/preload/package.json com type:commonjs pra que o
// package.json raiz (type:module) nao faca o Node.js tratar o .js como ESM.

import { build } from "esbuild";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const outDir = resolve(__dirname, "..", "dist", "preload");
const outFile = join(outDir, "index.cjs");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

await build({
  entryPoints: [resolve(__dirname, "..", "src", "preload", "index.mts")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",  // <-- CJS garantido
  outfile: outFile,
  // Preload roda no contexto do Electron renderer (tem `electron` e `@kairos/agent` disponiveis).
  // Bundlar tudo num arquivo soh evita surpresas de resolucao.
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
  // Permite usar .ts/.cts/.mts/.json como entrada. esbuild infere o formato.
  loader: { ".cts": "ts", ".json": "json" },
  // Como estamos bundlando, garanta que imports de @kairos/agent sejam resolvidos
  // (electron-builder empacota node_modules, mas em dev queremos resolver pelo workspace).
  resolveExtensions: [".cts", ".ts", ".mts", ".js", ".json"],
});

// Escreve sub-package.json com type:commonjs pra que o package.json raiz (type:module)
// nao faca o Node.js tratar o .js como ESM.
const subPkg = join(outDir, "package.json");
writeFileSync(
  subPkg,
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
  "utf8"
);

console.log(`[preload-esbuild] wrote ${outFile} (CJS)`);
console.log(`[preload-esbuild] wrote ${subPkg} (type:commonjs)`);
