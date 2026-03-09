import { modelManager } from '../services/modelManager.js';
import { isAuthEnabled, extractApiToken } from '../middleware/auth.js';

/**
 * Config endpoint - returns API configuration for client
 * This endpoint does NOT require authentication
 */

export function registerConfigRoutes(app) {
  // Get API config (for client to know the SD API endpoint)
  // This endpoint is public - no auth required
  app.get('/api/config', (req, res) => {
    const defaultModel = modelManager.getDefaultModel();
    const apiKey = process.env.API_KEY;
    const authEnabled = isAuthEnabled();
    
    // Extract API key from request (supports Bearer token, Basic auth, or X-Api-Key header)
    const providedKey = extractApiToken(req);
    const keyPassed = !!providedKey;
    const keyValid = authEnabled && keyPassed ? providedKey === apiKey : false;
    
    res.json({
      sdApiEndpoint: process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1',
      model: defaultModel?.id || 'qwen-image',
      authEnabled,
      keyPassed,
      keyValid
    });
  });
}

export default registerConfigRoutes;
