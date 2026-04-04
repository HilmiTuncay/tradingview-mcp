import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// --- Cache tests ---
import { Cache } from '../src/utils/cache.js';

describe('Cache', () => {
  it('should store and retrieve values', () => {
    const c = new Cache(1000);
    c.set('key1', 'value1');
    assert.equal(c.get('key1'), 'value1');
  });

  it('should return undefined for missing keys', () => {
    const c = new Cache(1000);
    assert.equal(c.get('missing'), undefined);
  });

  it('should expire entries after TTL', async () => {
    const c = new Cache(50); // 50ms TTL
    c.set('key', 'value');
    assert.equal(c.get('key'), 'value');
    await new Promise(r => setTimeout(r, 60));
    assert.equal(c.get('key'), undefined);
  });

  it('should support per-key TTL override', async () => {
    const c = new Cache(1000);
    c.set('short', 'val', 50);
    c.set('long', 'val', 5000);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(c.get('short'), undefined);
    assert.equal(c.get('long'), 'val');
  });

  it('should invalidate by prefix', () => {
    const c = new Cache(5000);
    c.set('chart:state', 1);
    c.set('chart:range', 2);
    c.set('symbol:info', 3);
    c.invalidatePrefix('chart:');
    assert.equal(c.get('chart:state'), undefined);
    assert.equal(c.get('chart:range'), undefined);
    assert.equal(c.get('symbol:info'), 3);
  });

  it('should track hit/miss stats', () => {
    const c = new Cache(5000);
    c.set('a', 1);
    c.get('a');   // hit
    c.get('b');   // miss
    c.get('a');   // hit
    const s = c.stats();
    assert.equal(s.hits, 2);
    assert.equal(s.misses, 1);
    assert.equal(s.size, 1);
  });
});

// --- Queue tests ---
import { RequestQueue } from '../src/utils/queue.js';

describe('RequestQueue', () => {
  it('should execute tasks serially', async () => {
    const q = new RequestQueue();
    const order = [];
    const p1 = q.enqueue(async () => { order.push(1); return 'a'; });
    const p2 = q.enqueue(async () => { order.push(2); return 'b'; });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, 'a');
    assert.equal(r2, 'b');
    assert.deepEqual(order, [1, 2]);
  });

  it('should handle errors without blocking queue', async () => {
    const q = new RequestQueue();
    const p1 = q.enqueue(async () => { throw new Error('fail'); }).catch(e => e.message);
    const p2 = q.enqueue(async () => 'ok');
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, 'fail');
    assert.equal(r2, 'ok');
  });

  it('should prioritize high over normal', async () => {
    const q = new RequestQueue();
    const order = [];
    // Block queue with a slow task
    const blocker = q.enqueue(async () => { await new Promise(r => setTimeout(r, 50)); order.push('block'); });
    // Add normal, then high
    const p2 = q.enqueue(async () => { order.push('normal'); }, { priority: 'normal' });
    const p3 = q.enqueue(async () => { order.push('high'); }, { priority: 'high' });
    await Promise.all([blocker, p2, p3]);
    assert.equal(order[0], 'block');
    assert.equal(order[1], 'high');
    assert.equal(order[2], 'normal');
  });

  it('should track stats', async () => {
    const q = new RequestQueue();
    await q.enqueue(async () => 'ok');
    await q.enqueue(async () => { throw new Error('fail'); }).catch(() => {});
    const s = q.stats();
    assert.equal(s.completed, 1);
    assert.equal(s.failed, 1);
  });
});

// --- Retry tests ---
import { withRetry, isTransient } from '../src/utils/retry.js';

describe('withRetry', () => {
  it('should return result on success', async () => {
    const result = await withRetry(async () => 42);
    assert.equal(result, 42);
  });

  it('should retry transient errors', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('ECONNRESET');
      return 'ok';
    }, { baseDelay: 10 });
    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
  });

  it('should not retry permanent errors', async () => {
    let attempts = 0;
    try {
      await withRetry(async () => {
        attempts++;
        throw new Error('JS evaluation error: ReferenceError');
      }, { baseDelay: 10 });
    } catch (e) {
      assert.equal(attempts, 1);
      assert.ok(e.message.includes('ReferenceError'));
    }
  });
});

describe('isTransient', () => {
  it('should classify CDP errors as transient', () => {
    assert.ok(isTransient(new Error('ECONNREFUSED')));
    assert.ok(isTransient(new Error('WebSocket is not open')));
    assert.ok(isTransient(new Error('CDP connection timeout')));
  });

  it('should classify JS errors as permanent', () => {
    assert.ok(!isTransient(new Error('JS evaluation error: undefined')));
    assert.ok(!isTransient(new Error('Study not found')));
  });
});

// --- Technicals tests ---
import * as technicals from '../src/core/technicals.js';

describe('Technicals', () => {
  const bars = [];
  // Generate 50 bars of synthetic data
  let price = 100;
  for (let i = 0; i < 50; i++) {
    const change = (Math.sin(i * 0.3) * 2);
    price += change;
    bars.push({
      time: 1700000000 + i * 3600,
      open: price - 0.5,
      high: price + 1,
      low: price - 1,
      close: price,
      volume: 1000 + i * 10,
    });
  }

  it('SMA should calculate correctly', () => {
    const result = technicals.sma(bars, 10);
    assert.ok(result.current);
    assert.equal(result.indicator, 'SMA');
    assert.equal(result.period, 10);
    assert.ok(result.count > 0);
  });

  it('EMA should calculate correctly', () => {
    const result = technicals.ema(bars, 12);
    assert.ok(result.current);
    assert.equal(result.indicator, 'EMA');
  });

  it('RSI should be between 0 and 100', () => {
    const result = technicals.rsi(bars, 14);
    assert.ok(result.current >= 0 && result.current <= 100, `RSI ${result.current} out of range`);
  });

  it('ATR should be positive', () => {
    const result = technicals.atr(bars, 14);
    assert.ok(result.current > 0);
  });

  it('Bollinger Bands should have upper > middle > lower', () => {
    const result = technicals.bollingerBands(bars, 20);
    const cur = result.current;
    assert.ok(cur.upper > cur.middle);
    assert.ok(cur.middle > cur.lower);
  });

  it('MACD should have macd, signal, histogram', () => {
    const result = technicals.macd(bars, 12, 26, 9);
    assert.ok('macd' in result.current);
    assert.ok('signal' in result.current);
    assert.ok('histogram' in result.current);
  });

  it('VWAP should calculate', () => {
    const result = technicals.vwap(bars);
    assert.ok(result.current > 0);
  });

  it('calculate() should route to correct indicator', () => {
    const result = technicals.calculate(bars, 'rsi', { period: 14 });
    assert.equal(result.indicator, 'RSI');
  });

  it('should return error for insufficient data', () => {
    const result = technicals.sma(bars.slice(0, 3), 20);
    assert.ok(result.error);
  });
});

// --- Trade tests ---
import * as trade from '../src/core/trade.js';

describe('Trade', () => {
  it('positionSize should calculate correctly', () => {
    const result = trade.positionSize({ balance: 10000, risk_pct: 1, sl_pips: 50 });
    assert.ok(result.success);
    assert.equal(result.risk_amount, 100);
    assert.equal(result.lot_size, 0.2); // 100 / (50 * 10)
  });

  it('riskReward should calculate for long', () => {
    const result = trade.riskReward({ entry: 1.1000, sl: 1.0950, tp: 1.1100 });
    assert.ok(result.success);
    assert.equal(result.direction, 'long');
    assert.equal(result.rr_ratio, 2);
    assert.ok(result.meets_minimum);
  });

  it('riskReward should calculate for short', () => {
    const result = trade.riskReward({ entry: 1.1000, sl: 1.1050, tp: 1.0900 });
    assert.ok(result.success);
    assert.equal(result.direction, 'short');
    assert.equal(result.rr_ratio, 2);
  });

  it('riskReward should reject invalid SL/TP', () => {
    const result = trade.riskReward({ entry: 1.1000, sl: 1.1050, tp: 1.1100 });
    assert.ok(result.error); // SL above entry for long
  });
});

// --- Market (pure functions) ---
import * as market from '../src/core/market.js';

describe('Market', () => {
  it('sessionInfo should return valid structure', () => {
    const info = market.sessionInfo();
    assert.ok(info.success);
    assert.ok(info.utc_time);
    assert.ok(Array.isArray(info.active_sessions));
    assert.ok(typeof info.is_weekend === 'boolean');
  });

  it('keyLevelProximity should filter by distance', () => {
    const levels = [
      { price: 100, type: 'line' },
      { price: 100.3, type: 'line' },
      { price: 105, type: 'line' },
      { price: 95, type: 'line' },
    ];
    const result = market.keyLevelProximity(100, levels, 0.5);
    assert.ok(result.success);
    assert.ok(result.nearby_count >= 2); // 100 and 100.3 are within 0.5%
    assert.ok(result.levels.every(l => Math.abs(l.distance_pct) <= 0.5));
  });
});
