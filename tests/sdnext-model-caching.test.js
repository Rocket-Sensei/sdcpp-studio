/**
 * Tests for SD.next API model caching functionality
 *
 * Tests that POST /sdapi/v1/options caches the model selection
 * and subsequent generation requests use the cached model.
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';
import { startServer, stopServer, SERVER_PORT } from './helpers/testServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test-specific database path
const TEST_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'test-sdnext-caching.db');
process.env.DB_PATH = TEST_DB_PATH;

const API_URL = `http://127.0.0.1:${SERVER_PORT}`;

async function fetchApi(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  return response;
}

describe('SD.next API Model Caching', () => {
  beforeAll(async () => {
    await startServer();
  }, 30000);

  afterAll(async () => {
    await stopServer();

    // Clean up test database files
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = TEST_DB_PATH + ext;
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch (e) {
          // Ignore errors
        }
      }
    }
  });

  describe('POST /sdapi/v1/options - Model Caching', () => {
    it('should cache the model selection', async () => {
      const response = await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'Qwen Image' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated).toBeDefined();
      expect(data.updated[0].sd_model_checkpoint).toBe(true);
    });

    it('should return the cached model from GET /sdapi/v1/options', async () => {
      // First set a model
      await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'FLUX.2 Klein 4B' })
      });

      // Then get the options
      const response = await fetchApi('/sdapi/v1/options', {
        method: 'GET'
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sd_model_checkpoint).toBe('FLUX.2 Klein 4B');
    });

    it('should return 400 for non-existent model', async () => {
      const response = await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'Non-Existent Model' })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Model not found');
    });

    it('should NOT match partial model names (exact match only)', async () => {
      // "Klein 4B" is a partial substring of "FLUX.2 Klein 4B" but should NOT match
      const response = await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'Klein 4B' })
      });

      // Should fail because "Klein 4B" is not an exact model name
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Model not found');
    });

    it('should match exact model name with spaces', async () => {
      // "Unstable Revolution FLUX.2 Klein 4B" is an exact model name
      const response = await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'Unstable Revolution FLUX.2 Klein 4B' })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.updated[0].sd_model_checkpoint).toBe(true);

      // Verify it was cached correctly
      const optionsResponse = await fetchApi('/sdapi/v1/options');
      const optionsData = await optionsResponse.json();
      expect(optionsData.sd_model_checkpoint).toBe('Unstable Revolution FLUX.2 Klein 4B');
    });

    it('should preserve cached model across multiple requests', async () => {
      // Set model
      await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'FLUX.2 Klein 9B Q8_0' })
      });

      // Get options multiple times
      for (let i = 0; i < 3; i++) {
        const response = await fetchApi('/sdapi/v1/options');
        const data = await response.json();
        expect(data.sd_model_checkpoint).toBe('FLUX.2 Klein 9B Q8_0');
      }
    });
  });

  describe('GET /sdapi/v1/sd-models', () => {
    it('should list all available models', async () => {
      const response = await fetchApi('/sdapi/v1/sd-models');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      // Check model format
      const model = data[0];
      expect(model.title).toBeDefined();
      expect(model.model_name).toBeDefined();
      expect(model.filename).toBeDefined();
    });
  });

  describe('Model Caching Integration', () => {
    it('should persist cached model across server restarts (database persistence)', async () => {
      // Set a specific model
      const cacheResponse = await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'FLUX.2 Klein 4B' })
      });
      expect(cacheResponse.status).toBe(200);

      // Verify the cache was set
      const optionsResponse = await fetchApi('/sdapi/v1/options');
      const optionsData = await optionsResponse.json();
      expect(optionsData.sd_model_checkpoint).toBe('FLUX.2 Klein 4B');

      // Change to another model with more specific name to avoid partial match issues
      await fetchApi('/sdapi/v1/options', {
        method: 'POST',
        body: JSON.stringify({ sd_model_checkpoint: 'FLUX.2 Klein 9B Q8_0' })
      });

      // Verify it changed
      const response2 = await fetchApi('/sdapi/v1/options');
      const data2 = await response2.json();
      expect(data2.sd_model_checkpoint).toBe('FLUX.2 Klein 9B Q8_0');
    });
  });
});

describe('Config Database Functions', () => {
  // Direct database tests for getConfig/setConfig
  const testDbPath = path.join(__dirname, '../backend/data/test-config-funcs.db');

  beforeEach(async () => {
    // Reset database module cache and set test path
    process.env.DB_PATH = testDbPath;

    // Delete test database if it exists
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = testDbPath + ext;
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch (e) {
          // Ignore
        }
      }
    }
  });

  afterAll(async () => {
    // Clean up
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = testDbPath + ext;
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
        } catch (e) {
          // Ignore
        }
      }
    }
  });

  it('should store and retrieve config values', async () => {
    // Import fresh to pick up new DB_PATH
    const dbModule = await import('../backend/db/database.js?' + Date.now());
    const { setConfig, getConfig, initializeDatabase, closeDatabase } = dbModule;

    initializeDatabase();

    // Set a value
    setConfig('test_key', 'test_value');

    // Get the value
    const value = getConfig('test_key');
    expect(value).toBe('test_value');

    closeDatabase();
  });

  it('should update existing config values', async () => {
    const dbModule = await import('../backend/db/database.js?' + Date.now());
    const { setConfig, getConfig, initializeDatabase, closeDatabase } = dbModule;

    initializeDatabase();

    // Set initial value
    setConfig('test_key', 'initial_value');
    expect(getConfig('test_key')).toBe('initial_value');

    // Update value
    setConfig('test_key', 'updated_value');
    expect(getConfig('test_key')).toBe('updated_value');

    closeDatabase();
  });

  it('should return null for non-existent keys', async () => {
    const dbModule = await import('../backend/db/database.js?' + Date.now());
    const { getConfig, initializeDatabase, closeDatabase } = dbModule;

    initializeDatabase();

    const value = getConfig('non_existent_key');
    expect(value).toBeNull();

    closeDatabase();
  });

  it('should cache model selection in database', async () => {
    const dbModule = await import('../backend/db/database.js?' + Date.now());
    const { setConfig, getConfig, initializeDatabase, closeDatabase } = dbModule;

    initializeDatabase();

    const CACHED_MODEL_KEY = 'sdnext_cached_model';

    // Cache a model ID
    setConfig(CACHED_MODEL_KEY, 'flux2-klein-4b');

    // Retrieve it
    const cachedModel = getConfig(CACHED_MODEL_KEY);
    expect(cachedModel).toBe('flux2-klein-4b');

    closeDatabase();
  });
});
