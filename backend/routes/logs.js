import { getGenerationLogs } from '../utils/logger.js';
import { createLogger } from '../utils/logger.js';
import { authenticateRequest } from '../middleware/auth.js';

const logger = createLogger('routes:logs');

/**
 * Log retrieval routes
 */

export function registerLogRoutes(app) {
  // Get logs for a specific generation
  app.get('/api/generations/:id/logs', authenticateRequest, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      const logs = await getGenerationLogs(req.params.id, limit);
      res.json(logs);
    } catch (error) {
      logger.error({ error, generationId: req.params.id }, 'Error fetching generation logs');
      res.status(500).json({ error: error.message });
    }
  });

  // Get all logs (no generation filter)
  app.get('/api/logs', authenticateRequest, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 100;
      // Pass undefined as generationId to get all logs
      const logs = await getGenerationLogs(undefined, limit);
      res.json(logs);
    } catch (error) {
      logger.error({ error }, 'Error fetching logs');
      res.status(500).json({ error: error.message });
    }
  });
}

export default registerLogRoutes;
