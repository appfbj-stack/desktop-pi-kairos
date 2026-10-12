# Página de Download — Pi Agente Kairós

Página estática (HTML + CSS puro) distribuída no domínio público `download.<seu-dominio>`.

## Como publicar uma nova versão

1. Rode `pnpm release` (vai gerar `.exe` + fazer upload no R2 + salvar SHA-256).
2. Abra `index.html` e substitua os placeholders:

| Placeholder            | Onde buscar                                                    | Exemplo                          |
| ---------------------- | -------------------------------------------------------------- | -------------------------------- |
| `{{DOWNLOAD_URL}}`     | saída do `release.mjs` (`URL pública: ...`)                    | `https://download.kairos.com.br/releases/v0.6.0/Kairos.Desktop.Alves-Setup-0.6.0.exe` |
| `{{VERSION}}`          | `apps/electron/package.json` → `version`                       | `0.6.0`                          |
| `{{FILE_SIZE}}`        | saída do `release.mjs` (`239.01 MB`)                           | `239.01 MB`                      |
| `{{PUBLISHED_AT}}`     | data do upload (ISO 8601)                                      | `2026-10-12`                     |
| `{{SHA256}}`           | conteúdo de `apps/electron/release/*.exe.sha256`               | `ec0d590b...`                    |
| `{{OFFICIAL_DOMAIN}}`  | domínio público final                                          | `download.kairos.com.br`         |
| `{{SUPPORT_WHATSAPP}}` | link do WhatsApp                                                | `https://wa.me/5515999999999`    |
| `{{SUPPORT_EMAIL}}`    | e-mail de suporte                                               | `suporte@kairos.com.br`          |

3. Faça deploy da pasta `web/download/` no Cloudflare Pages (recomendado) ou R2 hosting.

## Hospedagem recomendada

### Opção A — Cloudflare Pages (grátis, HTTPS, CDN global)
1. Conecte este repo `desktop-pi-kairos` no painel do Cloudflare Pages.
2. Build command: *(vazio)*
3. Build output: `web/download`
4. Variável de ambiente: nenhuma necessária
5. Custom domain: `download.kairos.com.br` (CNAME no DNS)

### Opção B — mesmo R2 (bucket separado)
1. Crie bucket `kairos-download-site` no R2.
2. Ative "Public bucket" ou use Custom domain.
3. Sincronize a pasta `web/download/` após cada release.

## Checklist de segurança

- ✅ Nenhum JavaScript dinâmico na página (apenas HTML+CSS).
- ✅ Nenhuma credencial / chave de API.
- ✅ Domínio `{{OFFICIAL_DOMAIN}}` deve ser HTTPS (Cloudflare Pages/R2 já forçam).
- ✅ Link do R2 usa HTTPS com `Cache-Control: public, max-age=31536000, immutable`.
- ✅ SHA-256 fica visível pro cliente comparar com o instalador baixado (auditoria).
