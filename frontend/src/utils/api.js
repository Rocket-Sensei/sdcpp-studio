const API_KEY_STORAGE_KEY = 'sd-cpp-studio-api-key';

/**
 * Get the stored API key from localStorage
 * @returns {string|null} The stored API key or null
 */
export function getStoredApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Save the API key to localStorage
 * @param {string} apiKey - The API key to save
 */
export function saveApiKey(apiKey) {
  try {
    if (apiKey) {
      localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
  } catch (error) {
    console.error('Failed to save API key:', error);
  }
}

/**
 * Remove the stored API key from localStorage
 */
export function clearApiKey() {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear API key:', error);
  }
}

/**
 * Enhanced fetch wrapper that adds Bearer token authentication if API key is stored
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export async function authenticatedFetch(url, options = {}) {
  const apiKey = getStoredApiKey();

  const headers = {
    ...options.headers,
  };

  // Add Authorization header if API key is stored
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

/**
 * Get configuration from the server
 * This endpoint does not require authentication
 * @param {string} [apiKey] - Optional API key to validate
 * @returns {Promise<{authEnabled: boolean, keyPassed: boolean, keyValid: boolean, sdApiEndpoint: string, model: string}>} Configuration object
 */
export async function getServerConfig(apiKey = null) {
  try {
    const headers = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    const response = await fetch('/api/config', { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`);
    }
    
    const config = await response.json();
    return {
      authEnabled: config.authEnabled || false,
      keyPassed: config.keyPassed || false,
      keyValid: config.keyValid || false,
      sdApiEndpoint: config.sdApiEndpoint,
      model: config.model
    };
  } catch (error) {
    console.error('Failed to get server config:', error);
    return {
      authEnabled: false,
      keyPassed: false,
      keyValid: false,
      sdApiEndpoint: null,
      model: null
    };
  }
}

/**
 * Check if the API requires authentication
 * @returns {Promise<boolean>} True if authentication is required
 * @deprecated Use getServerConfig() instead
 */
export async function isAuthRequired() {
  const config = await getServerConfig();
  return config.authEnabled;
}

/**
 * Validate an API key by checking with the config endpoint
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<boolean>} True if the API key is valid
 */
export async function validateApiKey(apiKey) {
  try {
    const config = await getServerConfig(apiKey);
    // If auth is not enabled, any key is "valid" (not needed)
    // If auth is enabled, check that the key is valid
    return !config.authEnabled || config.keyValid;
  } catch {
    return false;
  }
}
