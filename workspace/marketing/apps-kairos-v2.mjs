// apps-kairos-v2.mjs — Carrossel "Reels de Vendas" — 8 slides + MP4 slideshow (concat demuxer, 3s/slide)

import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const W = 1080;
const H = 1920;

const COR_DOURADO = '#F5C518';
const COR_BRANCO = '#FFFFFF';
const COR_VERMELHO = '#EF4444';
const COR_VERDE = '#10B981';

const SLIDES = [
  {
    slug: 'capa',
    icone: '⚡',
    badge: 'ATENÇÃO',
    badgeCor: COR_VERMELHO,
    gancho: 'Sua empresa ainda controla tudo',
    destaque: 'NO CADERNO?',
    rodape: 'PASSE O DEDO',
    tipo: 'puro',
  },
  {
    slug: 'oficina',
    bg: 'bg-oficina.png',
    icone: '🔧',
    badge: 'DOR #1',
    badgeCor: COR_VERMELHO,
    gancho: 'Perde cliente porque',
    destaque: 'NÃO ACHOU A PEÇA?',
    solucao: 'Kairós Oficina: estoque + OS + cliente',
    rodape: 'Tudo em 1 tela',
    tipo: 'com_bg',
  },
  {
    slug: 'igreja',
    bg: 'bg-igreja.png',
    icone: '⛪',
    badge: 'DOR #2',
    badgeCor: COR_VERMELHO,
    gancho: 'Pastor, controla membros',
    destaque: 'EM PLANILHA?',
    solucao: 'Kairós Igreja: cadastro + agenda + IA bíblica',
    rodape: 'Foco no rebanho',
    tipo: 'com_bg',
  },
  {
    slug: 'esquadrias',
    bg: 'bg-esquadrias.png',
    icone: '🪟',
    badge: 'DOR #3',
    badgeCor: COR_VERMELHO,
    gancho: 'Faz orçamento de esquadria',
    destaque: 'NO BRAÇO?',
    solucao: 'Kairós Esquadrias: cálculo + PDF profissional',
    rodape: '15 seg por orçamento',
    tipo: 'com_bg',
  },
  {
    slug: 'crm',
    bg: 'bg-crm.png',
    icone: '🤝',
    badge: 'DOR #4',
    badgeCor: COR_VERMELHO,
    gancho: 'Lead frio no WhatsApp',
    destaque: '= DINHEIRO NA MESA',
    solucao: 'Kairós CRM: pipeline + WhatsApp + prospecção',
    rodape: 'Nunca mais perca lead',
    tipo: 'com_bg',
  },
  {
    slug: 'almoxarifado',
    bg: 'bg-almoxarifado.png',
    icone: '📦',
    badge: 'DOR #5',
    badgeCor: COR_VERMELHO,
    gancho: 'Estoque sem controle',
    destaque: '= PREJUÍZO INVISÍVEL',
    solucao: 'Kairós Almoxarifado: entrada/saída + alertas',
    rodape: 'Tempo real',
    tipo: 'com_bg',
  },
  {
    slug: 'beleza',
    bg: 'bg-beleza.png',
    icone: '💇',
    badge: 'DOR #6',
    badgeCor: COR_VERMELHO,
    gancho: 'Agenda lotada e cliente',
    destaque: 'ESQUECE O HORÁRIO?',
    solucao: 'Kairós Beleza: agenda + WhatsApp + comissão',
    rodape: 'Zero no-show',
    tipo: 'com_bg',
  },
  {
    slug: 'cta',
    icone: '🚀',
    badge: 'VAI ESPERAR?',
    badgeCor: COR_VERDE,
    gancho: 'Comece HOJE',
    destaque: 'TESTE GRÁTIS',
    solucao: 'Todos os apps • Sem cartão • 5 min setup',
    rodape: 'fbautomacao.space',
    tipo: 'puro',
  },
];

function adaptiveFontSize(text, maxWidth, baseRatio = 0.62) {
  const chars = text.length;
  return Math.min(170, Math.floor((maxWidth * 0.90) / (chars * baseRatio)));
}

function makeCapaSvg() {
  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gradBg" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#1E1B4B"/>
      <stop offset="50%" stop-color="#0F0A2E"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#gradBg)"/>
  <circle cx="540" cy="700" r="500" fill="none" stroke="${COR_DOURADO}" stroke-width="2" opacity="0.15"/>
  <circle cx="540" cy="700" r="700" fill="none" stroke="${COR_DOURADO}" stroke-width="1" opacity="0.08"/>
  <text x="540" y="800" text-anchor="middle" font-size="320" filter="url(#glow)">⚡</text>
  <text x="540" y="1100" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="100" fill="${COR_DOURADO}" letter-spacing="6">SUA EMPRESA</text>
  <text x="540" y="1230" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="100" fill="${COR_BRANCO}" letter-spacing="6">AINDA CONTROLA</text>
  <text x="540" y="1370" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="120" fill="${COR_VERMELHO}" letter-spacing="8">NO CADERNO?</text>
  <text x="540" y="1750" text-anchor="middle" font-family="Arial" font-weight="700"
    font-size="58" fill="${COR_DOURADO}">▶ PASSE O DEDO ◀</text>
</svg>`;
}

function makeCtaSvg() {
  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="gradBg2" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="#064E3B"/>
      <stop offset="50%" stop-color="#022C22"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <filter id="glow2" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#gradBg2)"/>
  <circle cx="540" cy="600" r="450" fill="none" stroke="${COR_DOURADO}" stroke-width="2" opacity="0.2"/>
  <text x="540" y="720" text-anchor="middle" font-size="280" filter="url(#glow2)">🚀</text>
  <text x="540" y="970" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="130" fill="${COR_BRANCO}" letter-spacing="6">COMECE</text>
  <text x="540" y="1120" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="160" fill="${COR_DOURADO}" letter-spacing="6">HOJE</text>
  <rect x="190" y="1240" width="700" height="110" rx="55" fill="${COR_DOURADO}"/>
  <text x="540" y="1320" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="60" fill="#000000">TESTE GRÁTIS</text>
  <text x="540" y="1450" text-anchor="middle" font-family="Arial" font-weight="600"
    font-size="44" fill="${COR_BRANCO}">Todos os apps • Sem cartão</text>
  <text x="540" y="1510" text-anchor="middle" font-family="Arial" font-weight="600"
    font-size="44" fill="${COR_BRANCO}">Setup em 5 minutos</text>
  <text x="540" y="1720" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="62" fill="${COR_DOURADO}" letter-spacing="4">fbautomacao.space</text>
  <text x="540" y="1780" text-anchor="middle" font-family="Arial" font-weight="600"
    font-size="38" fill="${COR_BRANCO}" opacity="0.7">✦ Kairós ✦</text>
</svg>`;
}

function makeSlideSvg(slide) {
  const badgeY = 320;
  const iconeY = 540;
  const ganchoY = 820;
  const destaqueY = 950;
  const solucaoY = 1240;
  const rodapeY = 1700;

  const badgeSize = 60;
  const destaqueSize = adaptiveFontSize(slide.destaque, W, 0.5);
  const solucaoSize = 56;

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradTop2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.7"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gradBottom2" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="40%" stop-color="#000000" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="shadow2" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="3" result="offsetblur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.8"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="0" y="0" width="${W}" height="700" fill="url(#gradTop2)"/>
  <rect x="0" y="${H - 700}" width="${W}" height="700" fill="url(#gradBottom2)"/>

  <rect x="${W/2 - 200}" y="${badgeY - 55}" width="400" height="90" rx="45" fill="${slide.badgeCor}"/>
  <text x="${W/2}" y="${badgeY + 8}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="${badgeSize}" fill="${COR_BRANCO}" letter-spacing="4">${slide.badge}</text>

  <text x="${W/2}" y="${iconeY + 100}" text-anchor="middle"
    font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif"
    font-size="200" filter="url(#shadow2)">${slide.icone}</text>

  <text x="${W/2}" y="${ganchoY}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="700"
    font-size="58" fill="${COR_BRANCO}" opacity="0.9" filter="url(#shadow2)">
    ${slide.gancho}
  </text>

  <text x="${W/2}" y="${destaqueY + 30}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="${destaqueSize}" fill="${COR_VERMELHO}" letter-spacing="4"
    filter="url(#shadow2)">${slide.destaque}</text>

  ${slide.solucao ? `
  <text x="${W/2}" y="${solucaoY}" text-anchor="middle"
    font-family="Arial, sans-serif" font-weight="700"
    font-size="${solucaoSize}" fill="${COR_BRANCO}" filter="url(#shadow2)">
    ${slide.solucao}
  </text>` : ''}

  <rect x="120" y="${rodapeY - 60}" width="${W - 240}" height="100" rx="50"
    fill="${COR_DOURADO}"/>
  <text x="${W/2}" y="${rodapeY + 12}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="48" fill="#000000" letter-spacing="3">
    ✦ ${slide.rodape} ✦
  </text>
</svg>`;
}

// Concat demuxer (corte seco entre slides) — funciona garantido
async function makeSlideshowMp4(slideFiles, outFile, durationPerSlide = 3) {
  const listPath = join(__dirname, '_v2-list.txt');
  const lines = [];
  for (const f of slideFiles) {
    lines.push(`file '${f}'`);
    lines.push(`duration ${durationPerSlide}`);
  }
  // ffmpeg concat demuxer requer repetir o último file sem duration
  lines.push(`file '${slideFiles[slideFiles.length - 1]}'`);
  await writeFile(listPath, lines.join('\n'), 'utf-8');

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

async function main() {
  console.log('▶ Compondo 8 slides...');
  const slideFiles = [];

  for (let i = 0; i < SLIDES.length; i++) {
    const s = SLIDES[i];
    const outPath = join(__dirname, `v2-${s.slug}.png`);

    if (s.tipo === 'puro') {
      const svg = s.slug === 'capa' ? makeCapaSvg() : makeCtaSvg();
      await sharp(Buffer.from(svg))
        .resize(W, H)
        .png({ quality: 92 })
        .toFile(outPath);
    } else {
      const bgPath = join(__dirname, s.bg);
      const svg = makeSlideSvg(s);
      await sharp(bgPath)
        .resize(W, H, { fit: 'cover', position: 'center' })
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png({ quality: 92 })
        .toFile(outPath);
    }

    console.log(`  → ${s.slug} (${i + 1}/8)`);
    slideFiles.push(outPath);
  }

  console.log('▶ Gerando MP4 Reels (24s, concat demuxer)...');
  const mp4Path = join(__dirname, 'apps-kairos-reel.mp4');
  await makeSlideshowMp4(slideFiles, mp4Path, 3);
  console.log(`✓ Pronto: ${mp4Path}`);
}

main().catch(err => {
  console.error('✗ Falhou:', err);
  process.exit(1);
});
