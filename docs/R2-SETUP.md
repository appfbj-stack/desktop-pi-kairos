# R2-SETUP — Configuração do Cloudflare R2 (passo a passo do admin)

> **Quem executa:** o administrador (Fernando) com acesso ao painel Cloudflare.
> **Quando:** antes de rodar o primeiro `pnpm release` em produção.
> **Pré-requisito:** conta Cloudflare ativa com domínio `fbautomacao.space` (ou similar) já no Cloudflare.

---

## 1. Criar o bucket

1. Abra https://dash.cloudflare.com → **R2** → **Create bucket**.
2. **Bucket name:** `kairos-downloads` (literal, sem espaços).
3. **Location:** `Europe` ou `North America` (escolha o mais perto dos clientes).
4. Clique em **Create bucket**.

---

## 2. Conectar domínio custom (download.seu-dominio.com.br)

### Opção A — R2 Custom Domain (recomendado, mais simples)
1. No bucket criado → aba **Settings** → **Custom Domains** → **Connect Domain**.
2. Digite: `download.fbautomacao.space` (ou outro subdomínio seu).
3. O Cloudflare vai criar automaticamente o registro CNAME.
4. **Aguarde** a propagação DNS (geralmente 1-5 min).
5. **Anote** a URL pública: `https://download.fbautomacao.space`.

### Opção B — Cloudflare Pages (alternativa)
Veja seção 6 abaixo.

---

## 3. Habilitar acesso público (para download direto)

1. Ainda no bucket → **Settings** → **Public access**.
2. **Enable** "Allow public access" via `r2.dev` (opcional, debug) ou só via custom domain (recomendado).
3. Se o bucket for público, **restrinja** o acesso público só via custom domain, não via `*.r2.dev` (evita custos de banda se usar R2 plano free).

---

## 4. Gerar API Token (com permissões mínimas)

1. No painel R2 → **Manage R2 API Tokens** → **Create API Token**.
2. **Token name:** `kairos-publish-script` (qualquer nome descritivo).
3. **Permissions:** `Object Read & Write` (necessário para o `publish-r2.mjs`).
4. **Bucket scope:** **Specify bucket** → selecione `kairos-downloads`.
5. **TTL:** deixe em branco (sem expiração; pode revogar manualmente depois).
6. Clique em **Create API Token**.
7. **Copie e guarde com segurança** os 3 valores:
   - `Access Key ID` (será `R2_ACCESS_KEY_ID`)
   - `Secret Access Key` (será `R2_SECRET_ACCESS_KEY`)
   - `Account ID` (na página inicial do R2, lado direito, será `CLOUDFLARE_ACCOUNT_ID`)

⚠️ **ATENÇÃO:** o Secret Access Key só aparece UMA VEZ. Se perder, revogue e crie outro.

---

## 5. Configurar as env vars no seu PC

Crie/edite o arquivo `scripts/.env` (NÃO commitar — está no .gitignore):

```bash
# Cloudflare R2 (gerados no passo 4)
CLOUDFLARE_ACCOUNT_ID=seu_account_id_aqui
R2_ACCESS_KEY_ID=sua_access_key_aqui
R2_SECRET_ACCESS_KEY=sua_secret_key_aqui
R2_BUCKET_NAME=kairos-downloads

# URL público custom (passo 2) — DEVE terminar com /releases/latest/
R2_PUBLIC_BASE_URL=https://download.fbautomacao.space
```

Para carregar temporariamente no PowerShell:
```powershell
$env:CLOUDFLARE_ACCOUNT_ID = "..."
$env:R2_ACCESS_KEY_ID = "..."
$env:R2_SECRET_ACCESS_KEY = "..."
$env:R2_BUCKET_NAME = "kairos-downloads"
$env:R2_PUBLIC_BASE_URL = "https://download.fbautomacao.space"
```

Ou persistente no Windows (Configurações → Sistema → Variáveis de Ambiente do Usuário):
```
CLOUDFLARE_ACCOUNT_ID = ...
R2_ACCESS_KEY_ID = ...
R2_SECRET_ACCESS_KEY = ...
R2_BUCKET_NAME = kairos-downloads
R2_PUBLIC_BASE_URL = https://download.fbautomacao.space
```

---

## 6. (Opcional) Hospedar a página de download no Cloudflare Pages

A página `web/download/index.html` é estática (HTML+CSS puro, sem build). Pode ser hospedada **separadamente** do R2:

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Direct Upload**.
2. **Project name:** `kairos-download` (ou similar).
3. Faça upload da pasta `web/download/` (NÃO precisa de build command).
4. Depois do upload, vá em **Custom domains** → **Set up a custom domain**.
5. Digite `download.fbautomacao.space`.
6. O Cloudflare configura o CNAME automaticamente.

> **OU** sirva a página direto do R2 (mais simples):
> 1. Crie outro bucket `kairos-download-site`.
> 2. Upload do `web/download/` no R2.
> 3. Conecte o mesmo custom domain.
> - Prós: tudo em R2, menos peças móveis.
> - Contras: precisa configurar o bucket como "Public".

**Recomendação:** use Cloudflare Pages (mais rápido, grátis, HTTPS global).

---

## 7. Validar a configuração

Após preencher as env vars:

```bash
cd C:\Users\ferna\.minimax-agent\projects\kairos-pi
node scripts/release.mjs --skip-build --dry-run
```

Deve mostrar:
```
Versao: 0.5.0
Sincronizando publish config...
[OK] Publish config → R2 (generic): https://download.fbautomacao.space/releases/latest/
```

Se mostrar erro de credenciais, revise o passo 4.

---

## 8. Primeiro upload de teste

```bash
# 1) Instalar AWS SDK (se ainda não instalou)
pnpm install

# 2) Rodar o upload com a versão atual (0.5.0)
node scripts/publish-r2.mjs --file apps/electron/release/Kairos.Desktop.Alves-Setup-0.5.0.exe --version 0.5.0
```

Deve mostrar:
```
📦 Kairos.Desktop.Alves-Setup-0.5.0.exe (239.01 MB)
   SHA-256: ec0d590b9f8b7852a280fe4fb41e7c08ee6e66398be2f69764541f54480dc8d4
☁️  Uploading releases/v0.5.0/Kairos.Desktop.Alves-Setup-0.5.0.exe ...
☁️  Uploading releases/v0.5.0/Kairos.Desktop.Alves-Setup-0.5.0.exe.blockmap ...
🔍 Validando download público...
☁️  Atualizando releases/latest/latest.yml ...
☁️  Atualizando releases/manifest.json ...
✅ Upload completo!
   Instalador: https://download.fbautomacao.space/releases/v0.5.0/Kairos.Desktop.Alves-Setup-0.5.0.exe
   Latest:     https://download.fbautomacao.space/releases/latest/latest.yml
   Manifest:   https://download.fbautomacao.space/releases/manifest.json
```

Verifique no browser:
- `https://download.fbautomacao.space/releases/v0.5.0/Kairos.Desktop.Alves-Setup-0.5.0.exe` → deve baixar o .exe
- `https://download.fbautomacao.space/releases/latest/latest.yml` → deve mostrar XML/YAML com a versão
- `https://download.fbautomacao.space/releases/manifest.json` → deve mostrar JSON com histórico

---

## 9. Atualizar a página de download

Edite `web/download/index.html` substituindo os placeholders:

| Placeholder            | Valor                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `{{DOWNLOAD_URL}}`     | `https://download.fbautomacao.space/releases/v0.5.0/Kairos.Desktop.Alves-Setup-0.5.0.exe` |
| `{{VERSION}}`          | `0.5.0`                                                    |
| `{{FILE_SIZE}}`        | `239.01 MB`                                                |
| `{{PUBLISHED_AT}}`     | data do upload                                             |
| `{{SHA256}}`           | `ec0d590b9f8b7852a280fe4fb41e7c08ee6e66398be2f69764541f54480dc8d4` |
| `{{OFFICIAL_DOMAIN}}`  | `download.fbautomacao.space`                               |
| `{{SUPPORT_WHATSAPP}}` | `https://wa.me/5515999999999`                              |
| `{{SUPPORT_EMAIL}}`    | `suporte@fbautomacao.space`                                |

Faça commit + push, e o Cloudflare Pages re-deploya automaticamente.

---

## 10. Pendência importante: assinatura digital

A v1 do instalador **NÃO é assinada digitalmente**. Windows SmartScreen vai mostrar warning "App não reconhecido" no primeiro launch:
- Usuário clica em **Mais informações** → **Executar mesmo assim**.
- A instrução está na página de download (etapa 9).

**Assinatura EV code signing (recomendado para produção):**
- Compre certificado EV (ex: Sectigo, DigiCert) — ~$200-400/ano.
- Configure o `electron-builder` com `win.certificateFile` + `CSC_KEY_PASSWORD` env var.
- Reinstale o `electron-builder` com `pnpm rebuild` ou hook no `package:win`.

Fora do escopo desta v1. Documentar quando aplicável.

---

## 11. Checklist de segurança

- ✅ Token R2 com permissão **só de leitura+escrita** no bucket `kairos-downloads` (escopo restrito).
- ✅ `scripts/.env` está no `.gitignore` — NUNCA commitar.
- ✅ `apps/electron/build/publish.json` aponta pro `https://` (não `http://`).
- ✅ Domínio custom do R2 tem HTTPS automático (Cloudflare).
- ✅ `Cache-Control: public, max-age=31536000, immutable` no instalador.
- ✅ `Cache-Control: no-cache` no `latest.yml` (atualização é imediata).
- ❌ Nenhuma credencial do R2 no instalador ou no repo.
- ❌ Nenhum dado de cliente (DB, licenças, senhas) no R2 — isso fica na VPS.
