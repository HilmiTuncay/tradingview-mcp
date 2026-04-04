# TradingView MCP — Claude Instructions

90+ tools for reading, analyzing, and controlling a live TradingView Desktop chart via CDP (port 9222).

**v3.0 Highlights:** Built-in technical indicators (SMA/EMA/RSI/ATR/BB/MACD/VWAP), multi-timeframe analysis, trade management (position sizing, R:R calc, journal), structured logging, request queue, auto-reconnect, and cache.

## Decision Tree — Which Tool When

### "What's on my chart right now?"
1. **`chart_snapshot`** → ALL-IN-ONE: state + quote + study values + key levels + session info (USE THIS FIRST)
2. `chart_get_state` → symbol, timeframe, chart type, indicators + last bar price
3. `data_get_study_values` → current numeric values from all visible indicators
4. `quote_get` → real-time price, OHLC, volume

### "What levels/lines/labels are showing?"
Custom Pine indicators draw with `line.new()`, `label.new()`, `table.new()`, `box.new()`. Use:

1. **`market_key_levels`** → unified sorted list of ALL Pine lines + boxes + labels (USE THIS)
2. `data_get_pine_lines` → horizontal price levels (deduplicated, sorted high→low)
3. `data_get_pine_labels` → text annotations with prices
4. `data_get_pine_tables` → table data formatted as rows
5. `data_get_pine_boxes` → price zones as {high, low} pairs

Use `study_filter` parameter to target a specific indicator by name.

### "Give me price data"
- `data_get_ohlcv` with `summary: true` → compact stats (high, low, range, change%, avg volume, last 5 bars)
- `data_get_ohlcv` without summary → all bars (use `count` to limit, default 100)
- `quote_get` → single latest price snapshot

### "Multi-timeframe analysis"
- **`market_multi_tf`** → switch through D/H4/H1/M15, collect Pine labels/lines/OHLCV per TF, auto-restore
- Use for SMC confluence: D1 bias → H4 structure → H1 entry signals

### "Calculate indicators without adding to chart"
- **`technicals_calculate`** → SMA, EMA, RSI, ATR, BB, MACD, VWAP from OHLCV data
- Pure JS — no TradingView indicator needed, instant computation

### "Trade setup analysis"
- **`trade_rr_calc`** → Risk:Reward ratio from entry/SL/TP, validates direction
- **`trade_position_size`** → risk-based lot size (balance, risk%, SL pips)
- **`trade_journal_add`** → log trade setup to journal file
- **`trade_journal_list`** → review recent journal entries

### "What session is it?"
- **`market_session_info`** → active sessions (London/NY/Tokyo/Sydney), overlaps, weekend check

### "Analyze my chart" (full report workflow)
1. `chart_snapshot` → all-in-one context (state + quote + studies + key levels)
2. `data_get_pine_tables` → session stats, analytics tables
3. `technicals_calculate` → RSI, ATR for confluence
4. `capture_screenshot` → visual confirmation

### "System status"
- **`system_info`** → MCP version, uptime, CDP connection stats, cache/queue stats

### "Change the chart"
- `chart_set_symbol` → switch ticker (e.g., "AAPL", "ES1!", "NYMEX:CL1!")
- `chart_set_timeframe` → switch resolution (e.g., "1", "5", "15", "60", "D", "W")
- `chart_set_type` → switch chart style (Candles, HeikinAshi, Line, Area, Renko, etc.)
- `chart_manage_indicator` → add or remove studies (use full name: "Relative Strength Index", not "RSI")
- `chart_scroll_to_date` → jump to a date (ISO format: "2025-01-15")
- `chart_set_visible_range` → zoom to exact date range (unix timestamps)

### "Work on Pine Script"
1. `pine_set_source` → inject code into editor
2. `pine_smart_compile` → compile with auto-detection + error check
3. `pine_get_errors` → read compilation errors
4. `pine_get_console` → read log.info() output
5. `pine_get_source` → read current code back (WARNING: can be very large for complex scripts)
6. `pine_save` → save to TradingView cloud
7. `pine_new` → create blank indicator/strategy/library
8. `pine_open` → load a saved script by name

### "Practice trading with replay"
1. `replay_start` with `date: "2025-03-01"` → enter replay mode
2. `replay_step` → advance one bar
3. `replay_autoplay` → auto-advance (set speed with `speed` param in ms)
4. `replay_trade` with `action: "buy"/"sell"/"close"` → execute trades
5. `replay_status` → check position, P&L, current date
6. `replay_stop` → return to realtime

### "Screen multiple symbols"
- `batch_run` with `symbols: ["ES1!", "NQ1!", "YM1!"]` and `action: "screenshot"` or `"get_ohlcv"`

### "Draw on the chart"
- `draw_shape` → horizontal_line, trend_line, rectangle, text, **long_position**, **short_position** (pass point + optional point2)
- `draw_list` → see what's drawn
- `draw_remove_one` → remove by ID
- `draw_clear` → remove all
- `draw_context_menu` → right-click a long/short_position to open context menu (returns menu items)
- `draw_click_menu_item` → click a menu item (e.g., "Limit Emri Oluştur") after draw_context_menu
- `draw_get_screen_coords` → get CSS pixel coordinates of a position drawing
- `draw_get_properties` → get all properties (entry, SL, TP, qty, etc.)

#### Long/Short Position → Broker Order Workflow
1. `chart_get_state` → get visible range info
2. `quote_get` → get current price for entry/SL/TP calculation
3. `draw_shape` with `shape: "long_position"` (or `"short_position"`) — **IMPORTANT:** use a time in the MIDDLE of the visible range, NOT the current time. If entry time equals `vis_to` (right edge), the drawing lands on the price scale and `draw_context_menu` will open the wrong menu.
4. `draw_get_screen_coords` → verify `body_center_x` is well within canvas bounds (not near `canvas_left + canvas_width`)
5. `draw_context_menu(entity_id)` → right-click opens position menu with "Limit Emri Oluştur…"
6. `draw_click_menu_item("Limit Emri Oluştur")` → opens broker order panel
7. `ui_find_element("LİMİT")` → locate the submit button
8. `ui_click(by: "data-name", value: "place-and-modify-button")` → submit the order

### "Manage alerts"
- `alert_create` → set price alert (condition: "crossing", "greater_than", "less_than")
- `alert_list` → view active alerts
- `alert_delete` → remove alerts

### "Navigate the UI"
- `ui_open_panel` → open/close pine-editor, strategy-tester, watchlist, alerts, trading
- `ui_click` → click buttons by aria-label, text, or data-name
- `layout_switch` → load a saved layout by name
- `ui_fullscreen` → toggle fullscreen
- `capture_screenshot` → take a screenshot (regions: "full", "chart", "strategy_tester")

### "TradingView isn't running"
- `tv_launch` → auto-detect and launch TradingView with CDP on Mac/Win/Linux
- `tv_health_check` → verify connection is working

## Context Management Rules

These tools can return large payloads. Follow these rules to avoid context bloat:

1. **Always use `summary: true` on `data_get_ohlcv`** unless you specifically need individual bars
2. **Always use `study_filter`** on pine tools when you know which indicator you want — don't scan all studies unnecessarily
3. **Never use `verbose: true`** on pine tools unless the user specifically asks for raw drawing data with IDs/colors
4. **Avoid calling `pine_get_source`** on complex scripts — it can return 200KB+. Only read if you need to edit the code.
5. **Avoid calling `data_get_indicator`** on protected/encrypted indicators — their inputs are encoded blobs. Use `data_get_study_values` instead for current values.
6. **Use `capture_screenshot`** for visual context instead of pulling large datasets — a screenshot is ~300KB but gives you the full visual picture
7. **Call `chart_get_state` once** at the start to get entity IDs, then reference them — don't re-call repeatedly
8. **Cap your OHLCV requests** — `count: 20` for quick analysis, `count: 100` for deeper work, `count: 500` only when specifically needed

### Output Size Estimates (compact mode)
| Tool | Typical Output |
|------|---------------|
| `quote_get` | ~200 bytes |
| `data_get_study_values` | ~500 bytes (all indicators) |
| `data_get_pine_lines` | ~1-3 KB per study (deduplicated levels) |
| `data_get_pine_labels` | ~2-5 KB per study (capped at 50) |
| `data_get_pine_tables` | ~1-4 KB per study (formatted rows) |
| `data_get_pine_boxes` | ~1-2 KB per study (deduplicated zones) |
| `data_get_ohlcv` (summary) | ~500 bytes |
| `data_get_ohlcv` (100 bars) | ~8 KB |
| `capture_screenshot` | ~300 bytes (returns file path, not image data) |

## Tool Conventions

- All tools return `{ success: true/false, ... }`
- Entity IDs (from `chart_get_state`) are session-specific — don't cache across sessions
- Pine indicators must be **visible** on chart for pine graphics tools to read their data
- `chart_manage_indicator` requires **full indicator names**: "Relative Strength Index" not "RSI", "Moving Average Exponential" not "EMA", "Bollinger Bands" not "BB"
- Screenshots save to `screenshots/` directory with timestamps
- OHLCV capped at 500 bars, trades at 20 per request
- Pine labels capped at 50 per study by default (pass `max_labels` to override)

## Architecture

```
Claude Code ←→ MCP Server (stdio) ←→ CDP (localhost:9222) ←→ TradingView Desktop (Electron)
```

Pine graphics path: `study._graphics._primitivesCollection.dwglines.get('lines').get(false)._primitivesDataById`
