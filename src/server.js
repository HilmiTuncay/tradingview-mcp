import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createLogger } from './utils/logger.js';
import { registerHealthTools } from './tools/health.js';
import { registerChartTools } from './tools/chart.js';
import { registerPineTools } from './tools/pine.js';
import { registerDataTools } from './tools/data.js';
import { registerCaptureTools } from './tools/capture.js';
import { registerDrawingTools } from './tools/drawing.js';
import { registerAlertTools } from './tools/alerts.js';
import { registerBatchTools } from './tools/batch.js';
import { registerReplayTools } from './tools/replay.js';
import { registerIndicatorTools } from './tools/indicators.js';
import { registerWatchlistTools } from './tools/watchlist.js';
import { registerUiTools } from './tools/ui.js';
import { registerPaneTools } from './tools/pane.js';
import { registerTabTools } from './tools/tab.js';
import { registerMorningTools } from './tools/morning.js';
import { registerTechnicalTools } from './tools/technicals.js';
import { registerMarketTools } from './tools/market.js';
import { registerTradeTools } from './tools/trade.js';
import { registerSystemTools } from './tools/system.js';
import { registerBrokerTools } from './tools/broker.js';

const log = createLogger('server');

const server = new McpServer(
  {
    name: 'tradingview',
    version: '3.0.0',
    description: 'AI-assisted TradingView chart analysis, trading tools, and Pine Script development via Chrome DevTools Protocol',
  },
  {
    instructions: `TradingView MCP v3 — 90+ tools for chart analysis, trading, and Pine Script development.

TOOL SELECTION GUIDE:

Quick start — use chart_snapshot for all-in-one context (state + quote + studies + key levels).

Reading your chart:
- chart_get_state → symbol, timeframe, indicator names + entity IDs
- chart_snapshot → ALL-IN-ONE: state + quote + study values + key levels in single call
- data_get_study_values → numeric values from ALL visible indicators
- quote_get → real-time price snapshot
- data_get_ohlcv → price bars (ALWAYS use summary=true)

Multi-timeframe analysis:
- market_multi_tf → switch through D/H4/H1/M15, collect Pine data, auto-restore TF
- market_key_levels → aggregate ALL Pine lines/boxes/labels into unified sorted list
- market_session_info → active sessions (London/NY/Tokyo), overlaps, time to open

Technical indicators (computed locally, no chart indicator needed):
- technicals_calculate → SMA, EMA, RSI, ATR, BB, MACD, VWAP from OHLCV data

Trade management:
- trade_position_size → risk-based lot size (balance, risk%, SL pips)
- trade_rr_calc → Risk:Reward ratio from entry/SL/TP
- trade_journal_add → log trade to journal file
- trade_journal_list → review recent trades

Broker orders (FAST — use these instead of draw_context_menu + draw_click_menu_item):
- trade_list_positions → list all long/short position drawings with entry/SL/TP
- trade_open_limit(entity_id) → ONE-SHOT: scroll + right-click + "Limit Emir Oluştur" click
- trade_submit → click order submit button
- trade_dismiss → dismiss confirmation dialog

Pine indicators (line.new/label.new/table.new/box.new):
- data_get_pine_lines, data_get_pine_labels, data_get_pine_tables, data_get_pine_boxes
- ALWAYS pass study_filter to target specific indicator

Chart control:
- chart_set_symbol, chart_set_timeframe, chart_set_type
- chart_manage_indicator → add/remove (USE FULL NAMES)
- indicator_set_inputs → change settings

Pine Script: pine_set_source → pine_smart_compile → pine_get_errors
Screenshots: capture_screenshot → "full", "chart", "strategy_tester"
Replay: replay_start → replay_step → replay_trade → replay_status → replay_stop
Drawing: draw_shape → horizontal_line, trend_line, rectangle, text, long_position, short_position
Position tools (legacy): draw_context_menu(entity_id) → draw_click_menu_item(text)
Broker order (PREFERRED): trade_list_positions → trade_open_limit → trade_submit
Morning: morning_brief → scan watchlist with bias scoring
Alerts: alert_create, alert_list, alert_delete
Batch: batch_run → action across multiple symbols/timeframes
Panes: pane_list, pane_set_layout, pane_focus, pane_set_symbol
Tabs: tab_list, tab_new, tab_close, tab_switch
System: system_info → version, uptime, connection/cache/queue stats

CONTEXT MANAGEMENT:
- Use chart_snapshot instead of calling 4 separate tools
- ALWAYS use summary=true on data_get_ohlcv
- ALWAYS use study_filter on pine data tools
- Prefer capture_screenshot for visual context over large datasets
- All responses include duration_ms for performance tracking`,
  }
);

// Register all tool groups
registerHealthTools(server);
registerChartTools(server);
registerPineTools(server);
registerDataTools(server);
registerCaptureTools(server);
registerDrawingTools(server);
registerAlertTools(server);
registerBatchTools(server);
registerReplayTools(server);
registerIndicatorTools(server);
registerWatchlistTools(server);
registerUiTools(server);
registerPaneTools(server);
registerTabTools(server);
registerMorningTools(server);
// v3 new tool groups
registerTechnicalTools(server);
registerMarketTools(server);
registerTradeTools(server);
registerSystemTools(server);
registerBrokerTools(server);

// Startup notice (stderr so it doesn't interfere with MCP stdio protocol)
log.info('TradingView MCP v3.0.0 starting');
process.stderr.write('  tradingview-mcp v3.0.0  |  Unofficial tool. Not affiliated with TradingView Inc. or Anthropic.\n');
process.stderr.write('   Ensure your usage complies with TradingView\'s Terms of Use.\n\n');

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
