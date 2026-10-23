import extension from "@kairos/extension-videos";
import fs from "node:fs";

// Reproduz o provider embutido do app (main process) SEM imprimir a chave.
const providerSrc = fs.readFileSync(
  "C:/Users/ferna/Downloads/desktop-pi-kairos/apps/electron/src/main/builtin-provider.ts",
  "utf-8",
);
const apiKey = providerSrc.match(/BUNDLED_API_KEY\s*=\s*"([^"]+)"/)?.[1] ?? "";
const modelId = providerSrc.match(/BUNDLED_MODEL\s*=\s*"([^"]+)"/)?.[1] ?? "MiniMax-M3";
if (!apiKey) {
  console.error("ERRO: nao achei a chave bundled");
  process.exit(1);
}
globalThis.__kairosProviderConfig = { provider: "minimax", modelId, apiKey };

const tool = (extension.tools || []).find((t) => t.name === "videos:script");
const outDir = "C:/Users/ferna/AppData/Local/Temp/kairos-script-check";

const r = await tool.execute(
  {
    description:
      "O Kairós CRM mostra no painel o número de conversas abertas e o tempo médio de resposta. " +
      "Clicando numa conversa, abre o chat com o histórico do cliente.",
    appName: "Kairós CRM",
    durationSec: 30,
    language: "pt-BR",
    title: "verificacao-final",
    outputDir: outDir,
  },
  { abortSignal: new AbortController().signal },
);

const saved = r.savedTo;
const content = saved ? fs.readFileSync(saved, "utf-8") : "";

console.log("salvo em:", saved);
console.log("bytes:", content.length);
console.log("contem <think>:", content.includes("<think>") ? "SIM (BUG)" : "nao");
console.log("contem undefined:", /undefined/.test(content) ? "SIM (BUG)" : "nao");
console.log("precisa confirmacao:", r.needsConfirmation);
console.log("fallback de narracao:", r.usedFallbackNarration);
console.log("titulo:", r.title);
console.log("--- narracao (" + r.narrationText.length + " chars) ---");
console.log(r.narrationText);
