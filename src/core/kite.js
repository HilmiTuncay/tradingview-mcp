/**
 * Zerodha Kite Connect integration.
 * Reads credentials from .env — never hardcoded.
 */
import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const ENV_PATH = join(ROOT, '.env');
const BASE_URL = 'https://api.kite.trade';

function loadEnv() {
  try {
    const raw = readFileSync(ENV_PATH, 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && k.trim()) env[k.trim()] = v.join('=').trim();
    }
    return env;
  } catch {
    return {};
  }
}

function saveAccessToken(token) {
  const raw = readFileSync(ENV_PATH, 'utf8');
  const updated = raw.replace(/^KITE_ACCESS_TOKEN=.*/m, `KITE_ACCESS_TOKEN=${token}`);
  writeFileSync(ENV_PATH, updated, 'utf8');
}

function getCredentials() {
  const env = loadEnv();
  const api_key = env.KITE_API_KEY;
  const api_secret = env.KITE_API_SECRET;
  const access_token = env.KITE_ACCESS_TOKEN;
  if (!api_key) throw new Error('KITE_API_KEY missing from .env');
  return { api_key, api_secret, access_token };
}

async function kiteRequest(method, path, body = null, requiresAuth = true) {
  const { api_key, access_token } = getCredentials();

  const headers = { 'X-Kite-Version': '3' };
  if (requiresAuth) {
    if (!access_token) throw new Error('No access token — run: node scripts/kite-auth.js');
    headers['Authorization'] = `token ${api_key}:${access_token}`;
  }

  const opts = { method, headers };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body).toString();
  }

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const json = await res.json();

  if (json.status === 'error') {
    throw new Error(`Kite API error: ${json.message} (${json.error_type})`);
  }
  return json.data !== undefined ? json.data : json;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function getLoginUrl() {
  const { api_key } = getCredentials();
  return {
    url: `https://kite.trade/connect/login?api_key=${api_key}&v=3`,
    instructions: 'Open this URL in your browser, log in with Zerodha, then paste the request_token from the redirect URL.'
  };
}

export async function generateSession(request_token) {
  const { api_key, api_secret } = getCredentials();
  if (!api_secret) throw new Error('KITE_API_SECRET missing from .env');

  const checksum = createHash('sha256')
    .update(api_key + request_token + api_secret)
    .digest('hex');

  const data = await kiteRequest('POST', '/session/token', {
    api_key,
    request_token,
    checksum
  }, false);

  saveAccessToken(data.access_token);

  return {
    success: true,
    access_token: data.access_token,
    user_name: data.user_name,
    user_id: data.user_id,
    email: data.email,
    message: 'Access token saved to .env — valid for today.'
  };
}

// ── Account ───────────────────────────────────────────────────────────────────

export async function getProfile() {
  const data = await kiteRequest('GET', '/user/profile');
  return {
    success: true,
    user_id: data.user_id,
    user_name: data.user_name,
    email: data.email,
    broker: data.broker,
    exchanges: data.exchanges,
    products: data.products,
    order_types: data.order_types
  };
}

export async function getMargins() {
  const data = await kiteRequest('GET', '/user/margins');
  const eq = data.equity || {};
  const com = data.commodity || {};
  return {
    success: true,
    equity: {
      available: eq.available?.live_balance,
      used: eq.utilised?.debits,
      net: eq.net
    },
    commodity: {
      available: com.available?.live_balance,
      net: com.net
    }
  };
}

// ── Portfolio ─────────────────────────────────────────────────────────────────

export async function getPositions() {
  const data = await kiteRequest('GET', '/portfolio/positions');
  const all = [...(data.net || []), ...(data.day || [])];
  const unique = Object.values(
    Object.fromEntries(all.map(p => [p.tradingsymbol, p]))
  );
  return {
    success: true,
    count: unique.length,
    positions: unique.map(p => ({
      symbol: p.tradingsymbol,
      exchange: p.exchange,
      product: p.product,
      quantity: p.quantity,
      average_price: p.average_price,
      last_price: p.last_price,
      pnl: p.pnl,
      unrealised: p.unrealised
    }))
  };
}

export async function getHoldings() {
  const data = await kiteRequest('GET', '/portfolio/holdings');
  return {
    success: true,
    count: data.length,
    holdings: data.map(h => ({
      symbol: h.tradingsymbol,
      exchange: h.exchange,
      quantity: h.quantity,
      average_price: h.average_price,
      last_price: h.last_price,
      pnl: h.pnl,
      day_change_pct: h.day_change_percentage
    }))
  };
}

// ── Orders ────────────────────────────────────────────────────────────────────

export async function getOrders() {
  const data = await kiteRequest('GET', '/orders');
  return {
    success: true,
    count: data.length,
    orders: data.map(o => ({
      order_id: o.order_id,
      symbol: o.tradingsymbol,
      exchange: o.exchange,
      transaction_type: o.transaction_type,
      order_type: o.order_type,
      quantity: o.quantity,
      price: o.price,
      status: o.status,
      filled_quantity: o.filled_quantity
    }))
  };
}

/**
 * Place an order. Always shows a preview — caller must pass confirmed:true to actually place.
 */
export async function placeOrder({
  symbol,
  exchange,
  transaction_type,
  quantity,
  order_type = 'LIMIT',
  price,
  trigger_price,
  product = 'MIS',
  variety = 'regular',
  validity = 'DAY',
  confirmed = false
}) {
  // Build preview regardless
  const preview = {
    symbol,
    exchange,
    transaction_type,
    quantity,
    order_type,
    price: price || null,
    trigger_price: trigger_price || null,
    product,
    variety,
    validity
  };

  if (!confirmed) {
    return {
      success: false,
      confirmed: false,
      preview,
      message: 'Order NOT placed. Review the details above and say "confirm order" to proceed.'
    };
  }

  const body = {
    tradingsymbol: symbol,
    exchange,
    transaction_type,
    quantity,
    order_type,
    product,
    validity
  };
  if (price) body.price = price;
  if (trigger_price) body.trigger_price = trigger_price;

  const data = await kiteRequest('POST', `/orders/${variety}`, body);

  return {
    success: true,
    confirmed: true,
    order_id: data.order_id,
    preview
  };
}

export async function cancelOrder(order_id, variety = 'regular') {
  const data = await kiteRequest('DELETE', `/orders/${variety}/${order_id}`);
  return { success: true, order_id: data.order_id };
}
