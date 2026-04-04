/**
 * Retry wrapper with exponential backoff + jitter.
 * Only retries transient errors (CDP disconnect, timeout, connection refused).
 */

export function isTransient(error) {
  const msg = (error?.message || '').toLowerCase();
  return /cdp|econnrefused|econnreset|timeout|disconnected|websocket|socket hang up|not open/i.test(msg);
}

export async function withRetry(fn, {
  maxRetries = 3,
  baseDelay = 500,
  maxDelay = 10000,
  shouldRetry = isTransient,
  label = '',
} = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !shouldRetry(err)) throw err;
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, jitter));
    }
  }
  throw lastError;
}
