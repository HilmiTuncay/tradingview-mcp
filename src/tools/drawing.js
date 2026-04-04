import { z } from 'zod';
import { jsonResult } from './_format.js';
import * as core from '../core/drawing.js';


export function registerDrawingTools(server) {
  server.tool('draw_shape', 'Draw a shape/line on the chart', {
    shape: z.string().describe('Shape type: horizontal_line, vertical_line, trend_line, rectangle, text'),
    point: z.object({ time: z.coerce.number(), price: z.coerce.number() }).describe('{ time: unix_timestamp, price: number }'),
    point2: z.object({ time: z.coerce.number(), price: z.coerce.number() }).optional().describe('Second point for two-point shapes (trend_line, rectangle)'),
    overrides: z.string().optional().describe('JSON string of style overrides (e.g., \'{"linecolor": "#ff0000", "linewidth": 2}\')'),
    text: z.string().optional().describe('Text content for text shapes'),
  }, async ({ shape, point, point2, overrides, text }) => {
    try { return jsonResult(await core.drawShape({ shape, point, point2, overrides, text })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_list', 'List all shapes/drawings on the chart', {}, async () => {
    try { return jsonResult(await core.listDrawings()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_clear', 'Remove all drawings from the chart', {}, async () => {
    try { return jsonResult(await core.clearAll()); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_remove_one', 'Remove a specific drawing by entity ID', {
    entity_id: z.string().describe('Entity ID of the drawing to remove (from draw_list)'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.removeOne({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool('draw_get_properties', 'Get properties and points of a specific drawing', {
    entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
  }, async ({ entity_id }) => {
    try { return jsonResult(await core.getProperties({ entity_id })); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });

  server.tool(
    'draw_get_screen_coords',
    'Get the CSS pixel coordinates of a long_position / short_position drawing body on screen. ' +
    'Uses TradingView internal price→coordinate API. Returns body_center_x, css_y_entry, canvas bounds, entry_price.',
    {
      entity_id: z.string().describe('Entity ID of the drawing (from draw_list)'),
    },
    async ({ entity_id }) => {
      try { return jsonResult(await core.getScreenCoords({ entity_id })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'draw_context_menu',
    'Right-click on a long_position / short_position drawing to open the context menu. ' +
    'Scrolls chart to show the drawing, computes coordinates internally, fires CDP right-click, ' +
    'then returns the list of menu items found in the DOM. ' +
    'Follow with draw_click_menu_item to select an item (e.g. "Limit Emir Oluştur").',
    {
      entity_id: z.string().describe('Entity ID of the long_position or short_position drawing'),
    },
    async ({ entity_id }) => {
      try { return jsonResult(await core.openContextMenu({ entity_id })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );

  server.tool(
    'draw_click_menu_item',
    'Click a context menu item by text (partial match, case-insensitive). ' +
    'Must be called after draw_context_menu has opened the menu. ' +
    'Example: draw_click_menu_item("Limit Emir Oluştur") to create a broker limit order.',
    {
      text: z.string().describe('Full or partial text of the menu item to click (e.g. "Limit Emir Oluştur")'),
    },
    async ({ text }) => {
      try { return jsonResult(await core.clickMenuItem({ text })); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    }
  );
}
