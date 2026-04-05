/**
 * MCP tools for broker order automation — consolidated trade actions.
 * Reduces 4-6 tool calls to 1-2 for opening trades.
 */
import { z } from 'zod';
import { wrapTool } from './_format.js';
import * as broker from '../core/broker.js';

export function registerBrokerTools(server) {
  server.tool(
    'trade_list_positions',
    'List all long_position / short_position drawings on the chart with their trade details ' +
    '(entry price, SL, TP, direction). Combines draw_list + draw_get_properties in one call.',
    {},
    wrapTool(async () => {
      return await broker.listPositionDrawings();
    }, 'trade_list_positions')
  );

  server.tool(
    'trade_open_limit',
    'ONE-SHOT: Open a limit order from a position drawing. ' +
    'Scrolls to drawing → right-clicks → clicks "Limit Emir Oluştur" → order panel opens. ' +
    'Combines draw_context_menu + draw_click_menu_item in a single call. ' +
    'After this, verify quantity and call trade_submit to send the order.',
    {
      entity_id: z.string().describe('Entity ID of the long_position or short_position drawing (from trade_list_positions)'),
      menu_text: z.string().optional().describe('Menu item text to click (default: "Limit Emir Oluştur")'),
    },
    wrapTool(async (params) => {
      return await broker.openLimitOrder(params);
    }, 'trade_open_limit')
  );

  server.tool(
    'trade_submit',
    'Click the order submit button on the Pepperstone order panel. ' +
    'Call after trade_open_limit and verifying the order details.',
    {},
    wrapTool(async () => {
      return await broker.submitOrder();
    }, 'trade_submit')
  );

  server.tool(
    'trade_dismiss',
    'Dismiss any confirmation dialog after order submission (OK/Tamam/Close).',
    {},
    wrapTool(async () => {
      return await broker.dismissConfirmation();
    }, 'trade_dismiss')
  );
}
