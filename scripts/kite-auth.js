#!/usr/bin/env node
/**
 * Daily Zerodha token refresh.
 * Run once each morning: node scripts/kite-auth.js
 *
 * Flow:
 *   1. Opens the Kite login URL in your browser
 *   2. Starts a local server on port 5000 to catch the redirect
 *   3. Extracts request_token automatically
 *   4. Exchanges it for an access_token and saves to .env
 */
import { createServer } from 'http';
import { exec } from 'child_process';
import { generateSession, getLoginUrl } from '../src/core/kite.js';

const PORT = 5000;

const { url } = getLoginUrl();

console.log('\n=== Zerodha Daily Token Refresh ===\n');
console.log('Opening Kite login in your browser...');
console.log(`Login URL: ${url}\n`);

// Open browser
exec(`start "" "${url}"`);

console.log(`Waiting for redirect on http://127.0.0.1:${PORT} ...`);
console.log('(Make sure your Kite Connect app redirect URL is set to http://127.0.0.1:5000/)\n');

const server = createServer(async (req, res) => {
  const fullUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const request_token = fullUrl.searchParams.get('request_token');
  const status = fullUrl.searchParams.get('status');

  if (!request_token || status !== 'success') {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing request_token or login failed. Try again.');
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h2>Login successful! You can close this tab.</h2><p>Access token has been saved.</p>');

  server.close();

  try {
    const result = await generateSession(request_token);
    console.log('✅ Access token saved!\n');
    console.log(`   User    : ${result.user_name} (${result.user_id})`);
    console.log(`   Email   : ${result.email}`);
    console.log(`   Token   : ${result.access_token.slice(0, 8)}...`);
    console.log('\nReady to trade. Token is valid until midnight today.\n');
  } catch (err) {
    console.error('❌ Failed to generate session:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is in use. Close the other process and retry.`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});
