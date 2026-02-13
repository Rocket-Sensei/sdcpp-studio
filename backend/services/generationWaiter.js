/**
 * GenerationWaiter Service
 *
 * Provides an event-based promise API for waiting on generation completion.
 * Replaces polling loops with efficient event-driven notifications.
 *
 * Usage:
 *   import { generationWaiter } from './services/generationWaiter.js';
 *   try {
 *     const generation = await generationWaiter.waitForGeneration(jobId, 3600000);
 *     // Handle completion
 *   } catch (error) {
 *     // Handle timeout or failure
 *   }
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('generationWaiter');

/**
 * GenerationWaiter class - singleton service for waiting on generation completion
 */
class GenerationWaiter extends EventEmitter {
  constructor() {
    super();
    // Map of jobId -> { resolve, reject, timeout }
    this.pendingWaiters = new Map();
    // Default timeout: 1 hour (3600000ms)
    this.defaultTimeout = 3600000;
  }

  /**
   * Wait for a generation to complete, fail, or be cancelled
   * @param {string} jobId - The generation ID to wait for
   * @param {number} timeoutMs - Timeout in milliseconds (default: 1 hour)
   */
  waitForGeneration(jobId, timeoutMs = this.defaultTimeout) {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingWaiters.delete(jobId);
        reject(new Error(`Generation timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      // Store the promise callbacks
      this.pendingWaiters.set(jobId, { resolve, reject, timeout });

      // Clean up on promise cancellation (if caller aborts)
      const cleanup = () => {
        clearTimeout(timeout);
        this.pendingWaiters.delete(jobId);
      };

      // Attach cleanup to the promise for potential cancellation
      resolve.cleanup = cleanup;
    });
  }

  /**
   * Notify waiters that a generation has completed
   * @param {string} jobId - The generation ID
   * @param {Object} generation - The generation data
   */
  notifyCompleted(jobId, generation) {
    this.emit('completed', jobId, generation);
    this.resolveWaiter(jobId, generation);
  }

  /**
   * Notify waiters that a generation has failed
   * @param {string} jobId - The generation ID
   * @param {Object} generation - The generation data (may include error info)
   */
  notifyFailed(jobId, generation) {
    this.emit('failed', jobId, generation);
    this.rejectWaiter(jobId, new Error(generation.error || 'Generation failed'));
  }

  /**
   * Notify waiters that a generation has been cancelled
   * @param {string} jobId - The generation ID
   * @param {Object} generation - The generation data
   */
  notifyCancelled(jobId, generation) {
    this.emit('cancelled', jobId, generation);
    this.rejectWaiter(jobId, new Error('Generation cancelled'));
  }

  /**
   * Resolve a pending waiter with the generation data
   * @param {string} jobId - The generation ID
   * @param {Object} generation - The generation data
   */
  resolveWaiter(jobId, generation) {
    const waiter = this.pendingWaiters.get(jobId);
    if (waiter) {
      clearTimeout(waiter.timeout);
      this.pendingWaiters.delete(jobId);
      waiter.resolve(generation);
    }
  }

  /**
   * Reject a pending waiter with an error
   * @param {string} jobId - The generation ID
   * @param {Error} error - The error to reject with
   */
  rejectWaiter(jobId, error) {
    const waiter = this.pendingWaiters.get(jobId);
    if (waiter) {
      clearTimeout(waiter.timeout);
      this.pendingWaiters.delete(jobId);
      waiter.reject(error);
    }
  }

  /**
   * Cancel all pending waiters (useful for shutdown)
   */
  cancelAll() {
    for (const [jobId, waiter] of this.pendingWaiters) {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Waiter cancelled'));
    }
    this.pendingWaiters.clear();
  }

  /**
   * Get the number of pending waiters
   * @returns {number}
   */
  getPendingCount() {
    return this.pendingWaiters.size;
  }
}

// Singleton instance
export const generationWaiter = new GenerationWaiter();

// Handle shutdown gracefully
process.on('beforeExit', () => {
  generationWaiter.cancelAll();
});

process.on('SIGINT', () => {
  generationWaiter.cancelAll();
});

process.on('SIGTERM', () => {
  generationWaiter.cancelAll();
});

export default generationWaiter;
