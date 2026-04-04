/**
 * MCP tools for pure-JS technical indicator calculation.
 */
import { z } from 'zod';
import { wrapTool } from './_format.js';
import * as technicals from '../core/technicals.js';
import { getOhlcv } from '../core/data.js';

export function registerTechnicalTools(server) {
  server.tool(
    'technicals_calculate',
    'Calculate technical indicators (SMA, EMA, RSI, ATR, BB, MACD, VWAP) from chart OHLCV data. No need to add indicators to chart — computed locally from price data.',
    {
      indicator: z.enum(['sma', 'ema', 'rsi', 'atr', 'bb', 'macd', 'vwap']).describe('Indicator to calculate'),
      period: z.number().optional().describe('Period (default varies by indicator)'),
      fast: z.number().optional().describe('MACD fast period (default 12)'),
      slow: z.number().optional().describe('MACD slow period (default 26)'),
      signal: z.number().optional().describe('MACD signal period (default 9)'),
      multiplier: z.number().optional().describe('Bollinger Bands multiplier (default 2)'),
      field: z.enum(['open', 'high', 'low', 'close']).optional().describe('Price field (default close)'),
      bar_count: z.number().optional().describe('Number of bars to use (default 200)'),
    },
    wrapTool(async (params) => {
      const { indicator, period, fast, slow, signal, multiplier, field, bar_count } = params;
      const ohlcv = await getOhlcv({ count: bar_count || 200 });
      if (!ohlcv.bars || ohlcv.bars.length === 0) throw new Error('No OHLCV data available');
      const result = technicals.calculate(ohlcv.bars, indicator, { period, fast, slow, signal, multiplier, field });
      if (result.error) throw new Error(result.error);
      return { success: true, bars_used: ohlcv.bars.length, ...result };
    }, 'technicals_calculate')
  );
}
