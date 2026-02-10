/**
 * Progress Controller
 *
 * Handles endpoints for generation progress and interruption.
 * SD.next / Automatic1111 compatible API.
 */

import { modelManager } from '../../services/modelManager.js';
import {
  getAllGenerations,
  getGenerationStats,
  cancelGeneration
} from '../../db/queries.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('controllers:progress');

/**
 * Register progress-related routes
 * @param {import('express').Express} app - Express app instance
 * @param {Function} authenticateRequest - Authentication middleware
 */
export function registerProgressRoutes(app, authenticateRequest) {
  /**
   * GET /sdapi/v1/progress
   * Get generation progress (authenticated)
   */
  app.get('/sdapi/v1/progress', authenticateRequest, (req, res) => {
    try {
      const stats = getGenerationStats();
      const jobs = getAllGenerations();
      const processingJob = jobs.find(j => j.status === 'processing');

      let progress = 0;
      let state = { job_count: 0 };

      // Check if any model is currently starting (model loading in progress)
      const allModels = modelManager.getAllModels();
      const startingModel = allModels.find(m => m.status === 'starting');

      if (startingModel) {
        // Model is loading - return non-zero progress for SillyTavern compatibility
        // SillyTavern polls until progress === 0 AND job_count === 0
        progress = 0.25;  // Arbitrary non-zero value to indicate loading in progress
        state = {
          job_count: 1,  // Non-zero to indicate work in progress
          job_no: 0
        };
      } else if (processingJob) {
        // Image generation in progress
        progress = processingJob.progress || 0.5;
        state = {
          job_count: stats.pending || 0,
          job_no: stats.processing || 0
        };
      }

      res.json({
        progress: progress,
        eta_relative: null,
        state: state,
        current_image: null,
        textinfo: null
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching progress');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /sdapi/v1/interrupt
   * Interrupt current generation
   */
  app.post('/sdapi/v1/interrupt', authenticateRequest, (req, res) => {
    try {
      const jobs = getAllGenerations();
      const processingJob = jobs.find(j => j.status === 'processing');
      if (processingJob) {
        cancelGeneration(processingJob.id);
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ error }, 'Error interrupting');
      res.status(500).json({ error: error.message });
    }
  });
}
