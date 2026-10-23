import extension from "@kairos/extension-videos";

const tool = (extension.tools || []).find((t) => t.name === "videos:source");
if (!tool) {
  console.error("FALTA: videos:source");
  process.exit(1);
}

const root = "C:/Users/ferna/AppData/Local/Temp/kairos-source-e2e/KAIROS_VIDEOS";

// 1) SEARCH
console.log("=== 1) SEARCH ===");
const search = await tool.execute(
  { mode: "search", query: "kairos crm", limit: 3, minViews: 20, root },
  { abortSignal: new AbortController().signal },
);
console.log("results:", search.results.length);
for (const r of search.results) {
  console.log(` - ${r.title}`);
  console.log(`   ${r.durationLabel} | ${r.viewCount} views | ${r.channel}`);
  console.log(`   ${r.url}`);
}

if (!search.results.length) {
  console.error("Busca devolveu vazio");
  process.exit(1);
}

// 2) DOWNLOAD
console.log("\n=== 2) DOWNLOAD ===");
const chosen = search.results[0];
const dl = await tool.execute(
  { mode: "download", url: chosen.url, project: "teste-source", root },
  { abortSignal: new AbortController().signal },
);
console.log("arquivo:", dl.downloaded.filePath);
console.log("tamanho:", (dl.downloaded.sizeBytes / 1024 / 1024).toFixed(2), "MB");
console.log("pasta:", dl.sourcesDir);
console.log("nota:", dl.usageNote);

// 3) INFO
console.log("\n=== 3) INFO ===");
const info = await tool.execute(
  { mode: "info", url: chosen.url, root },
  { abortSignal: new AbortController().signal },
);
console.log("titulo:", info.results[0]?.title);
console.log("views:", info.results[0]?.viewCount);

console.log("\nOK - videos:source 3/3");
