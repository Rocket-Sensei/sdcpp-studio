/**
 * Samplers Controller
 *
 * Handles endpoints for listing available samplers and schedulers.
 * SD.next / Automatic1111 compatible API.
 */

import { SD_SAMPLERS } from '../../utils/modelHelpers.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('controllers:samplers');

/**
 * Register sampler and scheduler routes
 * @param {import('express').Express} app - Express app instance
 * @param {Function} authenticateRequest - Authentication middleware
 */
export function registerSamplerRoutes(app, authenticateRequest) {
  /**
   * GET /sdapi/v1/samplers
   * List available samplers (authenticated)
   */
  app.get('/sdapi/v1/samplers', authenticateRequest, (req, res) => {
    try {
      res.json(SD_SAMPLERS);
    } catch (error) {
      logger.error({ error }, 'Error fetching samplers');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /sdapi/v1/schedulers
   * List available schedulers (same as samplers for SD.cpp) (authenticated)
   */
  app.get('/sdapi/v1/schedulers', authenticateRequest, (req, res) => {
    try {
      res.json(SD_SAMPLERS);
    } catch (error) {
      logger.error({ error }, 'Error fetching schedulers');
      res.status(500).json({ error: error.message });
    }
  });
}
