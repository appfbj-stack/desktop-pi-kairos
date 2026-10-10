// apps-8-each.mjs — 8 slides POR APP × 6 apps = 48 imagens + 6 Reels
// Estrutura de cada carrossel:
//   1. CAPA gancho (dor)
//   2. DOR específica
//   3. CONSEQUÊNCIA da dor
//   4. APRESENTAÇÃO da solução
//   5-7. 3 BENEFÍCIOS
//   8. CTA "Teste grátis"

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
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

const APPS = [
  {
    slug: 'oficina',
    bg: 'bg-oficina.png',
    icone: '🔧',
    cor: '#F97316',
    publico: 'Mecânico',
    appNome: 'Kairós OFICINA',
    slides: [
      { tipo: 'puro_radial', badge: 'ATENÇÃO', badgeCor: COR_VERMELHO, gancho: 'Mecânico, você ainda perde cliente', destaque: 'POR DESORGANIZAÇÃO?', rodape: 'PASSE O DEDO' },
      { tipo: 'com_bg', badge: 'DOR #1', badgeCor: COR_VERMELHO, icone: '📋', gancho: 'OS no papel?', destaque: 'PEÇA SUMIU?', solucao: 'Cliente ligou cobrando e você não acha a peça', rodape: 'Dói no bolso' },
      { tipo: 'com_bg', badge: 'DOR #2', badgeCor: COR_VERMELHO, icone: '😤', gancho: 'Cada ordem perdida', destaque: '= R$ 500 JOGADOS FORA', solucao: 'Sem controle, o prejuízo some sem você ver', rodape: 'É dinheiro voando' },
      { tipo: 'com_bg', badge: 'APRESENTAÇÃO', badgeCor: COR_VERDE, icone: '🚀', gancho: 'Conheça o', destaque: 'KAIRÓS OFICINA', solucao: 'Gestão completa da sua oficina em 1 tela', rodape: 'Pronto pra usar' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 1', badgeCor: COR_DOURADO, icone: '📝', gancho: 'Ordens de serviço', destaque: 'EM 30 SEGUNDOS', solucao: 'Crie OS pelo celular, direto da bancada', rodape: 'Sem papel' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 2', badgeCor: COR_DOURADO, icone: '📦', gancho: 'Estoque de peças', destaque: 'COM ALERTA', solucao: 'Aviso automático quando peça acaba ou vence', rodape: 'Nunca mais falta' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 3', badgeCor: COR_DOURADO, icone: '🚗', gancho: 'Histórico do cliente', destaque: 'TUDO NA MÃO', solucao: 'Veículo, serviços anteriores, peças trocadas', rodape: 'Atendimento VIP' },
      { tipo: 'puro_radial_verde', badge: 'BORA?', badgeCor: COR_VERDE, gancho: 'Teste o Kairós Oficina', destaque: '7 DIAS GRÁTIS', solucao: 'Sem cartão • Setup em 5 min', rodape: 'fbautomacao.space' },
    ],
  },
  {
    slug: 'igreja',
    bg: 'bg-igreja.png',
    icone: '⛪',
    cor: '#8B5CF6',
    publico: 'Pastor',
    appNome: 'Kairós IGREJA',
    slides: [
      { tipo: 'puro_radial', badge: 'ATENÇÃO', badgeCor: COR_VERMELHO, gancho: 'Pastor, você ainda controla membros', destaque: 'EM PLANILHA?', rodape: 'PASSE O DEDO' },
      { tipo: 'com_bg', badge: 'DOR #1', badgeCor: COR_VERMELHO, icone: '🎂', gancho: 'Aniversariante', destaque: 'ESQUECIDO?', solucao: 'Membro faz aniversário e ninguém da igreja parabeniza', rodape: 'Dói no coração' },
      { tipo: 'com_bg', badge: 'DOR #2', badgeCor: COR_VERMELHO, icone: '🐑', gancho: 'Discipulado sem registro', destaque: '= OVELHA SEM CUIDADO', solucao: 'Você não sabe quem está há 6 meses sem vir', rodape: 'Risco pro rebanho' },
      { tipo: 'com_bg', badge: 'APRESENTAÇÃO', badgeCor: COR_VERDE, icone: '✨', gancho: 'Conheça o', destaque: 'KAIRÓS IGREJA', solucao: 'Sistema pastoral completo, com IA bíblica', rodape: 'Foco no rebanho' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 1', badgeCor: COR_DOURADO, icone: '👥', gancho: 'Cadastro de membros', destaque: 'E FAMÍLIAS', solucao: 'Vínculos, visitas, batismos, tudo organizado', rodape: 'Tudo num lugar' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 2', badgeCor: COR_DOURADO, icone: '📅', gancho: 'Agenda pastoral', destaque: 'COM LEMBRETE', solucao: 'Aviso automático de visita, reunião, aniversário', rodape: 'Nunca mais perca' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 3', badgeCor: COR_DOURADO, icone: '🤖', gancho: 'Chat com IA bíblica', destaque: 'PRA ESTUDOS', solucao: 'Pesquise versículos, prepare sermões, tire dúvidas', rodape: 'Auxílio teológico' },
      { tipo: 'puro_radial_verde', badge: 'BORA?', badgeCor: COR_VERDE, gancho: 'Teste o Kairós Igreja', destaque: '7 DIAS GRÁTIS', solucao: 'Sem cartão • Setup em 5 min', rodape: 'fbautomacao.space' },
    ],
  },
  {
    slug: 'esquadrias',
    bg: 'bg-esquadrias.png',
    icone: '🪟',
    cor: '#0EA5E9',
    publico: 'Serralheiro',
    appNome: 'Kairós ESQUADRIAS',
    slides: [
      { tipo: 'puro_radial', badge: 'ATENÇÃO', badgeCor: COR_VERMELHO, gancho: 'Serralheiro, ainda faz orçamento', destaque: 'NO CADERNO?', rodape: 'PASSE O DEDO' },
      { tipo: 'com_bg', badge: 'DOR #1', badgeCor: COR_VERMELHO, icone: '🧮', gancho: 'Calculadora na mão?', destaque: 'TABELA CONFUSA?', solucao: 'Pula linha do Excel, soma diferente cada vez', rodape: 'Cansaço' },
      { tipo: 'com_bg', badge: 'DOR #2', badgeCor: COR_VERMELHO, icone: '⏱️', gancho: '1 orçamento', destaque: '= 40 MINUTOS', solucao: 'Você perde 5 orçamentos por semana esperando', rodape: 'Cliente desiste' },
      { tipo: 'com_bg', badge: 'APRESENTAÇÃO', badgeCor: COR_VERDE, icone: '⚡', gancho: 'Conheça o', destaque: 'KAIRÓS ESQUADRIAS', solucao: 'Orçamento profissional em 15 segundos', rodape: 'Velocidade' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 1', badgeCor: COR_DOURADO, icone: '📐', gancho: 'Cálculo automático', destaque: 'DE MATERIAIS', solucao: 'Perfis, vidros, ferragens — tudo na medida certa', rodape: 'Sem erro' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 2', badgeCor: COR_DOURADO, icone: '💰', gancho: 'Banco de preços', destaque: 'SEMPRE ATUALIZADO', solucao: 'Cadastre seus fornecedores e margens uma vez', rodape: 'Lucro garantido' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 3', badgeCor: COR_DOURADO, icone: '📄', gancho: 'PDF profissional', destaque: 'PRONTO PRA ENVIAR', solucao: 'Logo, dados do cliente, validade — tudo incluso', rodape: 'Impressiona' },
      { tipo: 'puro_radial_verde', badge: 'BORA?', badgeCor: COR_VERDE, gancho: 'Teste o Kairós Esquadrias', destaque: '7 DIAS GRÁTIS', solucao: 'Sem cartão • Setup em 5 min', rodape: 'fbautomacao.space' },
    ],
  },
  {
    slug: 'crm',
    bg: 'bg-crm.png',
    icone: '🤝',
    cor: '#10B981',
    publico: 'Vendedor',
    appNome: 'Kairós CRM',
    slides: [
      { tipo: 'puro_radial', badge: 'ATENÇÃO', badgeCor: COR_VERMELHO, gancho: 'Vendedor, ainda perde lead', destaque: 'NO WHATSAPP?', rodape: 'PASSE O DEDO' },
      { tipo: 'com_bg', badge: 'DOR #1', badgeCor: COR_VERMELHO, icone: '👻', gancho: 'Cliente sumiu', destaque: 'DEPOIS DA 1ª CONVERSA?', solucao: 'Tinha interesse, mas você não fez follow-up', rodape: 'Dinheiro na mesa' },
      { tipo: 'com_bg', badge: 'DOR #2', badgeCor: COR_VERMELHO, icone: '📉', gancho: 'Lead frio', destaque: '= 70% DO FATURAMENTO', solucao: 'Estudos mostram: lead sem retorno não compra', rodape: 'Venda perdida' },
      { tipo: 'com_bg', badge: 'APRESENTAÇÃO', badgeCor: COR_VERDE, icone: '🎯', gancho: 'Conheça o', destaque: 'KAIRÓS CRM', solucao: 'Pipeline + WhatsApp + prospecção em 1 lugar', rodape: 'Mais vendas' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 1', badgeCor: COR_DOURADO, icone: '📊', gancho: 'Pipeline visual', destaque: 'ESTILO KANBAN', solucao: 'Lead novo → negociação → fechamento, arrastar e soltar', rodape: 'Visão total' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 2', badgeCor: COR_DOURADO, icone: '💬', gancho: 'WhatsApp integrado', destaque: 'COM HISTÓRICO', solucao: 'Todas as conversas salvas no lead, sem perder nada', rodape: 'Contexto completo' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 3', badgeCor: COR_DOURADO, icone: '🌐', gancho: 'Prospecção automática', destaque: 'BUSCA NA WEB', solucao: 'Encontre leads do seu nicho em segundos', rodape: 'Nunca pare' },
      { tipo: 'puro_radial_verde', badge: 'BORA?', badgeCor: COR_VERDE, gancho: 'Teste o Kairós CRM', destaque: '7 DIAS GRÁTIS', solucao: 'Sem cartão • Setup em 5 min', rodape: 'fbautomacao.space' },
    ],
  },
  {
    slug: 'almoxarifado',
    bg: 'bg-almoxarifado.png',
    icone: '📦',
    cor: '#F59E0B',
    publico: 'Empresário',
    appNome: 'Kairós ALMOXARIFADO',
    slides: [
      { tipo: 'puro_radial', badge: 'ATENÇÃO', badgeCor: COR_VERMELHO, gancho: 'Empresário, sabe quanto tem', destaque: 'NO SEU ESTOQUE?', rodape: 'PASSE O DEDO' },
      { tipo: 'com_bg', badge: 'DOR #1', badgeCor: COR_VERMELHO, icone: '🔁', gancho: 'Compra duplicada?', destaque: 'PRODUTO PARADO?', solucao: 'Você tem 3 caixas do mesmo item há 8 meses', rodape: 'Capital travado' },
      { tipo: 'com_bg', badge: 'DOR #2', badgeCor: COR_VERMELHO, icone: '💸', gancho: 'Estoque sem controle', destaque: '= 20% DO FATURAMENTO', solucao: 'Estudos: 1 em cada 5 reais some no estoque', rodape: 'Prejuízo invisível' },
      { tipo: 'com_bg', badge: 'APRESENTAÇÃO', badgeCor: COR_VERDE, icone: '🏷️', gancho: 'Conheça o', destaque: 'KAIRÓS ALMOXARIFADO', solucao: 'Controle total de entrada, saída e giro', rodape: 'Visão clara' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 1', badgeCor: COR_DOURADO, icone: '📲', gancho: 'Entrada e saída', destaque: 'POR CÓDIGO DE BARRAS', solucao: 'Bipeou, registrou. Sem planilha, sem erro', rodape: 'Agilidade' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 2', badgeCor: COR_DOURADO, icone: '🔔', gancho: 'Alertas automáticos', destaque: 'DE MÍNIMO', solucao: 'Aviso quando item chega no estoque crítico', rodape: 'Nunca falte' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 3', badgeCor: COR_DOURADO, icone: '📈', gancho: 'Relatórios simples', destaque: 'GIRO E VALIDADE', solucao: 'Veja o que sai, o que vence, o que sobra', rodape: 'Decisão certa' },
      { tipo: 'puro_radial_verde', badge: 'BORA?', badgeCor: COR_VERDE, gancho: 'Teste o Kairós Almoxarifado', destaque: '7 DIAS GRÁTIS', solucao: 'Sem cartão • Setup em 5 min', rodape: 'fbautomacao.space' },
    ],
  },
  {
    slug: 'beleza',
    bg: 'bg-beleza.png',
    icone: '💇',
    cor: '#EC4899',
    publico: 'Dono de salão',
    appNome: 'Kairós BELEZA',
    slides: [
      { tipo: 'puro_radial', badge: 'ATENÇÃO', badgeCor: COR_VERMELHO, gancho: 'Dono de salão, agenda lotada', destaque: 'E CLIENTE SOME?', rodape: 'PASSE O DEDO' },
      { tipo: 'com_bg', badge: 'DOR #1', badgeCor: COR_VERMELHO, icone: '🚫', gancho: 'No-show de 30%?', destaque: 'HORÁRIO VAGO NO SÁBADO?', solucao: 'Cadeira parada enquanto você paga profissional', rodape: 'Dinheiro perdido' },
      { tipo: 'com_bg', badge: 'DOR #2', badgeCor: COR_VERMELHO, icone: '💸', gancho: 'Cada no-show', destaque: '= R$ 100 QUE NÃO RECEBE', solucao: 'Multiplique por 30 dias: R$ 3.000/mês evaporando', rodape: 'Cresce o buraco' },
      { tipo: 'com_bg', badge: 'APRESENTAÇÃO', badgeCor: COR_VERDE, icone: '💄', gancho: 'Conheça o', destaque: 'KAIRÓS BELEZA', solucao: 'Agenda + WhatsApp + comissão em 1 app', rodape: 'Salão no controle' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 1', badgeCor: COR_DOURADO, icone: '📲', gancho: 'Agenda online 24h', destaque: 'COM CONFIRMAÇÃO', solucao: 'Cliente agenda sozinho, recebe confirmação automática', rodape: 'Zero telefone' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 2', badgeCor: COR_DOURADO, icone: '⏰', gancho: 'Lembrete WhatsApp', destaque: '1 HORA ANTES', solucao: 'Cliente não esquece. No-show despenca 80%', rodape: 'Cadeira cheia' },
      { tipo: 'com_bg', badge: 'BENEFÍCIO 3', badgeCor: COR_DOURADO, icone: '💵', gancho: 'Comissão por profissional', destaque: 'AUTOMÁTICA', solucao: 'Sistema calcula e mostra pra cada um na hora', rodape: 'Transparência' },
      { tipo: 'puro_radial_verde', badge: 'BORA?', badgeCor: COR_VERDE, gancho: 'Teste o Kairós Beleza', destaque: '7 DIAS GRÁTIS', solucao: 'Sem cartão • Setup em 5 min', rodape: 'fbautomacao.space' },
    ],
  },
];

function adaptiveFontSize(text, maxWidth, baseRatio = 0.62, maxSize = 130) {
  const chars = text.length;
  return Math.min(maxSize, Math.floor((maxWidth * 0.92) / (chars * baseRatio)));
}

// Quebra texto em linhas com base em caracteres por linha (word-wrap)
function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if ((current + ' ' + w).length <= maxCharsPerLine) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Render SVG text com múltiplas linhas via tspan
function multiLineText({ x, y, lines, fontSize, fontWeight, fill, fontFamily = 'Arial, sans-serif', letterSpacing = 0, filter = '' }) {
  const lineHeight = fontSize * 1.15;
  const totalHeight = (lines.length - 1) * lineHeight;
  const startY = y - totalHeight / 2;
  return lines.map((line, i) => `
    <text x="${x}" y="${startY + i * lineHeight}" text-anchor="middle"
      font-family="${fontFamily}" font-weight="${fontWeight}"
      font-size="${fontSize}" fill="${fill}" letter-spacing="${letterSpacing}"
      ${filter ? `filter="url(#${filter})"` : ''}>${line}</text>
  `).join('');
}

function makeRadialSvg(opts) {
  const { badge, badgeCor, gancho, destaque, rodape, icone, cor, isCta } = opts;
  const gradientStart = isCta ? '#064E3B' : '#1E1B4B';
  const gradientMid = isCta ? '#022C22' : '#0F0A2E';
  const gradId = isCta ? 'gradCta' : 'gradCapa';
  const circleOpacity = isCta ? '0.25' : '0.15';
  const iconeSize = isCta ? 200 : 240;
  const iconeY = isCta ? 600 : 700;
  const destaqueSize = adaptiveFontSize(destaque, W, 0.5);
  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="${gradId}" cx="50%" cy="40%" r="80%">
      <stop offset="0%" stop-color="${gradientStart}"/>
      <stop offset="50%" stop-color="${gradientMid}"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="8" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#${gradId})"/>
  <circle cx="540" cy="${iconeY - 100}" r="500" fill="none" stroke="${COR_DOURADO}" stroke-width="2" opacity="${circleOpacity}"/>
  <circle cx="540" cy="${iconeY - 100}" r="700" fill="none" stroke="${COR_DOURADO}" stroke-width="1" opacity="0.08"/>
  <text x="540" y="${iconeY + 80}" text-anchor="middle" font-size="${iconeSize}" filter="url(#glow)">${icone}</text>
  <text x="540" y="${iconeY + 280}" text-anchor="middle" font-family="Arial" font-weight="700"
    font-size="64" fill="${COR_BRANCO}" opacity="0.9">${gancho}</text>
  <text x="540" y="${iconeY + 400}" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="${destaqueSize}" fill="${isCta ? COR_DOURADO : COR_VERMELHO}" letter-spacing="6">${destaque}</text>
  ${isCta ? `
  <rect x="190" y="1300" width="700" height="110" rx="55" fill="${COR_DOURADO}"/>
  <text x="540" y="1380" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="60" fill="#000000">${badge} 7 DIAS GRÁTIS</text>
  <text x="540" y="1500" text-anchor="middle" font-family="Arial" font-weight="600"
    font-size="44" fill="${COR_BRANCO}">Sem cartão • Setup em 5 min</text>` : `
  <text x="540" y="${iconeY + 580}" text-anchor="middle" font-family="Arial" font-weight="700"
    font-size="58" fill="${COR_DOURADO}">▶ PASSE O DEDO ◀</text>`}
  <text x="540" y="${H - 100}" text-anchor="middle" font-family="Arial Black" font-weight="900"
    font-size="62" fill="${COR_DOURADO}" letter-spacing="4">${rodape}</text>
</svg>`;
}

function makeSlideSvg(slide, appNome, appIcone) {
  const badgeY = 320;
  const iconeY = 540;
  const ganchoY = 820;
  const destaqueY = 970;
  const solucaoY = 1320;
  const rodapeY = 1700;
  const badgeSize = 56;

  // Tamanhos adaptativos mais conservadores (texto em CAPS + Arial Black é mais largo)
  // Quebrar destaque em 2 linhas se passar de 14 chars
  const destaqueFullSize = adaptiveFontSize(slide.destaque, W, 0.75, 80);
  const destaqueLines = slide.destaque.length > 14
    ? wrapText(slide.destaque, 14)
    : [slide.destaque];
  const destaqueSize = destaqueLines.length > 1
    ? adaptiveFontSize(destaqueLines[0], W, 0.7, 90)
    : destaqueFullSize;

  const ganchoLines = wrapText(slide.gancho, 24);
  const solucaoLines = slide.solucao ? wrapText(slide.solucao, 32) : [];
  const solucaoSize = 38;

  const ganchoSvg = multiLineText({
    x: W/2, y: ganchoY, lines: ganchoLines,
    fontSize: 50, fontWeight: 700, fill: COR_BRANCO,
    filter: 'shadow',
  });

  const destaqueSvg = destaqueLines.length > 1 ? multiLineText({
    x: W/2, y: destaqueY, lines: destaqueLines,
    fontSize: destaqueSize, fontWeight: 900, fill: COR_VERMELHO,
    fontFamily: 'Arial Black, Arial, sans-serif', letterSpacing: 1,
    filter: 'shadow',
  }) : `
    <text x="${W/2}" y="${destaqueY}" text-anchor="middle"
      font-family="Arial Black, Arial, sans-serif" font-weight="900"
      font-size="${destaqueSize}" fill="${COR_VERMELHO}" letter-spacing="1"
      filter="url(#shadow)">${slide.destaque}</text>
  `;

  const solucaoSvg = solucaoLines.length > 0 ? multiLineText({
    x: W/2, y: solucaoY, lines: solucaoLines,
    fontSize: solucaoSize, fontWeight: 700, fill: COR_BRANCO,
    filter: 'shadow',
  }) : '';

  return `
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gradTop" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.75"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gradBottom" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="40%" stop-color="#000000" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.88"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="6"/>
      <feOffset dx="0" dy="3" result="o"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.8"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect x="0" y="0" width="${W}" height="700" fill="url(#gradTop)"/>
  <rect x="0" y="${H - 700}" width="${W}" height="700" fill="url(#gradBottom)"/>
  <rect x="${W/2 - 220}" y="${badgeY - 50}" width="440" height="80" rx="40" fill="${slide.badgeCor}"/>
  <text x="${W/2}" y="${badgeY + 5}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="${badgeSize}" fill="${COR_BRANCO}" letter-spacing="3">${slide.badge}</text>
  <text x="${W/2}" y="${iconeY + 90}" text-anchor="middle"
    font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif"
    font-size="160" filter="url(#shadow)">${slide.icone}</text>
  ${ganchoSvg}
  ${destaqueSvg}
  ${solucaoSvg}
  <rect x="100" y="${rodapeY - 60}" width="${W - 200}" height="100" rx="50" fill="${COR_DOURADO}"/>
  <text x="${W/2}" y="${rodapeY + 12}" text-anchor="middle"
    font-family="Arial Black, Arial, sans-serif" font-weight="900"
    font-size="40" fill="#000000" letter-spacing="2">✦ ${slide.rodape} ✦</text>
</svg>`;
}

async function makeReelMp4(slideFiles, outFile, durationPerSlide = 3) {
  const listPath = join(__dirname, `_each-list.txt`);
  const lines = [];
  for (const f of slideFiles) {
    lines.push(`file '${f}'`);
    lines.push(`duration ${durationPerSlide}`);
  }
  lines.push(`file '${slideFiles[slideFiles.length - 1]}'`);
  await writeFile(listPath, lines.join('\n'), 'utf-8');
  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-movflags', '+faststart', outFile,
    ];
    const ff = spawn('ffmpeg', args, { stdio: 'inherit' });
    ff.on('close', code => code === 0 ? resolve(outFile) : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

async function main() {
  console.log(`▶ Gerando ${APPS.length} apps × 8 slides = ${APPS.length * 8} imagens...\n`);

  const reelSlides = {}; // { slug: [slidePaths] }

  for (const app of APPS) {
    console.log(`\n═══ ${app.slug.toUpperCase()} (${app.appNome}) ═══`);
    const slideFiles = [];

    for (let i = 0; i < app.slides.length; i++) {
      const s = app.slides[i];
      const outPath = join(__dirname, `each-${app.slug}-${i + 1}.png`);

      if (s.tipo === 'puro_radial') {
        const svg = makeRadialSvg({ ...s, isCta: false, icone: app.icone });
        await sharp(Buffer.from(svg)).resize(W, H).png({ quality: 92 }).toFile(outPath);
      } else if (s.tipo === 'puro_radial_verde') {
        const svg = makeRadialSvg({ ...s, isCta: true, icone: app.icone });
        await sharp(Buffer.from(svg)).resize(W, H).png({ quality: 92 }).toFile(outPath);
      } else {
        const bgPath = join(__dirname, app.bg);
        const svg = makeSlideSvg(s, app.appNome, app.icone);
        await sharp(bgPath).resize(W, H, { fit: 'cover', position: 'center' })
          .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
          .png({ quality: 92 }).toFile(outPath);
      }

      console.log(`  ✓ slide ${i + 1}/8 — ${s.badge}`);
      slideFiles.push(outPath);
    }

    reelSlides[app.slug] = slideFiles;
  }

  console.log('\n▶ Gerando 6 Reels (cada um 24s)...');
  for (const app of APPS) {
    const mp4 = join(__dirname, `each-${app.slug}.mp4`);
    await makeReelMp4(reelSlides[app.slug], mp4, 3);
    console.log(`  ✓ ${app.slug}.mp4`);
  }

  console.log('\n✓ Pronto!');
}

main().catch(err => {
  console.error('✗ Falhou:', err);
  process.exit(1);
});
