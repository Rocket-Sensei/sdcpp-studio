/**
 * Vitest Models List Tests
 *
 * Tests the models list JSON structure including quant, name, description,
 * and input/output modalities.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';
import { startServer, stopServer } from './helpers/testServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'test-models-sd-cpp-studio.db');
process.env.DB_PATH = TEST_DB_PATH;

const API_URL = 'http://127.0.0.1:3999';
const AUTH_HEADER = { 'Authorization': 'Bearer test-api-key' };

describe('Models List JSON', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(async () => {
    await stopServer();

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

  describe('GET /api/v1/models (OpenRouter format)', () => {
    it('should return models in OpenRouter-like format with required fields', async () => {
      const response = await fetch(`${API_URL}/api/v1/models`, {
        headers: AUTH_HEADER
      });
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data).toHaveProperty('object', 'list');
      expect(data).toHaveProperty('data');
      expect(Array.isArray(data.data)).toBe(true);
      
      if (data.data.length > 0) {
        const model = data.data[0];
        
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('description');
        expect(model).toHaveProperty('quant');
        expect(model).toHaveProperty('architecture');
        expect(model.architecture).toHaveProperty('modality');
        expect(model.architecture).toHaveProperty('input_modalities');
        expect(model.architecture).toHaveProperty('output_modalities');
      }
    });

    it('should include quant field for each model', async () => {
      const response = await fetch(`${API_URL}/api/v1/models`, {
        headers: AUTH_HEADER
      });
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      
      if (data.data.length > 0) {
        data.data.forEach(model => {
          expect(model).toHaveProperty('quant');
          expect(typeof model.quant).toBe('string');
        });
      }
    });

    it('should have correct architecture modality for text-to-image models', async () => {
      const response = await fetch(`${API_URL}/api/v1/models`, {
        headers: AUTH_HEADER
      });

      expect(response.ok).toBe(true);

      const data = await response.json();

      // Filter for models that are specifically text-to-image (text input + image output, but not text-only)
      const txt2imgModels = data.data.filter(m =>
        m.architecture?.input_modalities?.includes('text') &&
        m.architecture?.output_modalities?.includes('image') &&
        !m.architecture?.output_modalities?.includes('text')
      );

      txt2imgModels.forEach(model => {
        expect(model.architecture.output_modalities).toContain('image');
      });
    });
  });

  describe('GET /api/models', () => {
    it('should return models with quant field', async () => {
      const response = await fetch(`${API_URL}/api/models`, {
        headers: AUTH_HEADER
      });
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data).toHaveProperty('models');
      expect(Array.isArray(data.models)).toBe(true);
      
      if (data.models.length > 0) {
        const model = data.models[0];
        expect(model).toHaveProperty('quant');
      }
    });

    it('should include name for each model', async () => {
      const response = await fetch(`${API_URL}/api/models`, {
        headers: AUTH_HEADER
      });
      
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      
      if (data.models.length > 0) {
        data.models.forEach(model => {
          expect(model).toHaveProperty('name');
        });
      }
    });
  });
});
