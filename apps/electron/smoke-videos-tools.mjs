import extension from "@kairos/extension-videos";

const tools = extension.tools || [];
console.log("extension:", extension.name, "v" + extension.version);
console.log("tools:", tools.length);
for (const t of tools) {
  console.log("  -", t.name, "|", (t.description || "").split("\n")[0].slice(0, 80));
}
const expected = [
  "videos:project",
  "videos:script",
  "videos:voice",
  "videos:subtitles",
  "videos:compose",
  "videos:export",
];
const names = tools.map((t) => t.name);
const missing = expected.filter((n) => !names.includes(n));
if (missing.length) {
  console.error("FALTANDO:", missing.join(", "));
  process.exit(1);
}
console.log("OK - 6/6 tools presentes");
