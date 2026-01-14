/**
 * Health check endpoint
 */

export function registerHealthRoutes(app) {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });
}

export default registerHealthRoutes;
