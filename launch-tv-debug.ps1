# TradingView Desktop (Microsoft Store) launcher with CDP debug port 9222
# WORKING METHOD: Invoke-CommandInDesktopPackage + powershell inside package context
# Requires: Developer Mode enabled (Tools.DeveloperMode.Core Windows capability installed)
# Usage: powershell -ExecutionPolicy Bypass -File launch-tv-debug.ps1

param([int]$Port = 9222)

$pkg = Get-AppxPackage -Name "TradingView.Desktop" | Select-Object -First 1
if (-not $pkg) {
    Write-Host "ERROR: TradingView Desktop not found via Get-AppxPackage."
    exit 1
}

$tvExe = Join-Path $pkg.InstallLocation "TradingView.exe"
Write-Host "Found: $($pkg.PackageFullName)"
Write-Host "Exe:   $tvExe"

Write-Host "Killing existing TradingView instances..."
Stop-Process -Name "TradingView" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Launching TradingView with --remote-debugging-port=$Port ..."
# Key: run powershell.exe INSIDE the package context, which can then launch TradingView.exe with args.
# Direct Start-Process on the MSIX exe fails ("Access is denied").
# Invoke-CommandInDesktopPackage with -Command TradingView.exe loses the args.
# Running via powershell inside the package context bypasses both limitations.
Invoke-CommandInDesktopPackage `
    -PackageFamilyName $pkg.PackageFamilyName `
    -AppId "TradingView.Desktop" `
    -Command "powershell.exe" `
    -Args "-NoProfile -NonInteractive -Command `"& '$tvExe' --remote-debugging-port=$Port`""

Write-Host "Waiting for CDP on http://localhost:$Port ..."
for ($i = 1; $i -le 20; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/json/version" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "CDP READY: $($r.Content)"
        exit 0
    } catch {
        Write-Host "  [$($i*2)s] Waiting..."
    }
}
Write-Host "ERROR: CDP did not respond on port $Port after 40 seconds."
exit 1
