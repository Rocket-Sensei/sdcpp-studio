const API_KEY_STORAGE_KEY = 'sd-webui-api-key';

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
 * Check if the API requires authentication
 * @returns {Promise<boolean>} True if authentication is required
 */
export async function isAuthRequired() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      return false;
    }
    const config = await response.json();
    return config.authRequired || false;
  } catch {
    return false;
  }
}

/**
 * Validate an API key by making a test request
 * @param {string} apiKey - The API key to validate
 * @returns {Promise<boolean>} True if the API key is valid
 */
export async function validateApiKey(apiKey) {
  try {
    const response = await fetch('/api/generations', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    return response.ok || response.status !== 401;
  } catch {
    return false;
  }
}
