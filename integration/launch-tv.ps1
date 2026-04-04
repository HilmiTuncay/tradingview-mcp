# launch-tv.ps1
# TradingView Desktop (MSIX/Microsoft Store) uygulamasini CDP portu acik sekilde baslatir.
# CDP portu: localhost:9222 — TradingView MCP server bu porta baglanir.
#
# Kullanim:
#   .\scripts\launch-tv.ps1
#
# Not: Claude Code yeniden baslatilmadan once bu scripti calistirin.

param(
    [int]$Port = 9222,
    [int]$TimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"

Write-Host "TradingView CDP launcher baslatiliyor..." -ForegroundColor Cyan
Write-Host "Hedef port: $Port" -ForegroundColor Gray

# Mevcut TradingView process varsa kapat
$existingProcs = Get-Process -Name "tradingview" -ErrorAction SilentlyContinue
if ($existingProcs) {
    Write-Host "Mevcut TradingView process kapatiliyor..." -ForegroundColor Yellow
    $existingProcs | Stop-Process -Force
    Start-Sleep -Seconds 2
}

# CDP portu zaten acik mi kontrol et
function Test-CdpPort {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (Test-CdpPort) {
    Write-Host "CDP port $Port zaten aktif. TradingView calisıyor." -ForegroundColor Green
    exit 0
}

# ELECTRON_EXTRA_LAUNCH_ARGS environment variable ile CDP portunu etkinlestir
$env:ELECTRON_EXTRA_LAUNCH_ARGS = "--remote-debugging-port=$Port"
Write-Host "Env: ELECTRON_EXTRA_LAUNCH_ARGS=$env:ELECTRON_EXTRA_LAUNCH_ARGS" -ForegroundColor Gray

# TradingView MSIX uygulamasini shell:AppsFolder ile baslat
Write-Host "TradingView baslatiliyor (MSIX/Store)..." -ForegroundColor Cyan

# MSIX app user model ID'yi bul
$tvAppId = $null
$packages = Get-AppxPackage -Name "*TradingView*" -ErrorAction SilentlyContinue
if ($packages) {
    foreach ($pkg in $packages) {
        $manifest = Join-Path $pkg.InstallLocation "AppxManifest.xml"
        if (Test-Path $manifest) {
            [xml]$xml = Get-Content $manifest
            $app = $xml.Package.Applications.Application | Select-Object -First 1
            if ($app) {
                $tvAppId = "$($pkg.PackageFamilyName)!$($app.Id)"
                Write-Host "Bulunan App ID: $tvAppId" -ForegroundColor Gray
                break
            }
        }
    }
}

if ($tvAppId) {
    # Dogrudan exe ile baslat -- shell:AppsFolder MSIX'e env var geciremiyor
    $pkg = Get-AppxPackage -Name "*TradingView*" | Select-Object -First 1
    $tvExe = Join-Path $pkg.InstallLocation "TradingView.exe"
    if (Test-Path $tvExe) {
        Write-Host "Dogrudan exe ile baslatiliyor: $tvExe" -ForegroundColor Gray
        Start-Process $tvExe -ArgumentList "--remote-debugging-port=$Port"
    } else {
        Write-Host "Exe bulunamadi, shell:AppsFolder fallback..." -ForegroundColor Yellow
        Start-Process "shell:AppsFolder\$tvAppId"
    }
} else {
    Write-Host "MSIX package bulunamadi!" -ForegroundColor Red
    exit 1
}

# CDP port'u poll et (max TimeoutSeconds saniye)
Write-Host "CDP port $Port bekleniyor..." -ForegroundColor Cyan
$elapsed = 0
$interval = 2

while ($elapsed -lt $TimeoutSeconds) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval

    if (Test-CdpPort) {
        Write-Host ""
        Write-Host "Basarili! CDP port $Port aktif. ($elapsed sn)" -ForegroundColor Green
        Write-Host "MCP server baglanabilir: http://localhost:$Port/json/version" -ForegroundColor Green
        exit 0
    }

    Write-Host "  Bekleniyor... ($elapsed/$TimeoutSeconds sn)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "HATA: CDP port $Port $TimeoutSeconds saniye icinde acilmadi." -ForegroundColor Red
Write-Host ""
Write-Host "Cozum onerileri:" -ForegroundColor Yellow
Write-Host "  1. TradingView Desktop'in yuklu oldugunu dogrulayin (Microsoft Store)"
Write-Host "  2. Uygulamayi elle acin, sonra tekrar deneyin"
Write-Host "  3. ELECTRON_EXTRA_LAUNCH_ARGS calismiyor olabilir -- asagidaki yontemi deneyin:"
Write-Host ""
Write-Host "     Manuel baslatma (PowerShell Admin):" -ForegroundColor Cyan
Write-Host '     $env:ELECTRON_EXTRA_LAUNCH_ARGS="--remote-debugging-port=9222"'
Write-Host '     Start-Process "shell:AppsFolder\<AppFamilyName>!App"'
Write-Host ""
exit 1
