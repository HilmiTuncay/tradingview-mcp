/**
 * Shared MCP response formatting + tool wrapper.
 */
import { createLogger } from '../utils/logger.js';

const log = createLogger('tools');

export function jsonResult(obj, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
    ...(isError && { isError: true }),
  };
}

/**
 * Wraps a tool handler with timing, logging, and error handling.
 * Eliminates the repetitive try/catch pattern in every tool registration.
 *
 * Usage:
 *   server.tool('name', 'desc', schema, wrapTool(core.fn, 'name'));
 */
export function wrapTool(fn, toolName) {
  return async (params) => {
    const start = Date.now();
    try {
      const result = await fn(params);
      const duration_ms = Date.now() - start;
      if (result && typeof result === 'object') {
        result.duration_ms = duration_ms;
      }
      log.debug(`${toolName} OK`, { duration_ms });
      return jsonResult(result);
    } catch (err) {
      const duration_ms = Date.now() - start;
      log.error(`${toolName} failed`, { error: err.message, duration_ms });
      return jsonResult({ success: false, error: err.message, duration_ms }, true);
    }
  };
}
