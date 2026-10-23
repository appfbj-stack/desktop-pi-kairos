import extension from "@kairos/extension-videos";
import fs from "node:fs";

const tools = extension.tools || [];
const source = tools.find((t) => t.name === "videos:source");
const compose = tools.find((t) => t.name === "videos:compose");

const root = "C:/Users/ferna/AppData/Local/Temp/kairos-source-e2e/KAIROS_VIDEOS";
const signal = new AbortController().signal;

// 1) baixa uma fonte
const search = await source.execute(
  { mode: "search", query: "kairos crm", limit: 3, minViews: 20, root },
  { abortSignal: signal },
);
const chosen = search.results[0];
console.log("fonte escolhida:", chosen.title, "|", chosen.durationLabel);

const dl = await source.execute(
  { mode: "download", url: chosen.url, project: "teste-source", root },
  { abortSignal: signal },
);
console.log("baixado:", dl.downloaded.filePath);

// 2) monta o vídeo vertical usando a fonte como insumo
const out = await compose.execute(
  {
    input: dl.downloaded.filePath,
    title: "montagem_com_fonte",
    cta: "Baixe o Kairós CRM",
    useGpu: true,
  },
  { abortSignal: signal },
);
console.log("saida:", out.output);
console.log("encoder:", out.encoder, "| render:", out.renderMs, "ms");
console.log("tamanho:", (out.sizeBytes / 1024 / 1024).toFixed(2), "MB");
console.log("tem CTA:", out.hasCta, "| legendas:", out.hasSubtitles);
if (!fs.existsSync(out.output)) {
  console.error("ERRO: saida nao existe");
  process.exit(1);
}
console.log("\nOK - fonte -> compose 1080x1920");
