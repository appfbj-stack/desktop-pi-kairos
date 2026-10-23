# Guia de Uso — Kairós Vídeos IA

**Como criar vídeos curtos de divulgação (YouTube Shorts / Instagram Reels) para os aplicativos Kairós.**

Extension: `packages/extensions/kairos-videos` · 6 tools · integrada ao Kairós Desktop Pi.

---

## 0. Teste rápido (2 minutos)

O app já está instalado e com as 6 tools ativas.

1. Abre o **Kairós Desktop Alves** (atalho na Desktop).
2. No chat, pede: *"cria um projeto de vídeo chamado teste-kairos"*
   → a tool `videos:project` cria as 6 pastas em `C:\Users\ferna\Videos\KAIROS_VIDEOS\`.
3. Pede: *"lista as vozes em português"* → a tool `videos:voice` devolve as 73 vozes PT-BR.
4. Pede: *"gera um vídeo de 30s sobre o painel de conversas do Kairós CRM"*
   → `videos:script` devolve o roteiro.

Se o app não abrir ou der `no such column: client_id`, o banco local precisa da
migração — o app já faz isso sozinho na próxima abertura (ver §6).

---

## 1. Pré-requisitos

| Item | Status | Observação |
|---|---|---|
| App Kairós Desktop Pi | ✅ | A extension já está registrada (23ª extension) |
| Chave MiniMax nas Configurações | ✅ necessária | Usada pelo roteiro (LLM) e pela narração (TTS) |
| ffmpeg | ✅ embutido | `ffmpeg-static` já vem no bundle do app — não instalar nada |
| GPU (NVENC) | ✅ opcional | Acelera o render; sem GPU, cai para libx264 automaticamente |
| OBS Studio | ✅ instalado | Para gravar a tela (recomendado) |
| HD externo | ⚠️ opcional | Sem ele, o export avisa e **não apaga** nada |

---

## 2. Fluxo em 6 passos

### Passo 1 — Gravar a tela (OBS Studio)

1. Abra o OBS Studio
2. Em **Fontes** → `+` → **Captura de Janela** → escolha o app que quer mostrar
   (dica: adicione uma fonte **Captura de Tela** como fallback)
3. Em **Configurações** → **Vídeo** → resolução **1080×1920**, FPS **30**
   (vertical, pronto pro Shorts)
4. Clique **Iniciar Gravação** → faça a demonstração (~30-45s) → **Parar**
5. O arquivo vai pra `Videos\` (ou o caminho configurado no OBS)

> **Por que OBS e não gravar dentro do app:** OBS já está instalado, é estável,
> e não exige nenhuma mudança no código do app. A tool `videos:compose` só
> precisa receber o MP4 — a origem pode ser qualquer uma.

### Passo 2 — Criar o projeto

Peça ao Kairós: *"cria um projeto de vídeo chamado kairos-crm"*

A tool `videos:project` cria:

```
KAIROS_VIDEOS/kairos-crm/
  01_PARA_REVISAR   ← o vídeo final vai aqui
  02_APROVADOS      ← depois da sua aprovação
  03_PUBLICADOS
  04_ROTEIROS       ← .md do roteiro + .mp3 da narração
  05_LEGENDAS       ← .ass
  06_ARQUIVADOS
```

### Passo 3 — Gerar o roteiro

Descreva o que aparece na tela:

> *"O Kairós CRM mostra no painel o número de conversas abertas e o tempo médio
> de resposta. Clicando numa conversa, abre o chat com o histórico do cliente."*

A tool `videos:script` devolve:
- roteiro em Markdown (salvo em `04_ROTEIROS`)
- seção `NARRACAO_COMPLETA` (texto puro, pronto pro TTS)
- `needsConfirmation: true` se a descrição foi vaga — nesse caso há marcadores
  `[CONFIRMAR: ...]` no roteiro pedindo sua validação

> ⚠️ **A IA não inventa functionality.** Se ela não souber o que uma tela faz,
> marca `[CONFIRMAR: ...]` em vez de inventar. Sempre leia o roteiro antes de gravar.

### Passo 4 — Narração

**Opção A — sua voz (grátis):**
Grave no Gravador do Windows / OBS / celular e mande o MP3 para a pasta do projeto.

**Opção B — narração por IA (~US$ 0,02-0,05 por vídeo de 30s):**
Peça: *"gera a narração desse roteiro"*. A tool `videos:voice` usa o modelo
`speech-02-hd` (qualidade) ou `speech-02-turbo` (barato).

Para ver as 73 vozes PT-BR: *"lista as vozes em português"*

> **Clonagem da sua voz via IA está bloqueada** no plano MiniMax atual
> (erro 2061). Para ter a sua voz, use a Opção A.

### Passo 5 — Legendas

> *"gera as legendas com o texto do roteiro"*

A tool `videos:subtitles` gera um `.ass` (não `.srt`) em 1080×1920 — o formato
que fica bem em tela vertical, com contorno e sombra.

Também aceita um SRT pronto: `videos:subtitles` com o caminho do `.srt`.

### Passo 6 — Montar

> *"monta o vídeo vertical com a narração e as legendas"*

A tool `videos:compose` faz:
1. redimensiona/corta pra **1080×1920**
2. mixa a narração
3. queima as legendas na imagem
4. queima o CTA (se você pedir: *"com CTA 'Baixe agora'"*)
5. salva em `01_PARA_REVISAR` — **nunca publica sozinho**

Render: ~1,4s com GPU (NVENC) para 6s de vídeo.

---

## 3. Aprovação e publicação

O fluxo para publicação é **manual por design** — nenhuma tool publica em rede social.

```
01_PARA_REVISAR  →  você assiste e aprova  →  videos:export (stage=APPROVED)
                 →  02_APROVADOS  →  você publica  →  move pra 03_PUBLICADOS
```

Para promover um arquivo já aprovado:
`videos:export` com `stage: "PUBLISHED"`.

---

## 4. Configuração do HD externo

**Opção 1 — por variável de ambiente** (mais simples):
```
KAIROS_VIDEOS_ROOT=E:\KAIROS_VIDEOS
```

**Opção 2 — pelo arquivo `videos-config.json`** (na raiz do KAIROS_VIDEOS):
```json
{
  "root": "C:\\Users\\ferna\\Videos\\KAIROS_VIDEOS",
  "externalRoot": "E:\\KAIROS_VIDEOS",
  "preferredVoiceId": "Portuguese_SentimentalLady",
  "scriptModel": "MiniMax-M3"
}
```

**Regra de segurança:** se o HD não estiver montado, o `videos:export`
**não apaga nem move** o arquivo original — ele avisa e devolve o caminho
temporário. Conecte o HD e rode o export de novo.

---

## 5. Referência rápida das tools

| Tool | Parâmetros principais | Quando usar |
|---|---|---|
| `videos:project` | `name`, `root?`, `setAsRoot?` | início de cada vídeo |
| `videos:script` | `description`, `appName?`, `durationSec?` | transformar telas em roteiro |
| `videos:voice` | `mode: list\|generate`, `text?`, `voiceId?`, `model?` | narração |
| `videos:subtitles` | `srt?` ou `cues?`, `width?`, `height?` | legendas |
| `videos:compose` | `input`, `audio?`, `subtitles?`, `cta?`, `useGpu?` | montagem final |
| `videos:export` | `input`, `destination?`, `stage?`, `promote?` | exportar/aprovar |

---

## 6. Problemas conhecidos

| Sintoma | Causa | Solução |
|---|---|---|
| App não abre: `SqliteError: no such column: client_id` | banco local criado antes do multi-tenant; o índice era criado **antes** do `ALTER TABLE` | **Já resolvido** — a ordem agora é tabelas → migrations → índices. Se persistir, o app migra sozinho na próxima abertura |
| Roteiro sai vazio | `maxTokens` cortou o raciocínio do modelo thinking | Já resolvido (3000 tokens). Se persistir, use `MiniMax-M2.7-highspeed` |
| Narração sai com o rascunho do modelo | MiniMax M3 é "thinking model" | Já resolvido — o bloco `<think>` é removido automaticamente |
| ffmpeg: *"Error initializing a simple filtergraph"* | path do `.ass` sem escape no Windows | Já resolvido — a extension escapa o path automaticamente |
| Geração de vídeo/avatar retorna erro 2067 | cota de tokens do plano MiniMax esgotada | Recarregue no painel MiniMax. **A narração e o roteiro continuam funcionando** |
| Clonagem de voz retorna erro 2061 | plano atual não suporta `voice_clone` | Grave sua voz e importe o MP3 (Opção A) |
| Roteiro com `[CONFIRMAR: ...]` | a descrição das telas estava vaga | Descreva melhor a tela e regere |
| CTA não aparece no vídeo | fonte de sistema não encontrada | Verifique `%WINDIR%\Fonts\arialbd.ttf` |

---

## 7. Custos

| Item | Custo por vídeo de 30s |
|---|---|
| Roteiro (LLM MiniMax M3) | ~US$ 0,01 |
| Narração (`speech-02-hd`) | ~US$ 0,05 |
| Narração (`speech-02-turbo`) | ~US$ 0,02 |
| Render (ffmpeg local) | **US$ 0,00** |
| **Total (sem avatar)** | **~US$ 0,06** |

Avatar gerado por IA: +US$ 0,28 a 0,49 por clipe de 6s (≈US$ 2,50 por vídeo
de 30s) — e **depende de cota**, hoje bloqueada.

---

## 8. Instalação em build novo

A extension já está no repositório e registrada. Para um build limpo:

```bash
pnpm install
pnpm --filter @kairos/extension-videos build
pnpm --filter @kairos/agent build
pnpm --filter @kairos/electron typecheck
```

> ⚠️ Se o typecheck do app reclamar de `attachments` não existir no tipo,
> é porque o `dist` do `@kairos/agent` está desatualizado — rode
> `pnpm --filter @kairos/agent build`.

### Empacotamento (instalador .exe)

```bash
pnpm --filter @kairos/core build          # dist do core
pnpm --filter @kairos/extension-videos build
pnpm --filter @kairos/electron build:preload
pnpm --filter @kairos/electron build:renderer
pnpm --filter @kairos/electron build:main
pnpm --filter @kairos/electron vendor      # copia as extensions p/ _vendor
pnpm --filter @kairos/electron deploy --legacy --prod ./_deployed
cd apps/electron && pnpm exec electron-builder --win --project ./_deployed
```

**Armadilhas do empacotamento (todas resolvidas no `apps/electron/package.json`):**

| Erro | Causa | Correção aplicada |
|---|---|---|
| `Cannot compute electron version` | o deploy com `--prod` não traz o pacote `electron` | `electronVersion: "33.4.11"` fixado no build config |
| `ENOENT ... @emnapi\runtime` | `@electron/rebuild` tropeça num junction pnpm pendurado | `npmRebuild: false` — o `better-sqlite3` já é compilado para o ABI do Electron |
| `Cannot find module 'electron-publisher-./build/publish.json'` | o `publish` apontava pra um arquivo inexistente | `publish` com provider `github` (`appfbj-stack/desktop-pi-kairos`) |
| `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY` | o `pnpm deploy` exige pasta de destino vazia | mover a pasta antiga (`_deployed.bak-<data>`) antes do deploy |
| `electron-builder não é reconhecido` | dentro do `_deployed` não há `electron-builder` | rodar de `apps/electron` com `--project ./_deployed` |

> A `extension-videos` só entra no instalador se estiver na lista do
> `apps/electron/build/copy-vendor.mjs` — sem isso ela funciona no dev
> e desaparece no app empacotado.

