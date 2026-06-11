const logger = require('../utils/logger.util');

const PQueue = require('p-queue').default;

class QueueService {
  constructor() {
    this.queue = new PQueue({
      concurrency: 10,        // 10 request bersamaan
      timeout: 30000,         // 30 detik timeout per task
      throwOnTimeout: true
    });
    
    this.stats = {
      totalProcessed: 0,
      totalFailed: 0,
      active: 0
    };
  }

  async add(task, metadata = {}) {
    const taskId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info(`[QUEUE] Adding task ${taskId} for user ${metadata.userId}`);
    
    // Update stats
    this.stats.active = this.queue.pending + this.queue.size;
    
    return this.queue.add(async () => {
      const startTime = Date.now();
      
      try {
        logger.info(`[QUEUE] Processing task ${taskId} (Active: ${this.stats.active})`);
        const result = await task();
        
        this.stats.totalProcessed++;
        logger.info(`[QUEUE] Task ${taskId} completed in ${Date.now() - startTime}ms`);
        
        return result;
      } catch (error) {
        this.stats.totalFailed++;
        logger.error(`[QUEUE] Task ${taskId} failed: ${error.message}`);
        throw error;
      } finally {
        this.stats.active = this.queue.pending + this.queue.size;
      }
    });
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.queue.size,
      concurrency: this.queue.concurrency
    };
  }

  async onIdle() {
    await this.queue.onIdle();
  }

  clear() {
    this.queue.clear();
    logger.warn('[QUEUE] Queue cleared');
  }
}

// Singleton instance
module.exports = new QueueService();