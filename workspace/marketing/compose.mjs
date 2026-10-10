import sharp from "sharp";
import fs from "node:fs/promises";

const W = 1080, H = 1920;
const BASE = "C:/Users/ferna/.minimax-agent/projects/kairos-pi/workspace/marketing/fundo.png";
const OUT = "C:/Users/ferna/.minimax-agent/projects/kairos-pi/workspace/marketing/slide-use-seus-dons.png";

function title(text, opts) {
  const { x, y, size, color = "#FFF8E7", family = "serif", align = "middle", weight = 900 } = opts;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return [
    `<text x="${x + 2}" y="${y + 2}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="rgba(180,140,60,0.7)" text-anchor="${anchor}" letter-spacing="3">${esc}</text>`,
    `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="3">${esc}</text>`,
  ];
}

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
  // Linha decorativa topo
  `<line x1="${W / 2 - 220}" y1="120" x2="${W / 2 + 220}" y2="120" stroke="#D4AF37" stroke-width="1.2"/>` +
  `<line x1="${W / 2 - 280}" y1="170" x2="${W / 2 + 280}" y2="170" stroke="#D4AF37" stroke-width="1.2"/>` +
  // Título em duas linhas
  title("USE SEUS", { x: W / 2, y: 280, size: 160 }).join("") +
  title("DONS", { x: W / 2, y: 470, size: 220, weight: 900 }).join("") +
  // Linha decorativa meio
  `<line x1="${W / 2 - 280}" y1="560" x2="${W / 2 + 280}" y2="560" stroke="#D4AF37" stroke-width="1.2"/>` +
  `<line x1="${W / 2 - 220}" y1="610" x2="${W / 2 + 220}" y2="610" stroke="#D4AF37" stroke-width="1.2"/>` +
  // Subtítulo
  title("Se Deus confiou, administre", { x: W / 2, y: 720, size: 56 }).join("") +
  title("para a glória dele.", { x: W / 2, y: 790, size: 56 }).join("") +
  // Citação (rodapé)
  title('"Cada um exerça o dom que recebeu', { x: W / 2, y: 1490, size: 38, color: "#FFF8E7" }).join("") +
  title('para servir aos outros."', { x: W / 2, y: 1540, size: 38, color: "#FFF8E7" }).join("") +
  // Linha decorativa antes da referência
  `<line x1="${W / 2 - 220}" y1="1610" x2="${W / 2 + 220}" y2="1610" stroke="#D4AF37" stroke-width="1.2"/>` +
  title("1 Pedro 4:10", { x: W / 2, y: 1670, size: 36, color: "#D4AF37" }).join("") +
  // Brand
  title("Fernando Borges", { x: W / 2, y: 1830, size: 30, color: "#D4AF37" }).join("") +
  `</svg>`;

const buf = await sharp(BASE)
  .resize(W, H, { fit: "cover" })
  .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
  .png({ quality: 95 })
  .toBuffer();

await fs.writeFile(OUT, buf);
console.log("Salvo em", OUT, "-", buf.length, "bytes");
