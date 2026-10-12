# Kairós Desktop Alves

> **Você pede. O Kairós faz.**

Agente de IA desktop para Windows, controlado por linguagem natural. Usuário leigo fala, o agente usa o computador por ele (arquivos, planilhas, PDFs, Word, imagens, vídeo, web).

## Estado atual

**v0.5.0** — app funcional com 13 extensions, loop LLM (OpenAI/Anthropic/OpenRouter/Ollama/Google/MiniMax bundled), 14 tools nativas (`kairos-web-tools` v0.1.0 com web_scrape/extract/search/crawl/youtube), auto-update via electron-updater, licenciamento server-side via `central-kairos` (VPS). Página de download profissional + distribuição via Cloudflare R2.

## Documentação

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — separação VPS / R2 / GitHub / app
- [docs/R2-SETUP.md](docs/R2-SETUP.md) — passo a passo do admin pra configurar Cloudflare R2
- [docs/RELEASE-PROCEDURE.md](docs/RELEASE-PROCEDURE.md) — como publicar nova versão
- [web/download/README.md](web/download/README.md) — como atualizar a página de download

## Stack

- **Shell:** Electron 33 + React 18 + Vite 5 + Tailwind 3
- **Agente:** TypeScript / Node, modelado no [Pi Agent](https://github.com/earendil-works/pi) (sem fork)
- **Workspace:** pnpm 10 + Node 24
- **Banco:** better-sqlite3 (SQLite local)
- **i18n:** i18next com PT-BR como default
- **Logger:** pino

## Estrutura

```
kairos-pi/
├── apps/electron/         # Shell desktop (Electron + React)
├── packages/agent/        # Núcleo (modelado no Pi Agent)
├── packages/core/         # DB, i18n, logger
├── docs/                  # PRD, briefing, ADRs
├── extensions/            # REFERÊNCIA — pi-git-commands original (não roda)
├── package.json           # workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Setup local

```bash
# Requer Node 24+ e pnpm 10+
nvm use 24            # ou nvm-windows
corepack enable       # se pnpm não estiver instalado
pnpm install
pnpm dev              # abre o Electron + Vite
```

## Documentos de produto

- [PRD-v1.0.md](docs/PRD-v1.0.md) — visão, requisitos, MVP
- [BRIEFING-PARA-MINIMAX.md](docs/BRIEFING-PARA-MINIMAX.md) — briefing técnico pro time
- [ADR/0001-modelado-no-pi-nao-forkado.md](docs/ADR/0001-modelado-no-pi-nao-forkado.md) — decisão arquitetural

## Princípios

1. Preservar a estrutura conceitual do Pi Agent.
2. Não criar dashboards complexos — a interface é o chat.
3. Tudo local (arquivos, banco). Nuvem só quando o usuário pedir.
4. Confirmação para ações destrutivas.
5. i18n PT-BR desde o dia 1.
