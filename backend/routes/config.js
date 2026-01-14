import { modelManager } from '../services/modelManager.js';
import { isAuthEnabled } from '../middleware/auth.js';

/**
 * Config endpoint - returns API configuration for client
 */

export function registerConfigRoutes(app) {
  // Get API config (for client to know the SD API endpoint)
  app.get('/api/config', (req, res) => {
    const defaultModel = modelManager.getDefaultModel();
    res.json({
      sdApiEndpoint: process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1',
      model: defaultModel?.id || 'qwen-image',
      authRequired: isAuthEnabled()
    });
  });
}

export default registerConfigRoutes;
