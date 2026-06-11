const logger = require('../utils/logger.util');

class RateLimitService {
  constructor() {
    // Format: Map { userId: { count, resetTime, timestamps } }
    this.limits = new Map();
    this.maxRequests = 5;      // 5 sticker per menit
    this.windowMs = 60000;      // 1 menit
  }

  /**
   * Check if user is rate limited
   * @param {string} userId - WhatsApp number (from msg.from)
   * @returns {Object} { allowed, remaining, resetTime }
   */
  check(userId) {
    const now = Date.now();
    const record = this.limits.get(userId);
    
    // No record yet
    if (!record) {
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }
    
    // Check if window has expired
    if (now > record.resetTime) {
      // Reset window
      this.limits.set(userId, {
        count: 1,
        resetTime: now + this.windowMs,
        timestamps: [now]
      });
      
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetTime: now + this.windowMs
      };
    }
    
    // Within window, check count
    if (record.count >= this.maxRequests) {
      const resetInSeconds = Math.ceil((record.resetTime - now) / 1000);
      
      logger.warn(`[RATE_LIMIT] User ${userId} exceeded limit. Reset in ${resetInSeconds}s`);
      
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.resetTime,
        resetInSeconds
      };
    }
    
    // Increment count
    record.count++;
    record.timestamps.push(now);
    this.limits.set(userId, record);
    
    return {
      allowed: true,
      remaining: this.maxRequests - record.count,
      resetTime: record.resetTime
    };
  }
  
  /**
   * Get current rate limit status for user
   */
  getStatus(userId) {
    const record = this.limits.get(userId);
    const now = Date.now();
    
    if (!record || now > record.resetTime) {
      return {
        remaining: this.maxRequests,
        resetInSeconds: 0,
        totalUsed: 0
      };
    }
    
    const resetInSeconds = Math.ceil((record.resetTime - now) / 1000);
    
    return {
      remaining: Math.max(0, this.maxRequests - record.count),
      resetInSeconds,
      totalUsed: record.count
    };
  }
  
  /**
   * Clean up old records (optional, run periodically)
   */
  cleanup() {
    const now = Date.now();
    for (const [userId, record] of this.limits.entries()) {
      if (now > record.resetTime) {
        this.limits.delete(userId);
      }
    }
  }
}

// Singleton instance
module.exports = new RateLimitService();