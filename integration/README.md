# Integration Files

Bu klasor, TradingView MCP server'in MetaTrader 5 + Claude Code projesiyle entegrasyonu icin gerekli dosyalari icerir.

## Dosyalar

| Dosya | Aciklama |
|-------|----------|
| `launch-tv.ps1` | TradingView Desktop'u CDP portu (9222) acik sekilde baslatan PowerShell script |
| `tv-trade.md` | `/tv-trade` slash komutu — TradingView ciziminiden Pepperstone'a limit emir acar |
| `mcp-config-example.json` | Claude Code `.mcp.json` ornek konfigurasyonu (MT5 + TradingView MCP) |

## Kurulum

1. `launch-tv.ps1` dosyasini projenizin `scripts/` klasorune kopyalayin
2. `tv-trade.md` dosyasini `.claude/commands/` altina kopyalayin
3. `mcp-config-example.json` icerigini projenizin `.mcp.json` dosyasina uyarlayin

## CDP Launch

TradingView Desktop (MSIX/Microsoft Store) CDP portu varsayilan olarak kapalidir:

```powershell
.\scripts\launch-tv.ps1
```

Bu script:
- Mevcut TradingView process'ini kapatir
- `ELECTRON_EXTRA_LAUNCH_ARGS=--remote-debugging-port=9222` ile yeniden baslatir
- `localhost:9222` hazir olana kadar bekler (max 30sn)
