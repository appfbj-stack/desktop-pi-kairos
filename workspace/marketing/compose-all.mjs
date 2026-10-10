import sharp from "sharp";
import fs from "node:fs/promises";

const W = 1080, H = 1920;
const BRAND = "Fernando Borges";

const slides = [
  {
    fundo: "fundo.png",
    title1: "USE SEUS",
    title2: "DONS",
    sub1: "Se Deus confiou, administre",
    sub2: "para a glória dele.",
    quote1: '"Cada um exerça o dom que recebeu',
    quote2: 'para servir aos outros."',
    verse: "1 Pedro 4:10",
  },
  {
    fundo: "fundo-2.png",
    title1: "FEITOS",
    title2: "PARA O BEM",
    sub1: "Somos criação de Deus,",
    sub2: "criados em Cristo para boas obras.",
    quote1: '"Porque somos criação de Deus, criados',
    quote2: 'em Cristo Jesus para boas obras."',
    verse: "Efésios 2:10",
  },
  {
    fundo: "fundo-3.png",
    title1: "DONS",
    title2: "DIFERENTES",
    sub1: "Cada um receba o dom",
    sub2: "segundo a graça que recebeu.",
    quote1: '"Temos dons diferentes, conforme',
    quote2: 'a graça que nos foi dada."',
    verse: "Romanos 12:6",
  },
  {
    fundo: "fundo-4.png",
    title1: "UM SÓ",
    title2: "ESPÍRITO",
    sub1: "Há diversidade de dons,",
    sub2: "mas o Espírito é o mesmo.",
    quote1: '"Há diversidade de dons, mas o Senhor',
    quote2: 'é o mesmo."',
    verse: "1 Coríntios 12:4-5",
  },
  {
    fundo: "fundo-5.png",
    title1: "FAÇA TUDO",
    title2: "PRA ELE",
    sub1: "Tudo o que fizerem, façam",
    sub2: "de todo o coração, como para o Senhor.",
    quote1: '"Façam tudo de todo o coração, como',
    quote2: 'para o Senhor, e não para homens."',
    verse: "Colossenses 3:23",
  },
];

function title(text, opts) {
  const {
    x, y, size, color = "#FFF8E7",
    family = "Arial Black, Arial, sans-serif",
    align = "middle",
    weight = 900,
    letterSpacing = 2,
  } = opts;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return [
    `<text x="${x + 2}" y="${y + 2}" font-family='${family}' font-size="${size}" font-weight="${weight}" fill="rgba(180,140,60,0.75)" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${esc}</text>`,
    `<text x="${x}" y="${y}" font-family='${family}' font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${esc}</text>`,
  ];
}

const decorations =
  `<line x1="${W / 2 - 200}" y1="170" x2="${W / 2 + 200}" y2="170" stroke="#D4AF37" stroke-width="1.2"/>` +
  `<line x1="${W / 2 - 260}" y1="220" x2="${W / 2 + 260}" y2="220" stroke="#D4AF37" stroke-width="1.2"/>` +
  `<line x1="${W / 2 - 260}" y1="560" x2="${W / 2 + 260}" y2="560" stroke="#D4AF37" stroke-width="1.2"/>` +
  `<line x1="${W / 2 - 200}" y1="610" x2="${W / 2 + 200}" y2="610" stroke="#D4AF37" stroke-width="1.2"/>` +
  `<line x1="${W / 2 - 200}" y1="1610" x2="${W / 2 + 200}" y2="1610" stroke="#D4AF37" stroke-width="1.2"/>`;

const BASE_DIR = "C:/Users/ferna/.minimax-agent/projects/kairos-pi/workspace/marketing";

for (let i = 0; i < slides.length; i++) {
  const s = slides[i];
  const slideNum = i + 1;
  const fundoPath = `${BASE_DIR}/${s.fundo}`;
  const outPath = `${BASE_DIR}/slide-${slideNum}.png`;

  // Tamanho do título grande: calculado pra caber em ~92% da largura
  // Caracteres * 0.55 * size ≈ width disponível
  const titleSize1 = Math.min(150, Math.floor((W * 0.90) / (s.title1.length * 0.62)));
  const titleSize2 = Math.min(150, Math.floor((W * 0.90) / (s.title2.length * 0.62)));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    decorations +
    title(s.title1, { x: W / 2, y: 280, size: titleSize1 }).join("") +
    title(s.title2, { x: W / 2, y: 440, size: titleSize2, weight: 900 }).join("") +
    title(s.sub1, { x: W / 2, y: 720, size: 48, letterSpacing: 0 }).join("") +
    title(s.sub2, { x: W / 2, y: 780, size: 48, letterSpacing: 0 }).join("") +
    title(s.quote1, { x: W / 2, y: 1490, size: 34, color: "#FFF8E7", letterSpacing: 0 }).join("") +
    title(s.quote2, { x: W / 2, y: 1540, size: 34, color: "#FFF8E7", letterSpacing: 0 }).join("") +
    title(s.verse, { x: W / 2, y: 1670, size: 34, color: "#D4AF37", letterSpacing: 0 }).join("") +
    title(BRAND, { x: W / 2, y: 1830, size: 26, color: "#D4AF37", letterSpacing: 0 }).join("") +
    `</svg>`;

  const buf = await sharp(fundoPath)
    .resize(W, H, { fit: "cover" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png({ quality: 95 })
    .toBuffer();

  await fs.writeFile(outPath, buf);
  console.log(`✓ Slide ${slideNum}: ${s.title1} ${s.title2} (size1=${titleSize1}, size2=${titleSize2}) - ${buf.length} bytes`);
}

console.log(`\nTodos os ${slides.length} slides salvos em ${BASE_DIR}/`);
