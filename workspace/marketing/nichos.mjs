import sharp from "sharp";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const W = 1080, H = 1920;
const BASE = "C:/Users/ferna/.minimax-agent/projects/kairos-pi/workspace/marketing";
const SECONDS = 3;

// Cores por segmento: cada um tem cor primária + secundária (gradient/badge)
const SEGMENTS = [
  {
    id: "oficina",
    fundo: "bg-oficina.png",
    corPrimaria: "#FF6B35", // laranja mecânico
    corSecundaria: "#1E3A8A", // azul marinho
    corTexto: "#FFFFFF",
    corAccent: "#FFD700", // dourado
    slides: [
      { kind: "capa",
        t1: "SUA OFICINA",
        t2: "DIGITAL",
        sub: "Agendamento, orçamento e clientes num só lugar.",
        cta: "AGENDE UMA DEMONSTRAÇÃO" },
      { kind: "dor",
        t1: "PAROU DE",
        t2: "ANOTAR NO PAPEL?",
        sub: "Histórico do carro, peças, serviços e clientes na palma da mão.",
        cta: "TESTE GRÁTIS 7 DIAS" },
      { kind: "solucao",
        t1: "ORÇAMENTO",
        t2: "EM 2 MINUTOS",
        sub: "Manda pro cliente no WhatsApp. Aprovado em segundos.",
        cta: "WHATSAPP: (11) 9999-9999" },
    ],
  },
  {
    id: "igreja",
    fundo: "bg-igreja.png",
    corPrimaria: "#D4AF37", // dourado
    corSecundaria: "#1E3A5F", // azul profundo
    corTexto: "#FFF8E7",
    corAccent: "#D4AF37",
    slides: [
      { kind: "capa",
        t1: "GESTÃO DA",
        t2: "SUA IGREJA",
        sub: "Membros, agenda, financeiro e comunicação, simples assim.",
        cta: "AGENDE UMA DEMONSTRAÇÃO" },
      { kind: "dor",
        t1: "PLANILHA",
        t2: "BAGUNÇADA?",
        sub: "Pastor, foque na ovelha. A gente cuida dos dados.",
        cta: "TESTE GRÁTIS 14 DIAS" },
      { kind: "solucao",
        t1: "MEMBROS EM",
        t2: "1 TOQUE",
        sub: "Aniversariantes, visitantes, frequência, dizimistas.",
        cta: "WHATSAPP: (11) 9999-9999" },
    ],
  },
  {
    id: "esquadrias",
    fundo: "bg-esquadrias.png",
    corPrimaria: "#0EA5E9", // azul céu
    corSecundaria: "#1E293B", // grafite
    corTexto: "#FFFFFF",
    corAccent: "#38BDF8",
    slides: [
      { kind: "capa",
        t1: "ORÇAMENTO",
        t2: "DE ESQUADRIAS",
        sub: "Calculadora automática + envio em PDF pro cliente.",
        cta: "AGENDE UMA DEMONSTRAÇÃO" },
      { kind: "dor",
        t1: "MEDINDO À",
        t2: "MÃO?",
        sub: "Cadastro de perfis, vidros e ferragens. Sem erro de cálculo.",
        cta: "TESTE GRÁTIS 7 DIAS" },
      { kind: "solucao",
        t1: "PDF PRONTO",
        t2: "EM 30 SEGUNDOS",
        sub: "Com logo, prazo, condições. Cliente aprova por WhatsApp.",
        cta: "WHATSAPP: (11) 9999-9999" },
    ],
  },
  {
    id: "crm",
    fundo: "bg-crm.png",
    corPrimaria: "#10B981", // verde esmeralda
    corSecundaria: "#1E293B",
    corTexto: "#FFFFFF",
    corAccent: "#34D399",
    slides: [
      { kind: "capa",
        t1: "NUNCA MAIS",
        t2: "PERCA UM CLIENTE",
        sub: "Funil de vendas, follow-up automático e histórico completo.",
        cta: "AGENDE UMA DEMONSTRAÇÃO" },
      { kind: "dor",
        t1: "LEAD NO",
        t2: "WHATSAPP?",
        sub: "Ele some em 24h. A gente organiza em pipeline com alerta.",
        cta: "TESTE GRÁTIS 14 DIAS" },
      { kind: "solucao",
        t1: "FUNIL +",
        t2: "AUTOMAÇÃO",
        sub: "Disparo de email/WhatsApp na hora certa. Equipe focada em fechar.",
        cta: "WHATSAPP: (11) 9999-9999" },
    ],
  },
  {
    id: "almoxarifado",
    fundo: "bg-almoxarifado.png",
    corPrimaria: "#F59E0B", // âmbar industrial
    corSecundaria: "#0F172A",
    corTexto: "#FFFFFF",
    corAccent: "#FCD34D",
    slides: [
      { kind: "capa",
        t1: "ESTOQUE",
        t2: "SEM SURPRESA",
        sub: "Entrada, saída, alerta de mínimo e relatório em tempo real.",
        cta: "AGENDE UMA DEMONSTRAÇÃO" },
      { kind: "dor",
        t1: "PLANILHA DO",
        t2: "EXCEL?",
        sub: "A gente importa. Você ganha painel, código de barras e histórico.",
        cta: "TESTE GRÁTIS 7 DIAS" },
      { kind: "solucao",
        t1: "CONTROLE",
        t2: "TOTAL EM 7 DIAS",
        sub: "Contagem cega, inventário rotativo, alertas automáticos.",
        cta: "WHATSAPP: (11) 9999-9999" },
    ],
  },
  {
    id: "beleza",
    fundo: "bg-beleza.png",
    corPrimaria: "#EC4899", // rosa vibrante
    corSecundaria: "#581C87", // roxo
    corTexto: "#FFFFFF",
    corAccent: "#F9A8D4",
    slides: [
      { kind: "capa",
        t1: "AGENDA",
        t2: "SEMPRE LOTADA",
        sub: "Confirmação automática, retorno de clientes e fidelidade.",
        cta: "AGENDE UMA DEMONSTRAÇÃO" },
      { kind: "dor",
        t1: "CLIENTE",
        t2: "ESQUECEU?",
        sub: "Lembrete no WhatsApp 24h antes. Reduza no-shows pela metade.",
        cta: "TESTE GRÁTIS 7 DIAS" },
      { kind: "solucao",
        t1: "RETENÇÃO",
        t2: "INTELIGENTE",
        sub: "Aniversariantes VIP, pacotes de volta, ranking de profissionais.",
        cta: "WHATSAPP: (11) 9999-9999" },
    ],
  },
];

function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function title(text, opts) {
  const { x, y, size, color = "#FFFFFF", align = "middle", weight = 900, letterSpacing = 2 } = opts;
  const anchor = align === "left" ? "start" : align === "right" ? "end" : "middle";
  const esc = escapeXml(text);
  return [
    `<text x="${x + 2}" y="${y + 2}" font-family="Arial Black, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="rgba(0,0,0,0.55)" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${esc}</text>`,
    `<text x="${x}" y="${y}" font-family="Arial Black, Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${esc}</text>`,
  ].join("");
}

// Banner CTA com gradiente da cor primária
function ctaBanner(text, corPrimaria, corSecundaria) {
  const gradId = "grad" + Math.random().toString(36).slice(2, 7);
  return `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${corPrimaria}"/>
        <stop offset="100%" stop-color="${corSecundaria}"/>
      </linearGradient>
    </defs>
    <rect x="${W * 0.1}" y="${H * 0.78}" width="${W * 0.8}" height="80" rx="40" fill="url(#${gradId})" />
    <text x="${W / 2}" y="${H * 0.78 + 50}" font-family="Arial Black, sans-serif" font-size="22" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="2">${escapeXml(text)}</text>
  `;
}

function buildSlide(slide, segment) {
  const { kind } = slide;
  const W2 = W, H2 = H;
  let elements = "";

  // Decoração topo: gradiente horizontal da cor primária
  const gradId = "gtop" + Math.random().toString(36).slice(2, 7);
  elements += `
    <defs>
      <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${segment.corPrimaria}" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="${segment.corSecundaria}" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W2}" height="12" fill="url(#${gradId})"/>
    <rect x="0" y="${H2 - 12}" width="${W2}" height="12" fill="url(#${gradId})"/>
  `;

  // Título grande (2 linhas)
  const tSize1 = Math.min(110, Math.floor((W * 0.88) / (slide.t1.length * 0.62)));
  const tSize2 = Math.min(110, Math.floor((W * 0.88) / (slide.t2.length * 0.62)));
  elements += title(slide.t1, { x: W / 2, y: 360, size: tSize1, color: segment.corTexto });
  elements += title(slide.t2, { x: W / 2, y: 510, size: tSize2, color: segment.corAccent });

  // Subtítulo
  const subSize = 38;
  const subMaxChars = Math.floor((W * 0.85) / (subSize * 0.5));
  const subLines = wrapText(slide.sub, subMaxChars);
  subLines.forEach((line, i) => {
    elements += title(line, {
      x: W / 2, y: 760 + i * 55, size: subSize, color: "#F5F5F5", weight: 600, letterSpacing: 0,
    });
  });

  // CTA banner
  elements += ctaBanner(slide.cta, segment.corPrimaria, segment.corSecundaria);

  // Marca no rodapé
  elements += title("kairos.app.br", {
    x: W / 2, y: H - 50, size: 22, color: segment.corAccent, weight: 700, letterSpacing: 4,
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">${elements}</svg>`;
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

async function generateSlides() {
  for (const seg of SEGMENTS) {
    const fundoPath = path.join(BASE, seg.fundo);
    for (let i = 0; i < seg.slides.length; i++) {
      const slideNum = i + 1;
      const slide = seg.slides[i];
      const svg = buildSlide(slide, seg);
      const outPath = path.join(BASE, `nicho-${seg.id}-${slideNum}.png`);
      const buf = await sharp(fundoPath)
        .resize(W, H, { fit: "cover" })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png({ quality: 95 })
        .toBuffer();
      await fs.writeFile(outPath, buf);
      console.log(`✓ ${seg.id} ${slideNum}/3: ${slide.t1} ${slide.t2}`);
    }
  }
}

async function generateMp4s() {
  for (const seg of SEGMENTS) {
    const images = [1, 2, 3].map((n) => path.join(BASE, `nicho-${seg.id}-${n}.png`));
    const lines = [];
    for (const img of images) {
      lines.push(`file '${img.replace(/'/g, "'\\''")}'`);
      lines.push(`duration ${SECONDS}`);
    }
    lines.push(`file '${images[images.length - 1].replace(/'/g, "'\\''")}'`);
    const concatFile = path.join(BASE, `.concat-${seg.id}.txt`);
    await fs.writeFile(concatFile, lines.join("\n"), "utf-8");

    const out = path.join(BASE, `nicho-${seg.id}.mp4`);
    await new Promise((resolve, reject) => {
      const proc = spawn(
        "ffmpeg",
        [
          "-y", "-f", "concat", "-safe", "0", "-i", concatFile,
          "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30",
          "-c:v", "libx264", "-preset", "medium", "-crf", "23",
          "-pix_fmt", "yuv420p", "-movflags", "+faststart",
          out,
        ],
        { stdio: ["ignore", "ignore", "pipe"] }
      );
      let err = "";
      proc.stderr.on("data", (d) => (err += d.toString()));
      proc.on("close", async (code) => {
        await fs.unlink(concatFile).catch(() => {});
        if (code === 0) {
          const stat = await fs.stat(out);
          console.log(`  🎬 MP4: ${out.split(/[\\/]/).pop()} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve();
        } else reject(new Error(`ffmpeg ${seg.id} falhou: ${err.slice(-300)}`));
      });
    });
  }
}

await generateSlides();
console.log("\n");
await generateMp4s();
console.log(`\n✓ Tudo pronto em ${BASE}/nicho-*`);
