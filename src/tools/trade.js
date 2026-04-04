/**
 * MCP tools for trade management — position sizing, R:R, journal.
 */
import { z } from 'zod';
import { wrapTool } from './_format.js';
import * as trade from '../core/trade.js';

export function registerTradeTools(server) {
  server.tool(
    'trade_position_size',
    'Calculate risk-based position size (lot size) from account balance, risk%, and SL distance.',
    {
      balance: z.number().describe('Account balance in USD'),
      risk_pct: z.number().describe('Risk per trade as percentage (e.g., 1 = 1%)'),
      sl_pips: z.number().describe('Stop loss distance in pips'),
      instrument: z.enum(['forex', 'gold', 'index', 'crypto']).optional().describe('Instrument type (default: forex)'),
      pip_value: z.number().optional().describe('Override pip value per standard lot'),
    },
    wrapTool(async (params) => {
      const result = trade.positionSize(params);
      if (result.error) throw new Error(result.error);
      return result;
    }, 'trade_position_size')
  );

  server.tool(
    'trade_rr_calc',
    'Calculate Risk:Reward ratio from entry, SL, and TP prices. Validates direction and minimum R:R.',
    {
      entry: z.number().describe('Entry price'),
      sl: z.number().describe('Stop loss price'),
      tp: z.number().describe('Take profit price'),
    },
    wrapTool(async (params) => {
      const result = trade.riskReward(params);
      if (result.error) throw new Error(result.error);
      return result;
    }, 'trade_rr_calc')
  );

  server.tool(
    'trade_journal_add',
    'Log a trade setup to local journal file (~/.tradingview-sessions/journal.jsonl).',
    {
      symbol: z.string().describe('Trading symbol (e.g., GBPJPY)'),
      direction: z.enum(['long', 'short']).describe('Trade direction'),
      entry: z.number().optional().describe('Entry price'),
      sl: z.number().optional().describe('Stop loss price'),
      tp: z.number().optional().describe('Take profit price'),
      timeframe: z.string().optional().describe('Analysis timeframe'),
      notes: z.string().optional().describe('Trade notes/reasoning'),
      bias: z.string().optional().describe('Market bias (bullish/bearish/neutral)'),
      confluence_score: z.number().optional().describe('Confluence score (0-10)'),
    },
    wrapTool(async (params) => {
      return await trade.journalAdd(params);
    }, 'trade_journal_add')
  );

  server.tool(
    'trade_journal_list',
    'List recent entries from trade journal.',
    {
      count: z.number().optional().describe('Number of entries to show (default 20)'),
      symbol_filter: z.string().optional().describe('Filter by symbol'),
    },
    wrapTool(async (params) => {
      return await trade.journalList(params);
    }, 'trade_journal_list')
  );
}
