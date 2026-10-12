# ARCHITECTURE — Pi Agente Kairós (separação de responsabilidades)

Documento de referência rápida pra qualquer dev/admin que mexer no projeto.

---

## Visão geral

```
┌──────────────────────────────────────────────────────────────────┐
│                       USUÁRIO FINAL (Windows)                    │
│                                                                  │
│   1. Abre https://download.fbautomacao.space/                    │
│   2. Baixa o .exe                                               │
│   3. Instala + abre                                              │
│   4. App checa licença via API                                   │
│   5. App checa update via electron-updater                       │
└─────────────────┬────────────────────────────┬─────────────────┘
                  │ HTTPS                      │ HTTPS
                  ▼                            ▼
        ┌──────────────────────┐   ┌──────────────────────────┐
        │  Cloudflare Pages    │   │   Cloudflare R2          │
        │  (web/download/*)    │   │   kairos-downloads       │
        │  Página estática     │   │   ├── releases/v0.5.0/   │
        │  HTML + CSS          │   │   ├── releases/latest/   │
        └──────────────────────┘   │   └── releases/manifest  │
                  ▲                 └──────────┬───────────────┘
                  │                            │ CNAME
                  │ HTTPS                      ▼
                  │                  ┌──────────────────────────┐
                  │                  │  DNS (Cloudflare)        │
                  │                  │  download.fbautomacao    │
                  │                  │  .space → bucket R2      │
                  │                  └──────────────────────────┘
                  │
        ┌─────────┴──────────┐  HTTPS  ┌─────────────────────────────┐
        │  GitHub (código)  │ ◄────── │  VPS Dokploy                │
        │  desktop-pi-      │         │  187.77.229.227             │
        │  kairos.git       │         │  ├── central-kairos (API)   │
        └──────────────────┘         │  │   ├── /api/auth/*         │
                                     │  │   ├── /api/installations │
                                     │  │   ├── /api/public/*      │
                                     │  │   └── DB PostgreSQL      │
                                     │  ├── kairos-igreja (app)   │
                                     │  ├── kairos-crm (app)      │
                                     │  └── ... outros apps       │
                                     └─────────────────────────────┘
```

---

## Camadas

| Camada              | Onde fica                              | Responsabilidade                                  | O que NÃO faz                       |
| ------------------- | -------------------------------------- | ------------------------------------------------- | ----------------------------------- |
| **App Electron**    | PC do cliente (instalado)              | Chat com IA, tools, license check, auto-update   | Servir atualizações, validar licenças |
| **central-kairos** | VPS Dokploy (`central.fbautomacao.space`) | API REST + DB: clientes, licenças, usage, auth    | Hospedar instaladores               |
| **R2**              | Cloudflare R2 (`kairos-downloads`)     | Armazenar .exe + latest.yml + manifest público   | Autenticar usuários, validar licenças |
| **GitHub Pages**    | Cloudflare Pages (custom domain)       | Página de download HTML+CSS                       | Servir instaladores                 |
| **DNS**             | Cloudflare                             | `download.fbautomacao.space` → R2                | Qualquer lógica de aplicação         |
| **GitHub repo**     | github.com/appfbj-stack                | Código-fonte + release notes                      | Hospedar binários (vai pro R2)       |

---

## Fluxo: baixar e instalar (primeira vez)

```
1. Usuário acessa https://download.fbautomacao.space/
   ↓
2. Página estática (Cloudflare Pages) mostra botão "BAIXAR"
   ↓
3. Click no botão → HTTPS GET https://download.fbautomacao.space/releases/v0.5.0/Kairos.Desktop.Alves-Setup-0.5.0.exe
   ↓
4. R2 serve o .exe (com Cache-Control: immutable, 1 ano)
   ↓
5. Usuário executa .exe → instalador NSIS roda → app instalado em %LOCALAPPDATA%
   ↓
6. App abre, IPC handler `app:installation:info` retorna UUID do cliente
   ↓
7. App chama `app:license:status` → IPC handler no main → license-client.ts
   ↓
8. license-client.ts → POST https://central.fbautomacao.space/api/public/installation/:id/check-usage
   ↓
9. central-kairos consulta DB PostgreSQL, valida licença, retorna { allowed: true, plan: "PRO", ... }
   ↓
10. App mostra "Ativado" pro usuário
```

---

## Fluxo: auto-update (versões seguintes)

```
1. App já instalado (v0.4.0), aberto pelo usuário
   ↓
2. Após 5s, initAutoUpdater() chama autoUpdater.checkForUpdates()
   ↓
3. electron-updater faz HTTPS GET https://download.fbautomacao.space/releases/latest/latest.yml
   ↓
4. R2 serve o latest.yml (com Cache-Control: no-cache)
   ↓
5. electron-updater compara versão (0.4.0 vs 0.5.0)
   ↓
6. Se houver versão maior → emite "update:available" pro renderer
   ↓
7. App mostra banner "Nova versão disponível"
   ↓
8. Usuário clica em "Baixar" → autoUpdater.downloadUpdate()
   ↓
9. Download do .exe do R2 pro diretório temp
   ↓
10. Usuário clica em "Reiniciar e instalar" → autoUpdater.quitAndInstall()
    ↓
11. App fecha, instalador roda, app reabre já em v0.5.0
```

**Importante:** o download do update NÃO valida licença (qualquer um baixa). Mas ao abrir, o app consulta a central-kairos. Se a licença do cliente estiver vencida/bloqueada, o app entra em modo limitado.

---

## Segurança: separação de segredos

| Onde fica o quê                           | Quem tem acesso                            |
| ----------------------------------------- | ------------------------------------------ |
| **R2 Access Key + Secret**                | Só o admin (env vars no PC dele, não no repo) |
| **DB Postgres (clientes, licenças)**       | Só o servidor VPS (network interna)         |
| **JWT secret (admin login)**               | Só o servidor VPS                          |
| **Pastor's MiniMax key (LLM bundled)**     | Dentro do app.asar (em texto plano)         |
| **User's OpenAI/Anthropic key (BYOK)**     | Criptografado em `userData` (Electron safeStorage com DPAPI) |

**Princípio:** credenciais R2 NUNCA vão pro instalador, frontend, ou repo público. Só existem no PC do admin que publica.

---

## Custos estimados (mensal)

| Item                        | Custo          |
| --------------------------- | -------------- |
| Cloudflare R2 (10GB + 1M req) | **$0.15** (free tier 10GB incluso) |
| Cloudflare Pages             | **$0** (free tier)            |
| DNS Cloudflare               | **$0**                         |
| VPS Dokploy                  | Já existe (custo fixo do Pastor) |
| **Total**                    | **~$0.15/mês**                 |

Comparado com GitHub Releases (grátis), o custo é quase zero, mas ganha-se:
- Domínio custom (identidade visual)
- HTTPS direto sem redirect
- Sem "Source code (zip)" anexado automaticamente
- Controle de quem baixa (futuro: signed URLs, expiração)
- CDN global (download mais rápido)

---

## Arquivos do projeto (referência)

```
desktop-pi-kairos/                    ← repositório de código (GitHub)
├── apps/electron/                    ← shell Electron (Kairós Desktop)
│   ├── src/main/
│   │   ├── updater.ts                ← electron-updater (init, events, IPC)
│   │   ├── license-client.ts         ← consulta VPS sobre licença
│   │   └── ipc.ts                    ← handlers IPC (chat, providers, etc)
│   ├── src/preload/index.mts         ← expõe window.kairos (contextBridge)
│   ├── src/renderer/                 ← React UI
│   ├── build/                        ← build configs (electron-builder, icons)
│   └── package.json                  ← build.publish aponta pra build/publish.json
├── packages/                         ← workspaces (@kairos/agent, @kairos/extensions/*)
├── scripts/                          ← PUBLICAÇÃO (nunca vai pro instalador)
│   ├── publish-r2.mjs                ← upload multipart + manifest + latest.yml
│   ├── release.mjs                   ← orquestrador (build + publish + audit)
│   └── sync-publish-config.mjs       ← gera build/publish.json do env
├── web/download/                     ← página de download (HTML+CSS estático)
├── docs/                             ← documentação do admin
│   ├── ARCHITECTURE.md               ← este arquivo
│   ├── R2-SETUP.md                   ← setup do Cloudflare R2
│   └── RELEASE-PROCEDURE.md           ← como publicar nova versão
└── package.json                      ← pnpm workspace root
```

**Onde NUNCA mexer pra deploy:**
- `central-kairos/` (repo separado, deployado via Dokploy)
- Qualquer coisa em `apps/electron/src/` que afete a lógica de licença (o release pra R2 é só infra de distribuição, não mexe em auth).

---

## Pendências

- [ ] **Assinatura digital EV** (Windows SmartScreen warning)
- [x] **Auto-update CI** (GitHub Actions workflow em `.github/workflows/release.yml`)
- [ ] **Métricas** (PostHog/Plausible na página de download)
- [ ] **Multi-plataforma** (macOS e Linux, hoje só Windows)
- [ ] **Cache de download por região** (R2 já replica globalmente; verificar com testes)

## Documentação adicional

- [docs/R2-SETUP.md](R2-SETUP.md) — configurar Cloudflare R2 (bucket, token, DNS)
- [docs/RELEASE-PROCEDURE.md](RELEASE-PROCEDURE.md) — publicar nova versão (manual)
- [docs/GHA-SETUP.md](GHA-SETUP.md) — configurar GitHub Actions (auto-publish)
