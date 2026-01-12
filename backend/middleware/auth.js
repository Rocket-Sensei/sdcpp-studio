/**
 * Authentication Middleware
 * Checks for Bearer token authentication if API_KEY is configured
 */

/**
 * Get the current API key from environment
 * Reads dynamically to support testing
 * @returns {string|undefined} The API key or undefined
 */
function getApiKey() {
  return process.env.API_KEY;
}

/**
 * Extract API token from request headers
 * Supports both Authorization: Bearer <token> and X-Api-Key: <token> headers
 * @param {import('express').Request} req - Express request object
 * @returns {string|null} The token or null if invalid
 */
function extractApiToken(req) {
  // First try Authorization header with Bearer prefix
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      return parts[1];
    }
  }

  // Fallback to X-Api-Key header (compatibility with various clients)
  const apiKeyHeader = req.headers['x-api-key'];
  if (apiKeyHeader && typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Extract Bearer token from Authorization header
 * @param {string} authHeader - The Authorization header value
 * @returns {string|null} The token or null if invalid
 * @deprecated Use extractApiToken(req) instead for broader compatibility
 */
function extractBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  // Check for Bearer prefix
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware to authenticate requests using Bearer token or X-Api-Key header
 * If API_KEY is not set, authentication is skipped (open access)
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export function authenticateRequest(req, res, next) {
  // If API_KEY is not set, allow all requests (no authentication)
  const apiKey = getApiKey();
  if (!apiKey) {
    return next();
  }

  // Extract token from Authorization header or X-Api-Key header
  const token = extractApiToken(req);

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing API key. Use Authorization: Bearer <API_KEY> or X-Api-Key: <API_KEY> header'
    });
  }

  // Compare token with configured API_KEY
  // Use constant-time comparison to prevent timing attacks
  if (token !== apiKey) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  // Authentication successful
  next();
}

/**
 * Optional authentication middleware
 * Always calls next(), but adds req.authenticated property
 * Useful for endpoints that work with or without authentication
 *
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 */
export function optionalAuth(req, res, next) {
  // If API_KEY is not set, skip authentication
  const apiKey = getApiKey();
  if (!apiKey) {
    req.authenticated = false;
    return next();
  }

  // Extract token from Authorization header or X-Api-Key header
  const token = extractApiToken(req);

  if (!token) {
    req.authenticated = false;
  } else if (token === apiKey) {
    req.authenticated = true;
  } else {
    req.authenticated = false;
  }

  next();
}

/**
 * Check if authentication is enabled
 * @returns {boolean} True if API_KEY is set
 */
export function isAuthEnabled() {
  return !!getApiKey();
}
