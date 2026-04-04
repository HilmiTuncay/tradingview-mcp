import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/morning.js';

export function registerMorningTools(server) {
  server.tool(
    'morning_brief',
    'Scan a watchlist of symbols, read Pine indicator labels/levels for each, ' +
    'apply bias criteria from rules.json, and return a structured session summary. ' +
    'Pass save=true to persist the result for comparison the next day. ' +
    'rules.json location: project root (watchlist, bias_criteria, risk_rules keys).',
    {
      symbols:    z.array(z.string()).optional().describe('Override watchlist (e.g. ["GBPJPY","EURUSD"]). Defaults to rules.json watchlist.'),
      timeframe:  z.string().optional().describe('Timeframe for the scan (e.g. "D", "240", "60"). Defaults to rules.json default_timeframe or "D".'),
      save:       z.boolean().optional().describe('Save result to ~/.tradingview-sessions/YYYY-MM-DD.json (default false).'),
      rules_path: z.string().optional().describe('Absolute path to rules.json (optional; defaults to project root).'),
    },
    async ({ symbols, timeframe, save, rules_path }) => {
      try { return jsonResult(await core.morningBrief({ symbols, timeframe, save: save ?? false, rules_path })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'session_save',
    'Save arbitrary data to a local session file (~/.tradingview-sessions/YYYY-MM-DD[_tag].json). ' +
    'Useful for preserving a morning brief or analysis snapshot for next-day comparison.',
    {
      data: z.record(z.unknown()).optional().describe('JSON object to persist (e.g. the morning_brief result).'),
      tag:  z.string().optional().describe('Optional tag appended to the filename (e.g. "pre-london").'),
    },
    async ({ data, tag }) => {
      try { return jsonResult(await core.sessionSave({ data, tag })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'session_get',
    'Retrieve a previously saved session file. Defaults to today; falls back to yesterday if today is missing.',
    {
      date: z.string().optional().describe('Date string YYYY-MM-DD (default: today).'),
      tag:  z.string().optional().describe('Optional tag used when saving (e.g. "pre-london").'),
    },
    async ({ date, tag }) => {
      try { return jsonResult(await core.sessionGet({ date, tag })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );
}
