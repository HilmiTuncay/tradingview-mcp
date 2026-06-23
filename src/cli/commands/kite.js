import { register } from '../router.js';
import * as kite from '../../core/kite.js';

register('kite-login', {
  description: 'Get Zerodha login URL (open in browser to start daily auth)',
  handler: () => kite.getLoginUrl()
});

register('kite-auth', {
  description: 'Exchange request_token for access_token after Kite login',
  options: {
    token: { type: 'string', short: 't', description: 'request_token from redirect URL' }
  },
  handler: (opts) => {
    if (!opts.token) throw new Error('Provide --token <request_token> from the redirect URL');
    return kite.generateSession(opts.token);
  }
});

register('kite-profile', {
  description: 'Get Zerodha account profile and connection status',
  handler: () => kite.getProfile()
});

register('kite-margins', {
  description: 'Get available margin / balance',
  handler: () => kite.getMargins()
});

register('kite-positions', {
  description: 'Get current open positions',
  handler: () => kite.getPositions()
});

register('kite-holdings', {
  description: 'Get equity holdings',
  handler: () => kite.getHoldings()
});

register('kite-orders', {
  description: 'List today\'s orders',
  handler: () => kite.getOrders()
});

register('kite-place', {
  description: 'Place an order (shows preview — requires --confirm to execute)',
  options: {
    symbol:   { type: 'string', short: 's', description: 'Trading symbol e.g. NIFTY24JANFUT' },
    exchange: { type: 'string', short: 'e', description: 'Exchange: NSE, BSE, NFO, MCX' },
    side:     { type: 'string', description: 'BUY or SELL' },
    qty:      { type: 'string', short: 'q', description: 'Quantity / lots' },
    type:     { type: 'string', description: 'MARKET, LIMIT, SL, SL-M (default LIMIT)' },
    price:    { type: 'string', short: 'p', description: 'Limit price' },
    sl:       { type: 'string', description: 'Stop loss trigger price' },
    product:  { type: 'string', description: 'MIS (intraday) | NRML (F&O overnight) | CNC (delivery)' },
    confirm:  { type: 'boolean', description: 'Actually place the order (without this flag, only preview is shown)' }
  },
  handler: (opts) => kite.placeOrder({
    symbol:           opts.symbol,
    exchange:         opts.exchange || 'NSE',
    transaction_type: (opts.side || '').toUpperCase(),
    quantity:         Number(opts.qty),
    order_type:       (opts.type || 'LIMIT').toUpperCase(),
    price:            opts.price ? Number(opts.price) : undefined,
    trigger_price:    opts.sl ? Number(opts.sl) : undefined,
    product:          (opts.product || 'MIS').toUpperCase(),
    confirmed:        !!opts.confirm
  })
});

register('kite-cancel', {
  description: 'Cancel an order by order ID',
  options: {
    id: { type: 'string', description: 'Order ID to cancel' }
  },
  handler: (opts) => {
    if (!opts.id) throw new Error('Provide --id <order_id>');
    return kite.cancelOrder(opts.id);
  }
});
