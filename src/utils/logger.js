/**
 * Structured logger — writes to stderr (never stdout, which is MCP stdio).
 * Control via TV_MCP_LOG_LEVEL env var: debug | info | warn | error | silent
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
const currentLevel = LEVELS[process.env.TV_MCP_LOG_LEVEL || 'info'] ?? LEVELS.info;
const jsonFormat = process.env.TV_MCP_LOG_FORMAT === 'json';

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  if (meta instanceof Error) return ` | ${meta.message}`;
  try { return ' | ' + JSON.stringify(meta); } catch { return ''; }
}

function write(level, component, msg, meta) {
  if (LEVELS[level] < currentLevel) return;
  const ts = new Date().toISOString();
  if (jsonFormat) {
    const entry = { ts, level, component, msg };
    if (meta) entry.meta = meta instanceof Error ? { error: meta.message, stack: meta.stack } : meta;
    process.stderr.write(JSON.stringify(entry) + '\n');
  } else {
    const prefix = `${ts} | ${level.toUpperCase().padEnd(5)} | ${component}`;
    process.stderr.write(`${prefix} | ${msg}${formatMeta(meta)}\n`);
  }
}

export function createLogger(component) {
  const logger = {
    debug: (msg, meta) => write('debug', component, msg, meta),
    info: (msg, meta) => write('info', component, msg, meta),
    warn: (msg, meta) => write('warn', component, msg, meta),
    error: (msg, meta) => write('error', component, msg, meta),
    child: (sub) => createLogger(`${component}/${sub}`),
    time: (label) => {
      const start = Date.now();
      return (meta) => {
        const ms = Date.now() - start;
        write('debug', component, `${label} (${ms}ms)`, meta);
        return ms;
      };
    },
  };
  return logger;
}

export const log = createLogger('mcp');
