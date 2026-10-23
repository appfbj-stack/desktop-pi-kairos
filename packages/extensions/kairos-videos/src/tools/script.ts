/**
 * videos:script — transforma a descrição das telas em um roteiro curto.
 *
 * Usa o LLM configurado no app (MiniMax por padrão). O roteiro é escrito
 * para ~30s de narration, sem inventar funcionalidades: a instrução do sistema
 * exige que a IA peça confirmação quando não souber o que a tela faz.
 */

import { z } from "zod";
import type { Tool } from "@kairos/agent";
import fs from "node:fs";
import path from "node:path";
import { chatCompletion, MiniMaxError } from "../minimax.js";
import { getVideosRoot, safeName, STAGES } from "../config.js";

const inputSchema = z.object({
  description: z
    .string()
    .describe(
      "Descrição do que aparece na tela e do que o app faz. Quanto mais preciso, melhor o roteiro.",
    ),
  appName: z
    .string()
    .default("Kairós")
    .describe("Nome do aplicativo que está sendo demonstrado."),
  durationSec: z
    .number()
    .default(30)
    .describe("Duração alvo do vídeo em segundos (padrão 30, formato Shorts/Reels)."),
  language: z.string().default("pt-BR").describe("Idioma do roteiro."),
  model: z.string().optional().describe("Modelo do LLM. Se omitir, usa o configurado no app."),
  outputDir: z
    .string()
    .optional()
    .describe("Pasta onde salvar o roteiro (.md). Se omitir, usa 04_ROTEIROS da raiz configurada."),
  title: z.string().optional().describe("Título do projeto (para nomear o arquivo)."),
});

const SYSTEM_PROMPT = `Você é um roteirista de vídeos curtos para redes sociais (YouTube Shorts, Instagram Reels, TikTok) que promovem aplicativos de software.

REGRAS INCRÍVEIS:
1. Escreva o roteiro em {language}, tom direto e profissional, como um bom apresentador de produto.
2. Respeite o limite de {durationSec} segundos de narração. Cada frase deve ser curta e falada em voz alta.
3. NÃO invente funcionalidades. Use SOMENTE o que está descrito na descrição do aplicativo. Se a descrição for vaga sobre o que determinada tela faz, escreva no roteiro um marcador no formato [CONFIRMAR: o que precisa ser confirmado sobre a tela X] e explique isso ao final.
4. Estruture a saída assim:

# TITULO
(APENAS o título, no máximo 8 palavras. Escreva só o texto do título — sem aspas, sem numeração, sem explicar, sem contar palavras.)

# GANCHO
(primeira frase, 0-3s, que prende o atenção)

# ROTEIRO
(3 a 6 falas, uma por linha, no formato [0:00-0:05] texto da fala)

# CENA
(para cada fala, descreva em UMA linha o que aparece na tela, ex.: "tela do dashboard com o gráfico de vendas")

# CTA
(uma frase de chamada para ação)

# NOTAS
(confirmacoes pendentes, se houver; senao "Nenhuma")

# NARRACAO_COMPLETA
(o texto corrido de tudo que sera falado, sem marcadores de tempo, sem titulo e sem CTA - isso vira o audio do TTS)`;

export interface ScriptResult {
  markdown: string;
  narrationText: string;
  title: string;
  durationSec: number;
  savedTo: string | null;
  needsConfirmation: boolean;
  usedFallbackNarration?: boolean;
}

/**
 * Extrai uma seção "# TITULO" do markdown.
 * Splita por headers markdown e procura o título (case-insensitive, com ou sem acento).
 */
function extractSection(md: string, title: string): string {
  const lines = md.split(/\r?\n/);
  const target = title.toLowerCase();
  let collecting = false;
  const out: string[] = [];

  for (const line of lines) {
    const isHeader = /^#{1,6}\s+/.test(line);
    if (isHeader) {
      const headerText = line.replace(/^#{1,6}\s+/, "").trim().toLowerCase();
      // remove parênteses/anotações do header ex.: "titulo (5 palavras)"
      const clean = headerText.replace(/\(.*?\)/g, "").trim();
      if (clean === target || headerText === target) {
        collecting = true;
        continue;
      }
      if (collecting) break; // saiu da seção
      continue;
    }
    if (collecting) out.push(line);
  }

  return out.join("\n").trim();
}

/** Limpa ruído do título vindo do LLM (ex.: "5 palavras", aspas, asteriscos). */
function cleanTitle(raw: string): string {
  return (raw ?? "")
    .replace(/^\s*#+\s*/, "")
    .replace(/^\*+|\*+$/g, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\(\s*\d+\s*(palavras?|words?)\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .split("\n")[0]
    ?.trim() ?? "";
}

/**
 * Remove o bloco de raciocínio dos modelos "thinking" (MiniMax M3, M3.1, etc).
 * Esses modelos devolvem <think>...</think> antes da resposta final — se não
 * for removido, o TTS narraria o rascunho interno do modelo.
 */
export function stripThinking(markdown: string): string {
  return markdown
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();
}

export const videosScriptTool: Tool<typeof inputSchema> = {
  name: "videos:script",
  description:
    "Gera um roteiro de ~30 segundos a partir da descrição das telas, usando o LLM configurado no app. Salva o roteiro em 04_ROTEIROS. Se a descrição for insuficiente, marca [CONFIRMAR: ...] em vez de inventar.",
  dangerous: false,
  inputSchema,
  execute: async (input, ctx): Promise<ScriptResult> => {
    // Defaults aplicados aqui (e não só no schema) — a tool pode ser chamada
    // sem passar pelo parse do Zod, e "undefined" no prompt viraria lixo no roteiro.
    const language = input.language ?? "pt-BR";
    const durationSec = input.durationSec ?? 30;
    const appName = input.appName ?? "Kairós";

    const prompt = SYSTEM_PROMPT.replaceAll("{language}", language).replaceAll(
      "{durationSec}",
      String(durationSec),
    );

    let rawMarkdown: string;
    try {
      rawMarkdown = await chatCompletion(
        [
          { role: "system", content: prompt },
          {
            role: "user",
            content: `Aplicativo: ${appName}\n\nDescrição das telas:\n${input.description}`,
          },
        ],
        { model: input.model, maxTokens: 3000, signal: ctx.abortSignal },
      );
    } catch (err) {
      if (err instanceof MiniMaxError) {
        throw new Error(`Falha ao gerar o roteiro (${err.kind}): ${err.message}`);
      }
      throw err;
    }

    // Modelos "thinking" (MiniMax M3/M3.1) devolvem <think>...</think> antes
    // da resposta. Sem remover, o roteiro e a narração ficam poluídos.
    const markdown = stripThinking(rawMarkdown);

    if (!markdown.trim()) {
      throw new Error(
        "O modelo devolveu uma resposta vazia. Isso costuma acontecer quando o " +
          "limite de tokens corta o raciocínio do modelo antes da resposta final. " +
          "Tente novamente (o limite padrão já é 3000 tokens) ou use um modelo " +
          "sem raciocínio (ex.: MiniMax-M2.7-highspeed).",
      );
    }

    const narrationText = extractSection(markdown, "NARRACAO_COMPLETA");
    const titleSection = extractSection(markdown, "TITULO");
    const title = cleanTitle(titleSection) || cleanTitle(appName) || "video";
    const needsConfirmation = /\[CONFIRMAR:/i.test(markdown);

    // Se não achou a seção de narração, usa o roteiro inteiro como fallback
    // (melhor que narrar um roteiro vazio) — mas sinaliza.
    const finalNarration = narrationText || markdown;
    const usedFallback = !narrationText;

    let savedTo: string | null = null;
    try {
      const dir = input.outputDir?.trim()
        ? path.resolve(input.outputDir.trim())
        : path.join(getVideosRoot(), STAGES.SCRIPTS);
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${safeName(input.title || title)}.md`);
      fs.writeFileSync(file, markdown, "utf-8");
      savedTo = file;
    } catch (err) {
      // Falha ao salvar não invalida o roteiro gerado — só reporta.
      savedTo = null;
    }

    return {
      markdown,
      narrationText: finalNarration,
      title,
      durationSec,
      savedTo,
      needsConfirmation,
      usedFallbackNarration: usedFallback,
    };
  },
};
