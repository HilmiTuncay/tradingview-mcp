/**
 * Morning brief & session persistence.
 * Scans a watchlist of symbols, reads chart state + indicator values + Pine levels,
 * applies rules.json criteria, and optionally saves the result to a local session file.
 *
 * Inspired by LewisWJackson/tradingview-mcp-jackson.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { evaluate, getChartApi } from '../connection.js';

const CHART_API = 'window.TradingViewApi._activeChartWidgetWV.value()';

// ── Session storage ──────────────────────────────────────────────────────────

function sessionDir() {
  const dir = path.join(os.homedir(), '.tradingview-sessions');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function sessionFilePath(date) {
  return path.join(sessionDir(), `${date}.json`);
}

// ── Rules loading ────────────────────────────────────────────────────────────

function loadRules(rulesPath) {
  const candidates = [
    rulesPath,
    path.join(process.cwd(), 'rules.json'),
    path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'rules.json'),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch {}
  }
  return null;
}

// ── Chart helpers (inline to avoid circular imports) ────────────────────────

async function switchSymbol(symbol) {
  await evaluate(`
    (function() {
      var chart = ${CHART_API};
      chart.setSymbol('${symbol.replace(/'/g, "\\'")}', {});
    })()
  `);
  await new Promise(r => setTimeout(r, 1200));
}

async function getStudyValues() {
  return evaluate(`
    (function() {
      var chart = ${CHART_API};
      var studies = chart.getAllStudies();
      var out = {};
      studies.forEach(function(s) {
        try {
          var vals = chart.getStudyInputsInfo && chart.getStudyInputsInfo(s.id);
          out[s.name] = vals || null;
        } catch(e) {}
      });
      return out;
    })()
  `);
}

async function getQuote(symbol) {
  return evaluate(`
    (function() {
      var chart = ${CHART_API};
      try {
        return {
          symbol: chart.symbol(),
          last:   chart.crossHairPosition && chart.crossHairPosition() || null,
        };
      } catch(e) { return { symbol: ${JSON.stringify(symbol)} }; }
    })()
  `);
}

async function getPineLabels() {
  return evaluate(`
    (function() {
      try {
        var chart = ${CHART_API};
        var studies = chart.getAllStudies();
        var labels = [];
        studies.forEach(function(s) {
          try {
            var study = chart.getStudyById(s.id);
            if (!study) return;
            var graphics = study._graphics && study._graphics._primitivesCollection;
            if (!graphics) return;
            var lblMap = graphics.dwglabels && graphics.dwglabels.get('labels');
            if (!lblMap) return;
            var visible = lblMap.get(false);
            if (!visible) return;
            visible._primitivesDataById && visible._primitivesDataById.forEach(function(lbl) {
              if (lbl && lbl.text) labels.push({ study: s.name, text: lbl.text, price: lbl.price || null });
            });
          } catch(e) {}
        });
        return labels;
      } catch(e) { return []; }
    })()
  `);
}

// ── Core: morning brief ──────────────────────────────────────────────────────

export async function morningBrief({ symbols, timeframe, save, rules_path }) {
  const rules = loadRules(rules_path);
  const watchlist = symbols
    || (rules && rules.watchlist)
    || ['GBPJPY', 'EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD'];
  const tf = timeframe || (rules && rules.default_timeframe) || 'D';

  const results = [];
  let originalSymbol = null;

  try {
    // Capture original symbol
    originalSymbol = await evaluate(`${CHART_API}.symbol()`);

    for (const sym of watchlist) {
      const entry = { symbol: sym, timeframe: tf, timestamp: new Date().toISOString() };

      try {
        await switchSymbol(sym);

        // Switch timeframe if provided
        if (tf) {
          await evaluate(`
            (function() {
              var chart = ${CHART_API};
              chart.setResolution('${tf}', {});
            })()
          `);
          await new Promise(r => setTimeout(r, 800));
        }

        // Current price
        entry.price = await evaluate(`
          (function() {
            var chart = ${CHART_API};
            try {
              var series = chart._chartWidget.model().mainSeries();
              var last = series.bars().lastBar();
              if (last) return { close: last.value[4], high: last.value[2], low: last.value[3] };
            } catch(e) {}
            return null;
          })()
        `);

        // Pine labels (key levels, bias text from custom indicators)
        entry.pine_labels = await getPineLabels();

        // Apply bias rules from rules.json
        if (rules && rules.bias_criteria) {
          const biasText = (entry.pine_labels || []).map(l => l.text.toLowerCase()).join(' ');
          let bias = 'neutral';
          const bull = (rules.bias_criteria.bullish || []).some(k => biasText.includes(k.toLowerCase()));
          const bear = (rules.bias_criteria.bearish || []).some(k => biasText.includes(k.toLowerCase()));
          if (bull && !bear) bias = 'bullish';
          else if (bear && !bull) bias = 'bearish';
          else if (bull && bear) bias = 'mixed';
          entry.bias = bias;
        }

        entry.success = true;
      } catch (e) {
        entry.success = false;
        entry.error = e.message;
      }

      results.push(entry);
    }
  } finally {
    // Restore original symbol
    if (originalSymbol) {
      try { await switchSymbol(originalSymbol); } catch {}
    }
  }

  const brief = {
    date: todayStr(),
    generated_at: new Date().toISOString(),
    watchlist,
    timeframe: tf,
    results,
    risk_rules: (rules && rules.risk_rules) || [],
  };

  if (save) {
    await sessionSave({ data: brief });
  }

  return { success: true, brief };
}

// ── Core: session save ───────────────────────────────────────────────────────

export async function sessionSave({ data, tag }) {
  const date = todayStr();
  const key = tag ? `${date}_${tag}` : date;
  const filePath = sessionFilePath(key);
  const payload = data || {};
  fs.writeFileSync(filePath, JSON.stringify({ ...payload, saved_at: new Date().toISOString() }, null, 2));
  return { success: true, saved_to: filePath, key };
}

// ── Core: session get ────────────────────────────────────────────────────────

export async function sessionGet({ date, tag }) {
  const target = date || todayStr();
  const key = tag ? `${target}_${tag}` : target;
  const filePath = sessionFilePath(key);

  if (!fs.existsSync(filePath)) {
    // Try yesterday
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const altKey = tag ? `${yesterday}_${tag}` : yesterday;
    const altPath = sessionFilePath(altKey);
    if (fs.existsSync(altPath)) {
      const data = JSON.parse(fs.readFileSync(altPath, 'utf8'));
      return { success: true, found: true, date: altKey, data, note: 'Using yesterday\'s session (today not found)' };
    }
    return { success: true, found: false, date: target, data: null };
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return { success: true, found: true, date: key, data };
}
