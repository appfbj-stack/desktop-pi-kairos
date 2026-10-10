// apps-kairos.mjs — Carrossel "Conheça os apps Kairós" (divulgação do ecossistema)
// Reaproveita backgrounds já gerados (bg-*.png) e compõe 6 slides com texto overlay.
// Cada slide = 1 app do ecossistema Kairós.

import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 1080;
const H = 1920;

// Paleta Kairós
const COR_DOURADO = '#F5C518';
const COR_BRANCO = '#FFFFFF';
const COR_VERDE = '#10B981';

// Apps (na ordem do carrossel — define narrativa)
const APPS = [
  {
    slug: 'oficina',
    bg: 'bg-oficina.png',
    icone: '🔧',
    titulo: 'OFICINA',
    subtitulo: 'Gestão completa pra oficina mecânica',
    bullets: ['Ordens de serviço', 'Estoque de peças', 'Clientes e veículos'],
  },
  {
    slug: 'igreja',
    bg: 'bg-igreja.png',
    icone: '⛪',
    titulo: 'IGREJA',
    subtitulo: 'Sistema pastoral inteligente',
    bullets: ['Membros e congregações', 'Agenda pastoral', 'Chat com IA bíblica'],
  },
  {
    slug: 'esquadrias',
    bg: 'bg-esquadrias.png',
    icone: '🪟',
    titulo: 'ESQUADRIAS',
    subtitulo: 'Orçamento de esquadrias em segundos',
    bullets: ['Cálculo automático', 'Materiais e medidas', 'PDF profissional'],
  },
  {
    slug: 'crm',
    bg: 'bg-crm.png',
    icone: '🤝',
    titulo: 'CRM',
    subtitulo: 'Nunca mais perca um lead',
    bullets: ['Pipeline de vendas', 'WhatsApp integrado', 'Prospecção automática'],
  },
  {
    slug: 'almoxarifado',
    bg: 'bg-almoxarifado.png',
    icone: '📦',
    titulo: 'ALMOXARIFADO',
    subtitulo: 'Controle total do seu estoque',
    bullets: ['Entrada e saída', 'Alertas de mínimo', 'Relatórios simples'],
  },
  {
    slug: 'beleza',
    bg: 'bg-beleza.png',
    icone: '💇',
    titulo: 'BELEZA',
    subtitulo: 'Studio de beleza organizado',
    bullets: ['Agenda de clientes', 'Serviços e preços', 'Comissionamento'],
  },
];

// Função: calcular fontSize adaptativo (não cortar texto)
function adaptiveFontSize(text, maxWidth, baseRatio = 0.62) {
  const chars = text.length;
  return Math.min(180, Math.floor((maxWidth * 0.90) / (chars * baseRatio)));
}

// Função: gerar SVG de texto overlay
function makeTextOverlay(app, idx) {
  const titleSize = adaptiveFontSize(app.titulo, W);
  const subSize = adaptiveFontSize(app.subtitulo, W, 0.42);

  // Y positions (top-down)
  const badgeY = 360;       // "APP X de 6"
  const iconeY = 540;       // ícone emoji grande
  const titleY = 820;       // título principal
  const subY = 950;         // subtítulo
  const bulletsY = 1180;    // bullets começam aqui
  const ctaY = 1640;        // CTA Kairós

  const bullets = app.bullets.map((b, i) => `
    <text x="540" y="${bulletsY + i * 80}" text-anchor="middle"
      font-family="Arial, sans-serif" font-weight="600" font-size="46"
      fill="${COR_BRANCO}">
      ✓ ${b}
    </text>
  `).join('');

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradTop" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.55"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gradBottom" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="40%" stop-color="#000000" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.75"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="3" result="offsetblur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.7"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- Sombras top/bottom pra legibilidade -->
  <rect x="0" y="0" width="${W}" height="700" fill="url(#gradTop)"/>
  <rect x="0" y="${H - 700}" width="${W}" height="700" fill="url(#gradBottom)"/>

  <!-- Badge "APP X de 6" -->
  <rect x="${W/2 - 160}" y="${badgeY - 50}" width="320" height="80" rx="40"
    fill="${COR_VERDE}" opacity="0.95"/>
  <text x="${W/2}" y="${badgeY}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="800" font-size="40"
    fill="${COR_BRANCO}">
    APP ${idx + 1} de 6
  </text>

  <!-- Ícone emoji grande -->
  <text x="${W/2}" y="${iconeY + 100}" text-anchor="middle"
    font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif"
    font-size="200" filter="url(#shadow)">
    ${app.icone}
  </text>

  <!-- Título principal -->
  <text x="${W/2}" y="${titleY}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="${titleSize}" fill="${COR_DOURADO}"
    letter-spacing="6" filter="url(#shadow)">
    ${app.titulo}
  </text>

  <!-- Subtítulo -->
  <text x="${W/2}" y="${subY}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="700"
    font-size="${subSize}" fill="${COR_BRANCO}"
    filter="url(#shadow)">
    ${app.subtitulo}
  </text>

  <!-- Bullets -->
  ${bullets}

  <!-- CTA rodapé -->
  <rect x="${W/2 - 230}" y="${ctaY - 60}" width="460" height="110" rx="55"
    fill="${COR_DOURADO}"/>
  <text x="${W/2}" y="${ctaY + 18}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="52" fill="#000000">
    ✦ Kairós ✦
  </text>
  <text x="${W/2}" y="${ctaY + 80}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="600"
    font-size="34" fill="#000000" opacity="0.7">
    fbautomacao.space
  </text>
</svg>`;
}

// Função: gerar MP4 slideshow com ffmpeg (concat demuxer)
async function makeSlideshowMp4(slideFiles, outFile, durationPerSlide = 3) {
  // Montar lista concat
  const listPath = join(__dirname, '_apps-list.txt');
  const listContent = slideFiles.flatMap(f => [`file '${f}'`, `duration ${durationPerSlide}`]).join('\n') + `\nfile '${slideFiles[slideFiles.length - 1]}'\n`;
  await writeFile(listPath, listContent, 'utf-8');

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', listPath,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '22',
      '-movflags', '+faststart',
      outFile,
    ];
    const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
    ff.on('close', code => code === 0 ? resolve(outFile) : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

// MAIN
async function main() {
  console.log('▶ Compondo slides dos apps Kairós...');
  const slideFiles = [];

  for (let i = 0; i < APPS.length; i++) {
    const app = APPS[i];
    const bgPath = join(__dirname, app.bg);
    const outPath = join(__dirname, `app-${app.slug}.png`);
    const svg = makeTextOverlay(app, i);

    console.log(`  → ${app.slug} (${i + 1}/${APPS.length})`);

    await sharp(bgPath)
      .resize(W, H, { fit: 'cover', position: 'center' })
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .png({ quality: 92 })
      .toFile(outPath);

    slideFiles.push(outPath);
  }

  console.log('▶ Gerando MP4 slideshow...');
  const mp4Path = join(__dirname, 'apps-kairos.mp4');
  await makeSlideshowMp4(slideFiles, mp4Path, 3);
  console.log(`✓ Pronto: ${mp4Path}`);
}

main().catch(err => {
  console.error('✗ Falhou:', err);
  process.exit(1);
});
