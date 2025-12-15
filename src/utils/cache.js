const logger = require('./logger');

class CacheManager {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = (process.env.CACHE_DURATION_MINUTES || 30) * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Set a value in cache with timestamp
   */
  set(key, value) {
    const cacheEntry = {
      data: value,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.cacheDuration
    };
    
    this.cache.set(key, cacheEntry);
    logger.info(`Cache set for key: ${key}, expires in ${this.cacheDuration / 60000} minutes`);
  }

  /**
   * Get a value from cache if it's still valid
   */
  get(key) {
    const cacheEntry = this.cache.get(key);
    
    if (!cacheEntry) {
      logger.debug(`Cache miss for key: ${key}`);
      return null;
    }

    const now = Date.now();
    
    if (now > cacheEntry.expiresAt) {
      logger.info(`Cache expired for key: ${key}`);
      this.cache.delete(key);
      return null;
    }

    const ageMinutes = Math.floor((now - cacheEntry.timestamp) / 60000);
    logger.debug(`Cache hit for key: ${key}, age: ${ageMinutes} minutes`);
    
    return {
      data: cacheEntry.data,
      age: now - cacheEntry.timestamp,
      cachedAt: new Date(cacheEntry.timestamp).toISOString()
    };
  }

  /**
   * Clear a specific cache entry
   */
  clear(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.info(`Cache cleared for key: ${key}`);
    }
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  clearAll() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`All cache cleared (${size} entries)`);
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: Math.floor((Date.now() - entry.timestamp) / 60000),
      expiresIn: Math.floor((entry.expiresAt - Date.now()) / 60000)
    }));

    return {
      totalEntries: this.cache.size,
      cacheDurationMinutes: this.cacheDuration / 60000,
      entries
    };
  }
}

// Singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
