import CDP from 'chrome-remote-interface';
import { EventEmitter } from 'events';
import { createLogger } from './utils/logger.js';
import { queue } from './utils/queue.js';
import { withRetry, isTransient } from './utils/retry.js';

const log = createLogger('connection');

let client = null;
let targetInfo = null;
const CDP_HOST = 'localhost';
const CDP_PORT = 9222;
const MAX_RETRIES = 5;
const BASE_DELAY = 500;

// --- Connection state tracking ---
const startTime = Date.now();
let connectCount = 0;
let evalCount = 0;
let lastEvalTime = 0;
let heartbeatTimer = null;
const HEARTBEAT_INTERVAL = 15000; // 15 seconds

export const connectionEvents = new EventEmitter();

// Known direct API paths discovered via live probing
const KNOWN_PATHS = {
  chartApi: 'window.TradingViewApi._activeChartWidgetWV.value()',
  chartWidgetCollection: 'window.TradingViewApi._chartWidgetCollection',
  bottomWidgetBar: 'window.TradingView.bottomWidgetBar',
  replayApi: 'window.TradingViewApi._replayApi',
  alertService: 'window.TradingViewApi._alertService',
  chartApiInstance: 'window.ChartApiInstance',
  mainSeriesBars: 'window.TradingViewApi._activeChartWidgetWV.value()._chartWidget.model().mainSeries().bars()',
  strategyStudy: 'chart._chartWidget.model().model().dataSources()',
  layoutManager: 'window.TradingViewApi.getSavedCharts',
  symbolSearchApi: 'window.TradingViewApi.searchSymbols',
  pineFacadeApi: 'https://pine-facade.tradingview.com/pine-facade',
};

export { KNOWN_PATHS };

/**
 * Sanitize a string for safe interpolation into JavaScript code evaluated via CDP.
 * Uses JSON.stringify to produce a properly escaped JS string literal (with quotes).
 * Prevents injection via quotes, backticks, template literals, or control chars.
 */
export function safeString(str) {
  return JSON.stringify(String(str));
}

/**
 * Validate that a value is a finite number. Throws if NaN, Infinity, or non-numeric.
 * Prevents corrupt values from reaching TradingView APIs that persist to cloud state.
 */
export function requireFinite(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number, got: ${value}`);
  return n;
}

// --- Heartbeat ---

function startHeartbeat() {
  stopHeartbeat();
  if (process.env.TV_MCP_HEARTBEAT === 'false') return;
  heartbeatTimer = setInterval(async () => {
    if (!client) return;
    try {
      await client.Runtime.evaluate({ expression: '1', returnByValue: true, timeout: 5000 });
    } catch {
      log.warn('Heartbeat failed, connection lost');
      connectionEvents.emit('disconnected', { reason: 'heartbeat_failed' });
      client = null;
      targetInfo = null;
      stopHeartbeat();
    }
  }, HEARTBEAT_INTERVAL);
  heartbeatTimer.unref();
}

function stopHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

// --- Connection management ---


export async function getClient() {
  if (client) {
    try {
      await client.Runtime.evaluate({ expression: '1', returnByValue: true });
      return client;
    } catch {
      log.warn('Liveness check failed, reconnecting...');
      client = null;
      targetInfo = null;
      stopHeartbeat();
    }
  }
  return connect();
}

export async function connect() {
  connectionEvents.emit('reconnecting');
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const target = await findChartTarget();
      if (!target) {
        throw new Error('No TradingView chart target found. Is TradingView open with a chart?');
      }
      targetInfo = target;
      client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: target.id });

      await client.Runtime.enable();
      await client.Page.enable();
      await client.DOM.enable();

      connectCount++;
      log.info(`CDP connected (attempt ${attempt + 1}, total connects: ${connectCount})`, { target: target.url });
      connectionEvents.emit('connected', { target: target.url, attempt: attempt + 1 });
      startHeartbeat();
      return client;
    } catch (err) {
      lastError = err;
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), 30000);
      log.debug(`Connect attempt ${attempt + 1} failed, retrying in ${delay}ms`, { error: err.message });
      await new Promise(r => setTimeout(r, delay));
    }
  }
  connectionEvents.emit('error', { error: lastError?.message });
  throw new Error(`CDP connection failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
}

async function findChartTarget() {
  const resp = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  const targets = await resp.json();
  return targets.find(t => t.type === 'page' && /tradingview\.com\/chart/i.test(t.url))
    || targets.find(t => t.type === 'page' && /tradingview/i.test(t.url))
    || null;
}

export async function getTargetInfo() {
  if (!targetInfo) await getClient();
  return targetInfo;
}

// --- Evaluate with queue + retry ---

async function _rawEvaluate(expression, opts = {}) {
  const c = await getClient();
  const result = await c.Runtime.evaluate({
    expression,
    returnByValue: true,
    awaitPromise: opts.awaitPromise ?? false,
    ...opts,
  });
  if (result.exceptionDetails) {
    const msg = result.exceptionDetails.exception?.description
      || result.exceptionDetails.text
      || 'Unknown evaluation error';
    throw new Error(`JS evaluation error: ${msg}`);
  }
  evalCount++;
  lastEvalTime = Date.now();
  return result.result?.value;
}

export async function evaluate(expression, opts = {}) {
  return queue.enqueue(
    () => withRetry(() => _rawEvaluate(expression, opts), { maxRetries: 2, label: 'evaluate' }),
    { priority: 'normal', label: 'evaluate' }
  );
}

export async function evaluateAsync(expression) {
  return evaluate(expression, { awaitPromise: true });
}

// Priority evaluate for health checks
export async function evaluateHighPriority(expression, opts = {}) {
  return queue.enqueue(
    () => _rawEvaluate(expression, opts),
    { priority: 'high', label: 'evaluate:high' }
  );
}

export async function disconnect() {
  stopHeartbeat();
  if (client) {
    try { await client.close(); } catch {}
    client = null;
    targetInfo = null;
    connectionEvents.emit('disconnected', { reason: 'manual' });
    log.info('CDP disconnected');
  }
}

// --- Connection stats ---

export function connectionStats() {
  return {
    connected: client !== null,
    uptime_ms: Date.now() - startTime,
    connect_count: connectCount,
    eval_count: evalCount,
    last_eval_ago_ms: lastEvalTime ? Date.now() - lastEvalTime : null,
    heartbeat_active: heartbeatTimer !== null,
    queue: queue.stats(),
  };
}

// --- Direct API path helpers ---

async function verifyAndReturn(path, name) {
  const exists = await evaluate(`typeof (${path}) !== 'undefined' && (${path}) !== null`);
  if (!exists) {
    throw new Error(`${name} not available at ${path}`);
  }
  return path;
}

export async function getChartApi() {
  return verifyAndReturn(KNOWN_PATHS.chartApi, 'Chart API');
}

export async function getChartCollection() {
  return verifyAndReturn(KNOWN_PATHS.chartWidgetCollection, 'Chart Widget Collection');
}

export async function getBottomBar() {
  return verifyAndReturn(KNOWN_PATHS.bottomWidgetBar, 'Bottom Widget Bar');
}

export async function getReplayApi() {
  return verifyAndReturn(KNOWN_PATHS.replayApi, 'Replay API');
}

export async function getMainSeriesBars() {
  return verifyAndReturn(KNOWN_PATHS.mainSeriesBars, 'Main Series Bars');
}
