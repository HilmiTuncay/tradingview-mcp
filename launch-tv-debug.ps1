# TradingView Desktop - Microsoft Store version launcher with CDP debug port
# Usage: powershell -ExecutionPolicy Bypass -File launch-tv-debug.ps1

$port = 9222
$packageFamilyName = "31178TradingViewInc.TradingView_q4jpyh43s5mv6"
$appId = "TradingView.Desktop"
$exePath = "C:\Program Files\WindowsApps\31178TradingViewInc.TradingView_3.0.0.0_x64__q4jpyh43s5mv6\TradingView.exe"

Write-Host "Killing existing TradingView instances..."
Stop-Process -Name "TradingView" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "Launching TradingView with CDP port $port..."

# Method 1: Direct Start-Process
try {
    Start-Process -FilePath $exePath -ArgumentList "--remote-debugging-port=$port" -ErrorAction Stop
    Write-Host "Launched via direct path. Waiting for CDP..."
} catch {
    Write-Host "Direct launch failed: $($_.Exception.Message)"
    Write-Host "Trying Invoke-CommandInDesktopPackage..."

    # Method 2: MSIX package launch
    try {
        Invoke-CommandInDesktopPackage `
            -PackageFamilyName $packageFamilyName `
            -AppId $appId `
            -Command "TradingView.exe" `
            -Args "--remote-debugging-port=$port"
        Write-Host "Launched via Invoke-CommandInDesktopPackage."
    } catch {
        Write-Host "Both methods failed. Try manually: Start TradingView, then run:"
        Write-Host "  http://localhost:$port/json/version"
    }
}

# Wait and check CDP
Write-Host "Checking CDP connection..."
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$port/json/version" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "CDP connected! $($response.Content)"
        break
    } catch {
        Write-Host "Waiting... ($($i+1)/15)"
    }
}
