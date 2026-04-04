/**
 * Market context — multi-timeframe analysis, session info, key levels.
 */
import { evaluate } from '../connection.js';
import { waitForChartReady } from '../wait.js';
import * as data from './data.js';
import * as chart from './chart.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('core/market');
const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

/**
 * Multi-timeframe analysis: switch TF, collect data, restore original.
 * collect options: 'state', 'pine_lines', 'pine_labels', 'pine_boxes', 'study_values', 'ohlcv_summary', 'quote'
 */
export async function multiTimeframe({ timeframes = ['D', '240', '60', '15'], collect = ['pine_labels', 'ohlcv_summary'], study_filter } = {}) {
  // Save original state
  const original = await chart.getState();
  const originalTf = original.resolution;
  const results = {};

  try {
    for (const tf of timeframes) {
      log.debug(`Switching to ${tf}`);
      await chart.setTimeframe({ timeframe: tf });
      await waitForChartReady(null, tf);
      await new Promise(r => setTimeout(r, 500)); // let indicators recalculate

      const tfResult = { timeframe: tf };

      for (const item of collect) {
        try {
          switch (item) {
            case 'state':
              tfResult.state = await chart.getState();
              break;
            case 'pine_lines':
              tfResult.pine_lines = await data.getPineLines({ study_filter });
              break;
            case 'pine_labels':
              tfResult.pine_labels = await data.getPineLabels({ study_filter, max_labels: 30 });
              break;
            case 'pine_boxes':
              tfResult.pine_boxes = await data.getPineBoxes({ study_filter });
              break;
            case 'study_values':
              tfResult.study_values = await data.getStudyValues();
              break;
            case 'ohlcv_summary':
              tfResult.ohlcv = await data.getOhlcv({ count: 100, summary: true });
              break;
            case 'quote':
              tfResult.quote = await data.getQuote();
              break;
          }
        } catch (err) {
          tfResult[item] = { error: err.message };
        }
      }
      results[tf] = tfResult;
    }
  } finally {
    // Always restore original timeframe
    log.debug(`Restoring original TF: ${originalTf}`);
    await chart.setTimeframe({ timeframe: originalTf });
    await waitForChartReady(null, originalTf);
  }

  return {
    success: true,
    symbol: original.symbol,
    original_timeframe: originalTf,
    timeframes_analyzed: timeframes.length,
    results,
  };
}

/**
 * Aggregate all Pine lines + boxes + labels into a unified sorted key levels array.
 */
export async function keyLevels({ study_filter } = {}) {
  const [lines, boxes, labels] = await Promise.all([
    data.getPineLines({ study_filter }).catch(() => ({ studies: [] })),
    data.getPineBoxes({ study_filter }).catch(() => ({ studies: [] })),
    data.getPineLabels({ study_filter, max_labels: 50 }).catch(() => ({ studies: [] })),
  ]);

  const levels = [];
  const seen = new Set();

  // Lines -> levels
  for (const study of (lines.studies || [])) {
    for (const price of (study.horizontal_levels || [])) {
      const key = `line:${price}`;
      if (!seen.has(key)) {
        levels.push({ price, type: 'line', source: study.name });
        seen.add(key);
      }
    }
  }

  // Boxes -> zone levels (high and low)
  for (const study of (boxes.studies || [])) {
    for (const zone of (study.zones || [])) {
      const key = `zone:${zone.high}:${zone.low}`;
      if (!seen.has(key)) {
        levels.push({ price: zone.high, price_low: zone.low, type: 'zone', source: study.name });
        seen.add(key);
      }
    }
  }

  // Labels -> levels with text
  for (const study of (labels.studies || [])) {
    for (const label of (study.labels || [])) {
      if (label.price != null) {
        const key = `label:${label.price}:${label.text}`;
        if (!seen.has(key)) {
          levels.push({ price: label.price, type: 'label', text: label.text, source: study.name });
          seen.add(key);
        }
      }
    }
  }

  // Sort by price descending
  levels.sort((a, b) => b.price - a.price);

  return { success: true, level_count: levels.length, levels };
}

/**
 * Current trading session info based on UTC time.
 */
export function sessionInfo() {
  const now = new Date();
  const utcH = now.getUTCHours();
  const utcM = now.getUTCMinutes();
  const totalMin = utcH * 60 + utcM;

  // Session definitions (UTC, approximate)
  const sessions = [
    { name: 'Sydney', open: 21 * 60, close: 6 * 60, crosses_midnight: true },
    { name: 'Tokyo', open: 0, close: 9 * 60 },
    { name: 'London', open: 7 * 60, close: 16 * 60 },
    { name: 'New York', open: 12 * 60, close: 21 * 60 },
  ];

  const active = [];
  for (const s of sessions) {
    let isActive;
    if (s.crosses_midnight) {
      isActive = totalMin >= s.open || totalMin < s.close;
    } else {
      isActive = totalMin >= s.open && totalMin < s.close;
    }
    if (isActive) active.push(s.name);
  }

  // Check overlaps
  const is_london_ny = active.includes('London') && active.includes('New York');
  const is_tokyo_london = active.includes('Tokyo') && active.includes('London');

  // Time to next session opens
  function minutesUntil(targetMin) {
    let diff = targetMin - totalMin;
    if (diff <= 0) diff += 24 * 60;
    return diff;
  }

  const upcoming = {};
  if (!active.includes('London')) upcoming.london_open = `${Math.floor(minutesUntil(7 * 60) / 60)}h ${minutesUntil(7 * 60) % 60}m`;
  if (!active.includes('New York')) upcoming.ny_open = `${Math.floor(minutesUntil(12 * 60) / 60)}h ${minutesUntil(12 * 60) % 60}m`;
  if (!active.includes('Tokyo')) upcoming.tokyo_open = `${Math.floor(minutesUntil(0) / 60)}h ${minutesUntil(0) % 60}m`;

  // Day of week
  const dayOfWeek = now.getUTCDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return {
    success: true,
    utc_time: now.toISOString(),
    day_of_week: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek],
    is_weekend: isWeekend,
    active_sessions: active,
    is_london_ny_overlap: is_london_ny,
    is_tokyo_london_overlap: is_tokyo_london,
    upcoming,
  };
}

/**
 * Find levels within threshold_pct of price.
 */
export function keyLevelProximity(price, levels, threshold_pct = 0.5) {
  const threshold = price * (threshold_pct / 100);
  const nearby = levels
    .filter(l => Math.abs(l.price - price) <= threshold)
    .map(l => ({
      ...l,
      distance: Math.round((l.price - price) * 100000) / 100000,
      distance_pct: Math.round(((l.price - price) / price) * 10000) / 100,
    }))
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
  return { success: true, price, threshold_pct, nearby_count: nearby.length, levels: nearby };
}
