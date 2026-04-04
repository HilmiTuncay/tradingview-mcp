/**
 * In-memory TTL cache — no external dependencies.
 * Used to reduce redundant CDP evaluate() calls for rarely-changing data.
 */

export class Cache {
  constructor(defaultTTL = 10000) {
    this._store = new Map();
    this._defaultTTL = defaultTTL;
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) { this._misses++; return undefined; }
    if (Date.now() > entry.expires) {
      this._store.delete(key);
      this._evictions++;
      this._misses++;
      return undefined;
    }
    this._hits++;
    return entry.value;
  }

  set(key, value, ttl) {
    this._store.set(key, { value, expires: Date.now() + (ttl ?? this._defaultTTL) });
  }

  invalidate(key) {
    this._store.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this._store.keys()) {
      if (key.startsWith(prefix)) {
        this._store.delete(key);
        this._evictions++;
      }
    }
  }

  clear() {
    const size = this._store.size;
    this._store.clear();
    this._evictions += size;
  }

  stats() {
    // Evict expired entries before reporting
    const now = Date.now();
    for (const [key, entry] of this._store) {
      if (now > entry.expires) { this._store.delete(key); this._evictions++; }
    }
    return {
      size: this._store.size,
      hits: this._hits,
      misses: this._misses,
      evictions: this._evictions,
      hit_rate: this._hits + this._misses > 0
        ? Math.round((this._hits / (this._hits + this._misses)) * 100) + '%'
        : '0%',
    };
  }
}

export const cache = new Cache();
