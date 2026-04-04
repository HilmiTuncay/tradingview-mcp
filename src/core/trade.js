/**
 * Trade management — position sizing, risk/reward, journal.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const JOURNAL_DIR = join(homedir(), '.tradingview-sessions');
const JOURNAL_FILE = join(JOURNAL_DIR, 'journal.jsonl');

function ensureDir() {
  if (!existsSync(JOURNAL_DIR)) mkdirSync(JOURNAL_DIR, { recursive: true });
}

/**
 * Risk-based position size calculator.
 * @param {number} balance - Account balance in USD
 * @param {number} risk_pct - Risk per trade as % (e.g., 1 = 1%)
 * @param {number} sl_pips - Stop loss distance in pips
 * @param {string} instrument - Instrument type: forex, gold, index, crypto
 * @param {number} pip_value - Override pip value per lot (optional)
 */
export function positionSize({ balance, risk_pct, sl_pips, instrument = 'forex', pip_value }) {
  if (!balance || !risk_pct || !sl_pips) {
    return { error: 'Required: balance, risk_pct, sl_pips' };
  }
  if (sl_pips <= 0) return { error: 'sl_pips must be positive' };

  // Default pip values per standard lot
  const pipValues = {
    forex: 10,    // USD per pip per standard lot (most pairs)
    gold: 1,      // USD per 0.01 move per 1 lot XAUUSD
    index: 1,     // varies greatly
    crypto: 1,    // varies
  };

  const pv = pip_value || pipValues[instrument] || 10;
  const riskAmount = balance * (risk_pct / 100);
  const lotSize = riskAmount / (sl_pips * pv);

  return {
    success: true,
    balance,
    risk_pct,
    risk_amount: Math.round(riskAmount * 100) / 100,
    sl_pips,
    pip_value: pv,
    instrument,
    lot_size: Math.round(lotSize * 100) / 100,
    lot_size_mini: Math.round(lotSize * 10 * 100) / 100,   // mini lots
    lot_size_micro: Math.round(lotSize * 100 * 100) / 100,  // micro lots
  };
}

/**
 * Risk:Reward ratio calculator.
 */
export function riskReward({ entry, sl, tp }) {
  if (entry == null || sl == null || tp == null) {
    return { error: 'Required: entry, sl, tp' };
  }

  const direction = tp > entry ? 'long' : 'short';
  const risk = Math.abs(entry - sl);
  const reward = Math.abs(tp - entry);
  const rr = risk > 0 ? Math.round((reward / risk) * 100) / 100 : 0;

  // Validate SL/TP direction
  if (direction === 'long' && sl >= entry) return { error: 'For long: SL must be below entry' };
  if (direction === 'short' && sl <= entry) return { error: 'For short: SL must be above entry' };
  if (direction === 'long' && tp <= entry) return { error: 'For long: TP must be above entry' };
  if (direction === 'short' && tp >= entry) return { error: 'For short: TP must be below entry' };

  return {
    success: true,
    direction,
    entry,
    sl,
    tp,
    risk_distance: Math.round(risk * 100000) / 100000,
    reward_distance: Math.round(reward * 100000) / 100000,
    rr_ratio: rr,
    rr_display: `1:${rr}`,
    meets_minimum: rr >= 2,
  };
}

/**
 * Add entry to trade journal.
 */
export async function journalAdd({ symbol, direction, entry, sl, tp, timeframe, notes, bias, confluence_score }) {
  ensureDir();

  const record = {
    timestamp: new Date().toISOString(),
    symbol: symbol || 'unknown',
    direction: direction || 'unknown',
    entry: entry ?? null,
    sl: sl ?? null,
    tp: tp ?? null,
    timeframe: timeframe || null,
    rr: entry && sl && tp ? riskReward({ entry, sl, tp }) : null,
    notes: notes || '',
    bias: bias || null,
    confluence_score: confluence_score ?? null,
  };

  writeFileSync(JOURNAL_FILE, JSON.stringify(record) + '\n', { flag: 'a' });

  return { success: true, action: 'added', file: JOURNAL_FILE, record };
}

/**
 * List recent journal entries.
 */
export async function journalList({ count = 20, symbol_filter } = {}) {
  ensureDir();
  if (!existsSync(JOURNAL_FILE)) return { success: true, entries: [], count: 0 };

  const content = readFileSync(JOURNAL_FILE, 'utf-8');
  let entries = content.split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);

  if (symbol_filter) {
    entries = entries.filter(e => e.symbol?.toUpperCase().includes(symbol_filter.toUpperCase()));
  }

  entries = entries.slice(-count);

  return {
    success: true,
    total: entries.length,
    showing: entries.length,
    file: JOURNAL_FILE,
    entries,
  };
}
