import extension from "@kairos/extension-videos";
import fs from "node:fs";

const tools = extension.tools || [];
const project = tools.find((t) => t.name === "videos:project");
const exportTool = tools.find((t) => t.name === "videos:export");
const signal = new AbortController().signal;

const src = "C:/Users/ferna/Videos/KAIROS_VIDEOS/01_PARA_REVISAR/montagem_com_fonte.mp4";
if (!fs.existsSync(src)) {
  console.error("ERRO: arquivo de teste nao existe:", src);
  process.exit(1);
}

// 1) Deteccao
const p = await project.execute({ name: "teste-hd-real" }, { abortSignal: signal });
console.log("detectedExternalRoot:", p.detectedExternalRoot);
console.log("externalRoot (config):", p.externalRoot);

// 2) Export real pro HD
const r = await exportTool.execute({ input: src, stage: "APPROVED" }, { abortSignal: signal });
console.log("\nexported:", r.exported);
console.log("destino:", r.destinationRoot);
console.log("saida:", r.output);
console.log("tamanho:", (r.sizeBytes / 1024 / 1024).toFixed(2), "MB");
console.log("original preservado:", r.keptOriginal && fs.existsSync(src));
console.log("avisos:", r.warnings.join(" | ") || "(nenhum)");

const ok = fs.existsSync(r.output) && fs.existsSync(src);
console.log("\n" + (ok ? "OK - export pro D: confirmado" : "ERRO - arquivo ausente"));
if (!ok) process.exit(1);
