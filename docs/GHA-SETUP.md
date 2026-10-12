# GHA-SETUP — Configurar GitHub Actions pra release automático

> **O que faz:** quando você cria uma tag `v0.6.0` no GitHub, o workflow automaticamente:
> 1. Faz build do instalador Windows
> 2. Faz upload pro Cloudflare R2
> 3. Gera o `manifest.json` + `latest.yml`
> 4. Faz backup do instalador no próprio GitHub (artifact, 30 dias)
>
> **Quando:** quando você quiser automatizar (opcional). Pode continuar usando `pnpm release` manual.

---

## 1. Criar os secrets no GitHub

1. Abra https://github.com/appfbj-stack/desktop-pi-kairos/settings/secrets/actions
2. Clique em **New repository secret** pra cada um:

| Nome                       | Valor                                                       | Onde conseguir |
| -------------------------- | ----------------------------------------------------------- | -------------- |
| `CLOUDFLARE_ACCOUNT_ID`    | `seu_account_id_aqui`                                       | R2 → Account ID (passo 4 do R2-SETUP.md) |
| `R2_ACCESS_KEY_ID`         | `sua_access_key_aqui`                                        | Token R2 → Access Key ID |
| `R2_SECRET_ACCESS_KEY`     | `sua_secret_key_aqui`                                        | Token R2 → Secret Access Key |
| `R2_BUCKET_NAME`           | `kairos-downloads`                                           | Nome do bucket |
| `R2_PUBLIC_BASE_URL`       | `https://download.fbautomacao.space`                         | URL do custom domain (com `https://`, SEM `/` no final) |

⚠️ **NUNCA** commite esses valores. Eles ficam cifrados em GitHub Secrets.

---

## 2. Testar manualmente (sem tag)

1. Vá em https://github.com/appfbj-stack/desktop-pi-kairos/actions
2. Clique em **release-r2** (workflow)
3. **Run workflow** → branch: `main` → **Run workflow**
4. Acompanhe os logs (deve demorar ~5-10min pelo build + upload).
5. Quando terminar, valide:
   - `https://download.fbautomacao.space/releases/latest/latest.yml` → deve mostrar a versão atual
   - `https://download.fbautomacao.space/releases/manifest.json` → deve listar a versão

---

## 3. Disparar release com tag (forma normal)

```bash
# 1) Bump version
# Editar apps/electron/package.json → "version": "0.6.0"

# 2) Commit
git add apps/electron/package.json
git commit -m "release: v0.6.0"

# 3) Tag e push
git tag v0.6.0
git push origin main --tags
```

GitHub Actions vai:
1. Detectar a tag
2. Rodar o build
3. Uploadar pro R2
4. Você recebe e-mail com o resultado (sucesso ou falha)

---

## 4. Troubleshooting

### "Process completed with exit code 1"
- Abra a aba **Actions** → clique no run que falhou → veja o log do step que falhou.
- Geralmente é R2 keys erradas → revise os 5 secrets em Settings.

### "Installer not found" no step "Validate installer"
- Build do electron-builder falhou silenciosamente.
- Veja o log do step "Build Windows installer" — geralmente erro de native module (better-sqlite3) ou path muito longo no Windows.

### Workflow roda mas upload pro R2 falha
- Verifique `R2_BUCKET_NAME` (literalmente `kairos-downloads`).
- Verifique que o token R2 tem permissão **Object Read & Write** no bucket.
- Teste manualmente com `pnpm release --skip-build` local.

### "latest.yml não contém versão X" (step de validação)
- Pode ser cache do Cloudflare R2 (TTL 1 ano com `immutable`).
- O `latest.yml` tem `Cache-Control: no-cache` (deveria atualizar instantaneamente).
- Espere 1-2 min e tente de novo.

---

## 5. Limites do plano free do GitHub

- **2.000 min/mês** de runners Windows — sobra MUITO (build leva ~5-8 min).
- **500 MB** de artifact por upload — instalador tem 250 MB, OK.
- **2 GB** de storage de artifacts — sobra bastante.

Se chegar no limite, ele te avisa por e-mail. Pra free, deve aguentar ~30 releases/mês.

---

## 6. Segurança

- ✅ Secrets cifradas em GitHub Secrets (AES-256).
- ✅ NUNCA exibidas nos logs do workflow (GitHub filtra automaticamente).
- ✅ Workflow NÃO tem permissão de `write` no repositório (só `contents: read`) — não pode modificar código.
- ✅ Se alguém fork o repo, as secrets NÃO são compartilhadas.
- ❌ NUNCA adicione `secrets.PUBLISH_TOKEN` no log (cria variável derivada).

---

## 7. Cancelar o workflow

Se você rodou errado ou quer parar:
1. Aba Actions → run ativo → **Cancel workflow**.
2. Releases parciais no R2 ficam lá — cleanup manual se necessário (`node scripts/manage-r2.mjs delete v0.6.0`) — *implementar se precisar*.
