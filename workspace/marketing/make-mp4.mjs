import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = "C:/Users/ferna/.minimax-agent/projects/kairos-pi/workspace/marketing";
const SLIDES = ["slide-1.png", "slide-2.png", "slide-3.png", "slide-4.png", "slide-5.png"];
const SECONDS_PER_SLIDE = 3;
const OUT = path.join(BASE, "carrossel-use-seus-dons.mp4");

// Cria concat list com duration por slide
const lines = [];
for (const img of SLIDES) {
  lines.push(`file '${path.join(BASE, img).replace(/'/g, "'\\''")}'`);
  lines.push(`duration ${SECONDS_PER_SLIDE}`);
}
// última linha repete o último arquivo sem duration (formato concat demuxer)
lines.push(`file '${path.join(BASE, SLIDES[SLIDES.length - 1]).replace(/'/g, "'\\''")}'`);
const concatFile = path.join(BASE, ".concat-list.txt");
await fs.writeFile(concatFile, lines.join("\n"), "utf-8");

const args = [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", concatFile,
  "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30",
  "-c:v", "libx264",
  "-preset", "medium",
  "-crf", "23",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  OUT,
];

console.log("ffmpeg", args.join(" "));

const proc = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
proc.stderr.on("data", (d) => {
  stderr += d.toString();
  process.stderr.write(d);
});
proc.on("close", async (code) => {
  await fs.unlink(concatFile).catch(() => {});
  if (code === 0) {
    const stat = await fs.stat(OUT);
    console.log(`\n✓ Salvo: ${OUT}`);
    console.log(`  ${(stat.size / 1024 / 1024).toFixed(2)} MB · ${SLIDES.length} slides × ${SECONDS_PER_SLIDE}s = ${SLIDES.length * SECONDS_PER_SLIDE}s`);
  } else {
    console.error(`\nffmpeg falhou (code ${code})`);
    process.exit(code);
  }
});
