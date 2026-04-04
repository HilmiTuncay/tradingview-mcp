/**
 * MCP tools for market context — multi-TF analysis, session info, key levels.
 */
import { z } from 'zod';
import { wrapTool } from './_format.js';
import * as market from '../core/market.js';

export function registerMarketTools(server) {
  server.tool(
    'market_multi_tf',
    'Multi-timeframe analysis: switch through timeframes, collect Pine labels/lines/OHLCV, then restore. Use for D1→H4→H1→M15 SMC confluence analysis.',
    {
      timeframes: z.array(z.string()).optional().describe('Timeframes to analyze (default: ["D", "240", "60", "15"])'),
      collect: z.array(z.enum(['state', 'pine_lines', 'pine_labels', 'pine_boxes', 'study_values', 'ohlcv_summary', 'quote']))
        .optional().describe('Data to collect per TF (default: ["pine_labels", "ohlcv_summary"])'),
      study_filter: z.string().optional().describe('Filter Pine data by indicator name'),
    },
    wrapTool(async (params) => {
      return await market.multiTimeframe(params);
    }, 'market_multi_tf')
  );

  server.tool(
    'market_session_info',
    'Get current trading session info: active sessions (London/NY/Tokyo/Sydney), overlaps, time until next open, weekend check.',
    {},
    wrapTool(async () => {
      return market.sessionInfo();
    }, 'market_session_info')
  );

  server.tool(
    'market_key_levels',
    'Aggregate ALL Pine lines + boxes + labels into a unified sorted key levels list. Combines data from all visible indicators.',
    {
      study_filter: z.string().optional().describe('Filter by indicator name'),
    },
    wrapTool(async (params) => {
      return await market.keyLevels(params);
    }, 'market_key_levels')
  );
}
