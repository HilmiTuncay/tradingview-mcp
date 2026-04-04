/**
 * MCP tools for system info and all-in-one chart snapshot.
 */
import { z } from 'zod';
import { wrapTool } from './_format.js';
import { connectionStats } from '../connection.js';
import { cache } from '../utils/cache.js';
import { queue } from '../utils/queue.js';
import * as chart from '../core/chart.js';
import * as data from '../core/data.js';
import * as market from '../core/market.js';

const SERVER_START = Date.now();

export function registerSystemTools(server) {
  server.tool(
    'system_info',
    'Get MCP server status: version, uptime, CDP connection stats, cache stats, queue stats.',
    {},
    wrapTool(async () => {
      const conn = connectionStats();
      return {
        success: true,
        version: '3.0.0',
        uptime_ms: Date.now() - SERVER_START,
        uptime_human: formatDuration(Date.now() - SERVER_START),
        connection: conn,
        cache: cache.stats(),
        queue: queue.stats(),
      };
    }, 'system_info')
  );

  server.tool(
    'chart_snapshot',
    'All-in-one chart context: state + quote + study values + key levels in a single call. Use instead of calling chart_get_state + quote_get + data_get_study_values separately.',
    {
      include_levels: z.boolean().optional().describe('Include Pine key levels (default true)'),
      study_filter: z.string().optional().describe('Filter key levels by indicator name'),
    },
    wrapTool(async (params) => {
      const { include_levels = true, study_filter } = params;

      // Run independent reads in parallel
      const [state, quote, studyValues, levels] = await Promise.all([
        chart.getState().catch(e => ({ error: e.message })),
        data.getQuote().catch(e => ({ error: e.message })),
        data.getStudyValues().catch(e => ({ error: e.message })),
        include_levels ? market.keyLevels({ study_filter }).catch(e => ({ error: e.message })) : null,
      ]);

      return {
        success: true,
        state,
        quote,
        study_values: studyValues,
        key_levels: levels,
        session: market.sessionInfo(),
      };
    }, 'chart_snapshot')
  );
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}
