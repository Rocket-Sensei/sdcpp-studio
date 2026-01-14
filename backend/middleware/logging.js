import { logApiRequest } from '../utils/logger.js';

/**
 * Request logging middleware (for API routes only)
 * Skips logging for static files, images, and health checks
 */
export function requestLogging(req, res, next) {
  // Skip logging for:
  // 1. Static file routes (/static/*)
  // 2. Image serving endpoints (/api/images/*, /api/generations/*/image)
  // 3. Health checks
  const skipLogging =
    req.path.startsWith('/static') ||
    req.path.startsWith('/api/images/') ||
    req.path.match(/^\/api\/generations\/[^/]+\/image$/) ||
    req.path === '/api/health';

  // Only log API routes (both /api/* and /sdapi/* routes for SD.next compatibility)
  if (!skipLogging && (req.path.startsWith('/api') || req.path.startsWith('/sdapi'))) {
    const startTime = Date.now();

    // Log the request
    const protocol = req.protocol;
    const host = req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;
    logApiRequest(req.method, url, req.headers, req.body);

    // Capture response when finished
    res.on('finish', () => {
      const elapsed = Date.now() - startTime;
      // Response logging is handled by the logging utility
    });
  }
  next();
}

export default requestLogging;
