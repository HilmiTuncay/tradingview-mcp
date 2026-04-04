/**
 * Serial request queue for CDP evaluations.
 * Prevents race conditions when multiple tools call evaluate() concurrently.
 * Supports priority levels: high > normal > low.
 */

const PRIORITY = { high: 0, normal: 1, low: 2 };

export class RequestQueue {
  constructor({ timeout = 30000 } = {}) {
    this._queues = [[], [], []]; // high, normal, low
    this._active = false;
    this._timeout = timeout;
    this._stats = { completed: 0, failed: 0, totalDuration: 0 };
  }

  enqueue(fn, { priority = 'normal', label = '' } = {}) {
    const p = PRIORITY[priority] ?? PRIORITY.normal;
    return new Promise((resolve, reject) => {
      this._queues[p].push({ fn, resolve, reject, label, enqueued: Date.now() });
      this._drain();
    });
  }

  async _drain() {
    if (this._active) return;
    const item = this._next();
    if (!item) return;

    this._active = true;
    const start = Date.now();

    try {
      const result = await Promise.race([
        item.fn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Queue timeout (${this._timeout}ms): ${item.label}`)), this._timeout)
        ),
      ]);
      this._stats.completed++;
      this._stats.totalDuration += Date.now() - start;
      item.resolve(result);
    } catch (err) {
      this._stats.failed++;
      this._stats.totalDuration += Date.now() - start;
      item.reject(err);
    } finally {
      this._active = false;
      // Process next item
      if (this._next(true)) this._drain();
    }
  }

  _next(peek = false) {
    for (const q of this._queues) {
      if (q.length > 0) return peek ? q[0] : q.shift();
    }
    return null;
  }

  get pending() {
    return this._queues.reduce((sum, q) => sum + q.length, 0);
  }

  stats() {
    const total = this._stats.completed + this._stats.failed;
    return {
      pending: this.pending,
      active: this._active,
      completed: this._stats.completed,
      failed: this._stats.failed,
      avg_duration_ms: total > 0 ? Math.round(this._stats.totalDuration / total) : 0,
    };
  }
}

export const queue = new RequestQueue();
