/**
 * Pure JS technical indicators — no external dependencies.
 * All functions take an array of { open, high, low, close, volume } bars.
 */

function getField(bars, field) {
  return bars.map(b => b[field] ?? b.close);
}

export function sma(bars, period, field = 'close') {
  const values = getField(bars, field);
  if (values.length < period) return { error: `Need ${period} bars, got ${values.length}` };
  const result = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    result.push({ time: bars[i].time, value: Math.round((sum / period) * 100000) / 100000 });
  }
  return { indicator: 'SMA', period, count: result.length, current: result[result.length - 1]?.value, values: result.slice(-20) };
}

export function ema(bars, period, field = 'close') {
  const values = getField(bars, field);
  if (values.length < period) return { error: `Need ${period} bars, got ${values.length}` };
  const k = 2 / (period + 1);
  const result = [];
  // Seed with SMA
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let prev = sum / period;
  result.push({ time: bars[period - 1].time, value: Math.round(prev * 100000) / 100000 });
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    result.push({ time: bars[i].time, value: Math.round(prev * 100000) / 100000 });
  }
  return { indicator: 'EMA', period, count: result.length, current: result[result.length - 1]?.value, values: result.slice(-20) };
}

export function rsi(bars, period = 14) {
  const values = getField(bars, 'close');
  if (values.length < period + 1) return { error: `Need ${period + 1} bars, got ${values.length}` };

  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = values[i] - values[i - 1];
    if (change > 0) gainSum += change; else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const result = [];
  const rsiVal = avgLoss === 0 ? 100 : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
  result.push({ time: bars[period].time, value: rsiVal });

  for (let i = period + 1; i < values.length; i++) {
    const change = values[i] - values[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const val = avgLoss === 0 ? 100 : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100;
    result.push({ time: bars[i].time, value: val });
  }
  return { indicator: 'RSI', period, count: result.length, current: result[result.length - 1]?.value, values: result.slice(-20) };
}

export function atr(bars, period = 14) {
  if (bars.length < period + 1) return { error: `Need ${period + 1} bars, got ${bars.length}` };
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trs.push(tr);
  }

  let atrVal = 0;
  for (let i = 0; i < period; i++) atrVal += trs[i];
  atrVal /= period;

  const result = [{ time: bars[period].time, value: Math.round(atrVal * 100000) / 100000 }];
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period;
    result.push({ time: bars[i + 1].time, value: Math.round(atrVal * 100000) / 100000 });
  }
  return { indicator: 'ATR', period, count: result.length, current: result[result.length - 1]?.value, values: result.slice(-20) };
}

export function bollingerBands(bars, period = 20, mult = 2) {
  const values = getField(bars, 'close');
  if (values.length < period) return { error: `Need ${period} bars, got ${values.length}` };
  const result = [];
  for (let i = period - 1; i < values.length; i++) {
    let sum = 0, sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) { sum += values[j]; sqSum += values[j] * values[j]; }
    const mean = sum / period;
    const stddev = Math.sqrt(sqSum / period - mean * mean);
    result.push({
      time: bars[i].time,
      upper: Math.round((mean + mult * stddev) * 100000) / 100000,
      middle: Math.round(mean * 100000) / 100000,
      lower: Math.round((mean - mult * stddev) * 100000) / 100000,
      bandwidth: stddev > 0 ? Math.round(((mult * 2 * stddev) / mean) * 10000) / 100 : 0,
    });
  }
  return {
    indicator: 'BB', period, multiplier: mult, count: result.length,
    current: result[result.length - 1],
    values: result.slice(-20),
  };
}

export function macd(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const values = getField(bars, 'close');
  if (values.length < slowPeriod + signalPeriod) return { error: `Need ${slowPeriod + signalPeriod} bars, got ${values.length}` };

  function calcEma(data, period) {
    const k = 2 / (period + 1);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += data[i];
    const out = new Array(data.length).fill(null);
    out[period - 1] = sum / period;
    for (let i = period; i < data.length; i++) {
      out[i] = data[i] * k + out[i - 1] * (1 - k);
    }
    return out;
  }

  const fastEma = calcEma(values, fastPeriod);
  const slowEma = calcEma(values, slowPeriod);
  const macdLine = values.map((_, i) => (fastEma[i] != null && slowEma[i] != null) ? fastEma[i] - slowEma[i] : null);

  const macdValid = macdLine.filter(v => v !== null);
  const signalLine = calcEma(macdValid, signalPeriod);

  const result = [];
  let validIdx = 0;
  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] === null) continue;
    const sig = signalLine[validIdx] ?? null;
    const hist = sig !== null ? macdLine[i] - sig : null;
    result.push({
      time: bars[i].time,
      macd: Math.round(macdLine[i] * 100000) / 100000,
      signal: sig !== null ? Math.round(sig * 100000) / 100000 : null,
      histogram: hist !== null ? Math.round(hist * 100000) / 100000 : null,
    });
    validIdx++;
  }
  return {
    indicator: 'MACD', fast: fastPeriod, slow: slowPeriod, signal: signalPeriod,
    count: result.length, current: result[result.length - 1],
    values: result.slice(-20),
  };
}

export function vwap(bars) {
  if (bars.length === 0) return { error: 'No bars provided' };
  let cumVolPrice = 0, cumVol = 0;
  const result = [];
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3;
    cumVolPrice += typical * (bar.volume || 0);
    cumVol += bar.volume || 0;
    const val = cumVol > 0 ? Math.round((cumVolPrice / cumVol) * 100000) / 100000 : typical;
    result.push({ time: bar.time, value: val });
  }
  return { indicator: 'VWAP', count: result.length, current: result[result.length - 1]?.value, values: result.slice(-20) };
}

// All-in-one calculator
export function calculate(bars, indicator, params = {}) {
  const fn = { sma, ema, rsi, atr, bb: bollingerBands, macd, vwap }[indicator.toLowerCase()];
  if (!fn) return { error: `Unknown indicator: ${indicator}. Available: sma, ema, rsi, atr, bb, macd, vwap` };
  if (indicator.toLowerCase() === 'bb') return fn(bars, params.period, params.multiplier);
  if (indicator.toLowerCase() === 'macd') return fn(bars, params.fast, params.slow, params.signal);
  return fn(bars, params.period, params.field);
}
