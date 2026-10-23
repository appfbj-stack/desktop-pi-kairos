import extension from "@kairos/extension-videos";
import fs from "node:fs";

const tools = extension.tools || [];
const project = tools.find((t) => t.name === "videos:project");
const exportTool = tools.find((t) => t.name === "videos:export");
const signal = new AbortController().signal;

const root = "C:/Users/ferna/AppData/Local/Temp/kairos-hd-e2e/KAIROS_VIDEOS";

// 1) PROJECT — mostra o HD detectado
const p = await project.execute({ name: "teste-hd", root }, { abortSignal: signal });
console.log("detectedExternalRoot:", p.detectedExternalRoot);
console.log("externalRoot (config):", p.externalRoot);

// 2) EXPORT com destino explícito inexistente -> deve bloquear e manter original
const src = "C:/Users/ferna/AppData/Local/Temp/kairos-hd-e2e/video-teste.mp4";
fs.mkdirSync("C:/Users/ferna/AppData/Local/Temp/kairos-hd-e2e", { recursive: true });
fs.writeFileSync(src, "conteudo-de-teste");

const blocked = await exportTool.execute(
  { input: src, destination: "Q:/HD-QUE-NAO-EXISTE", root },
  { abortSignal: signal },
);
console.log("\n[destino inexistente] exported:", blocked.exported, "| keptOriginal:", blocked.keptOriginal);
console.log("  aviso:", blocked.warnings[0]);
if (blocked.exported || !blocked.keptOriginal) {
  console.error("ERRO: deveria ter bloqueado e mantido o original");
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error("ERRO: original sumiu!");
  process.exit(1);
}

// 3) EXPORT sem destino -> usa o HD detectado (ou local, se nao houver)
const auto = await exportTool.execute({ input: src, root }, { abortSignal: signal });
console.log("\n[destino automatico] destino:", auto.destinationRoot);
console.log("  external:", auto.external, "| exported:", auto.exported);
console.log("  avisos:", auto.warnings.join(" | "));
console.log("  original preservado:", auto.keptOriginal && fs.existsSync(src));

console.log("\nOK - export seguro + deteccao de HD");
