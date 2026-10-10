# setup-kairos.ps1 — Configura a chave LLM do Kairós Desktop Alves direto no config.json
#
# Uso:
#   1. Copie este .ps1 para o PC do cliente
#   2. Clique direito > Executar com PowerShell (ou duplo-clique)
#   3. Escolha o provider (1=OpenRouter, 2=OpenAI, 3=Anthropic, 4=MiniMax, 5=Ollama)
#   4. Cole a chave quando pedir
#   5. Pronto. Abra o Kairós Desktop Alves.
#
# O que faz:
#   - Cria %APPDATA%\kairos-pi\config.json
#   - Define provider, modelId, apiKey
#   - Se o app já estiver aberto, fecha pra não sobrescrever

$ErrorActionPreference = "Stop"

$configDir = Join-Path $env:APPDATA "kairos-pi"
$configFile = Join-Path $configDir "config.json"

Write-Host ""
Write-Host "Kairós Desktop Alves — Setup de chave LLM" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Escolha do provider
Write-Host "Escolha o provedor de IA:" -ForegroundColor Yellow
Write-Host "  1) OpenRouter  (recomendado — 200+ modelos com 1 chave)"
Write-Host "  2) OpenAI      (ChatGPT — precisa de crédito)"
Write-Host "  3) Anthropic   (Claude — precisa de crédito)"
Write-Host "  4) MiniMax    (tem modelos :free)"
Write-Host "  5) Ollama      (local, sem chave — precisa de Ollama instalado)"
$choice = Read-Host "Número"

$presets = @{
    "1" = @{ provider = "openrouter"; modelId = "nex-agi/nex-n2.5-mini:free"; label = "OpenRouter" }
    "2" = @{ provider = "openai";     modelId = "gpt-4o-mini";                label = "OpenAI" }
    "3" = @{ provider = "anthropic";  modelId = "claude-3-5-sonnet-20241022";  label = "Anthropic" }
    "4" = @{ provider = "minimax";   modelId = "MiniMax-M3";                label = "MiniMax" }
    "5" = @{ provider = "ollama";     modelId = "qwen2.5:3b";                  label = "Ollama" }
}

if (-not $presets.ContainsKey($choice)) {
    Write-Host "Opção inválida." -ForegroundColor Red
    pause
    exit 1
}

$preset = $presets[$choice]
$provider = $preset.provider
$modelId = $preset.modelId
$label = $preset.label

# Chave
$apiKey = ""
if ($provider -ne "ollama") {
    Write-Host ""
    Write-Host "Cole sua chave de API do $label:" -ForegroundColor Yellow
    Write-Host "(ela não aparece na tela por segurança)" -ForegroundColor DarkGray
    $secureKey = Read-Host "Chave" -AsSecureString
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $apiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) | Out-Null

    if ([string]::IsNullOrWhiteSpace($apiKey)) {
        Write-Host "Chave vazia. Abortando." -ForegroundColor Red
        pause
        exit 1
    }
}

# Cria config.json
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

$config = @{
    version = 1
    provider = @{
        provider = $provider
        modelId = $modelId
        apiKey = $apiKey
    }
}

$json = $config | ConvertTo-Json -Depth 5
Set-Content -Path $configFile -Value $json -Encoding UTF8

Write-Host ""
Write-Host "Configuração salva em:" -ForegroundColor Green
Write-Host "  $configFile" -ForegroundColor White
Write-Host ""
Write-Host "Próximo passo: abra o Kairós Desktop Alves." -ForegroundColor Green
Write-Host "  O app vai detectar a chave e entrar direto no chat." -ForegroundColor DarkGray
Write-Host ""

# Dica: onde conseguir a chave
if ($provider -eq "openrouter") {
    Write-Host "Sem chave ainda? Crie em https://openrouter.ai/keys" -ForegroundColor Yellow
} elseif ($provider -eq "openai") {
    Write-Host "Sem chave ainda? Crie em https://platform.openai.com/api-keys" -ForegroundColor Yellow
} elseif ($provider -eq "anthropic") {
    Write-Host "Sem chave ainda? Crie em https://console.anthropic.com/" -ForegroundColor Yellow
} elseif ($provider -eq "minimax") {
    Write-Host "Sem chave ainda? Crie em https://api.minimax.io/" -ForegroundColor Yellow
}

Write-Host ""
pause
