# RELEASE-PROCEDURE — Como publicar uma nova versão do Pi Agente Kairós

> Procedimento padrão para o administrador (Fernando) sempre que quiser publicar uma nova versão.

---

## Pré-requisitos

- `scripts/.env` configurado com credenciais R2 válidas (veja `docs/R2-SETUP.md`).
- Ambiente local com Node 20+, pnpm 10+.
- Working tree limpo (sem mudanças não-commitadas).

---

## Passo 1: Bump de versão

Edite `apps/electron/package.json` e atualize o campo `version`:

```json
"version": "0.6.0"
```

Siga [Semantic Versioning](https://semver.org/):
- `MAJOR.MINOR.PATCH` (ex: `1.0.0`)
- **Patch** (1.0.x): bugfixes.
- **Minor** (1.x.0): features novas (compatíveis).
- **Major** (x.0.0): mudanças breaking (raro — Pastor é conservador).

---

## Passo 2: Dry-run (validar tudo sem publicar)

```bash
cd C:\Users\ferna\.minimax-agent\projects\kairos-pi
pnpm release --dry-run
```

Deve mostrar:
- ✅ Versão lida do package.json
- ✅ `publish.json` gerado apontando pro R2
- ✅ Env vars do R2 presentes
- ✅ Instalador encontrado
- ✅ SHA-256 calculado
- ✅ Mensagem "DRY-RUN: tudo OK"

Se houver erro, **NÃO** prossiga. Corrija antes.

---

## Passo 3: Release real

```bash
pnpm release
```

O script faz:
1. Sincroniza `apps/electron/build/publish.json` (R2 ou GitHub)
2. Roda `pnpm package:win` (build completo: icons, vendor, build, deploy, electron-builder)
3. Calcula SHA-256 do instalador gerado
4. Salva `*.sha256` ao lado do .exe (auditoria)
5. Chama `publish-r2.mjs` que faz upload multipart pro R2
6. Valida fazendo download parcial
7. Atualiza `releases/manifest.json` (histórico versionado)
8. Aponta `releases/latest/latest.yml` pra versão atual

Duração estimada: **5-10 minutos** (build + upload de 250MB).

---

## Passo 4: Validar no browser

Abra as URLs (substitua `0.6.0` pela versão):

- `https://download.fbautomacao.space/releases/v0.6.0/Kairos.Desktop.Alves-Setup-0.6.0.exe` → deve baixar (250MB)
- `https://download.fbautomacao.space/releases/v0.6.0/latest.yml` → deve mostrar YAML com a versão
- `https://download.fbautomacao.space/releases/latest/latest.yml` → deve mostrar a versão **atual** (latest)
- `https://download.fbautomacao.space/releases/manifest.json` → deve listar a nova versão

Compare o SHA-256 retornado com o `.sha256` salvo no `apps/electron/release/`.

---

## Passo 5: Atualizar a página de download

Edite `web/download/index.html` substituindo os placeholders (veja `web/download/README.md`):

```html
<a id="download-btn" href="https://download.fbautomacao.space/releases/v0.6.0/Kairos.Desktop.Alves-Setup-0.6.0.exe">
```

```html
<dd id="meta-version">0.6.0</dd>
<dd id="meta-size">240.5 MB</dd>
<dd id="meta-date">2026-10-15</dd>
<dd id="meta-sha">abc123...</dd>
```

Faça commit + push no `desktop-pi-kairos`. Se estiver usando Cloudflare Pages, o deploy é automático.

---

## Passo 6: Tag git (opcional, pra histórico)

```bash
git tag v0.6.0
git push origin v0.6.0
```

A tag é apenas para **marco histórico no GitHub** — o R2 não usa tag (ele usa o version do package.json + latest.yml).

---

## Passo 7: Testar auto-update num cliente existente

1. Tenha uma versão **anterior** instalada (ex: v0.5.0).
2. Abra o app.
3. Aguarde 5 segundos (checagem automática) ou clique no ícone de update.
4. Deve aparecer banner "Nova versão 0.6.0 disponível".
5. Clique em **Baixar** → após download, clique em **Reiniciar e instalar**.
6. App reinicia e roda v0.6.0.

Se o update **não** aparecer:
- Abra DevTools (Ctrl+Shift+I) → Console.
- Procure erros do `autoUpdater` (geralmente 404 no latest.yml → DNS ou R2 offline).
- Verifique se `R2_PUBLIC_BASE_URL/releases/latest/latest.yml` é acessível.

---

## Troubleshooting

### "CLOUDFLARE_ACCOUNT_ID não definido"
- Verifique se `scripts/.env` existe e tem a env var.
- Se não existir, copie de `scripts/.env.example` e preencha.

### "Cannot find module '@aws-sdk/client-s3'"
```bash
pnpm install
```

### "EPROTO SSL alert 40"
- Account ID inválido ou token expirado.
- Regere o token R2 (passo 4 de R2-SETUP.md).

### "InvalidSignature" ou "403 Forbidden"
- Secret Access Key errado.
- Token tem permissão só de leitura (precisa de read+write).

### Auto-update não dispara
- Veja `apps/electron/build/publish.json` — aponta pro R2?
- Abra DevTools → Network → veja se a request pro `latest.yml` retorna 200.
- Versão no `latest.yml` é maior que a versão instalada?

### Build falha com "stale symlink"
- Rode `node -e "require('fs').unlinkSync('node_modules/.pnpm/node_modules/@kairos/extension-memory')"` antes de `pnpm install`.

---

## Procedimento de rollback

Se a v0.6.0 tiver bug crítico e precisar voltar pra v0.5.0:

1. **No R2:** delete `releases/v0.6.0/` e re-aponte `releases/latest/latest.yml` pro conteúdo de `v0.5.0`.
2. **No app:** force a próxima checagem (restart) — `electron-updater` vê v0.5.0 e não oferece update.
3. **Versões anteriores permanecem** em `releases/v0.5.0/`, podem ser re-apontadas.

A app antiga continua funcionando (validada pela VPS via `central-kairos`).
