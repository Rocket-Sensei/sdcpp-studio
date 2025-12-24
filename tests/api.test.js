/**
 * Vitest API Tests (No model files required)
 *
 * Tests API endpoints without requiring model files to be present.
 * Useful for CI/CD and basic API validation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { startServer, stopServer } from './helpers/testServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = 'http://127.0.0.1:3000';

// Create a minimal test PNG buffer
const createTestImageBuffer = () => {
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE
  ]);
};

describe('API Endpoints (No Model Required)', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
  });

  describe('Health & Config', () => {
    it('GET /api/health should return ok status', async () => {
      const response = await fetch(`${API_URL}/api/health`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.status).toBe('ok');
      expect(data.timestamp).toBeTruthy();
    });

    it('GET /api/config should return config', async () => {
      const response = await fetch(`${API_URL}/api/config`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('sdApiEndpoint');
    });
  });

  describe('Generations API', () => {
    it('GET /api/generations should return array', async () => {
      const response = await fetch(`${API_URL}/api/generations`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
    });

    it('GET /api/generations/:id should return 404 for non-existent', async () => {
      const response = await fetch(`${API_URL}/api/generations/non-existent-id`);
      expect(response.status).toBe(404);
    });
  });

  describe('Queue API', () => {
    it('GET /api/queue should return jobs array', async () => {
      const response = await fetch(`${API_URL}/api/queue`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('jobs');
      expect(Array.isArray(data.jobs)).toBe(true);
    });

    it('GET /api/queue/stats should return statistics', async () => {
      const response = await fetch(`${API_URL}/api/queue/stats`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('pending');
      expect(data).toHaveProperty('processing');
      expect(data).toHaveProperty('completed');
      expect(data).toHaveProperty('failed');
    });

    it('POST /api/queue/generate should create job', async () => {
      const response = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'test prompt',
          size: '512x512',
          n: 1
        })
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.job_id).toBeTruthy();
      expect(data.status).toBe('pending');
    });

    it('GET /api/queue/:id should return job', async () => {
      // First create a job
      const createResponse = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'test prompt for get',
          size: '512x512'
        })
      });

      const created = await createResponse.json();

      // Then get it
      const response = await fetch(`${API_URL}/api/queue/${created.job_id}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.id).toBe(created.job_id);
    });
  });

  describe('Models API', () => {
    it('GET /api/models should return models list', async () => {
      const response = await fetch(`${API_URL}/api/models`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('models');
      expect(Array.isArray(data.models)).toBe(true);
      expect(data).toHaveProperty('default');
    });

    it('GET /api/models/:id should return model details', async () => {
      const response = await fetch(`${API_URL}/api/models/qwen-image`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('name');
    });

    it('GET /api/models/:id/status should return status', async () => {
      const response = await fetch(`${API_URL}/api/models/qwen-image/status`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('status');
    });

    it('GET /api/models/running should return running models', async () => {
      const response = await fetch(`${API_URL}/api/models/running`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('models');
      expect(Array.isArray(data.models)).toBe(true);
    });
  });

  describe('Edit/Variation Queue API', () => {
    it('POST /api/queue/edit should require image', async () => {
      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'edit test',
          size: '512x512'
        })
      });

      // Should fail because no image provided
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it.skip('POST /api/queue/edit should accept image upload', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'edit test');
      formData.append('size', '512x512');
      const imageBlob = new Blob([createTestImageBuffer()], { type: 'image/png' });
      formData.append('image', imageBlob, 'test.png');

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.job_id).toBeTruthy();
    });

    it('POST /api/queue/variation should require image', async () => {
      const response = await fetch(`${API_URL}/api/queue/variation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'variation test',
          size: '512x512'
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it.skip('POST /api/queue/variation should accept image upload', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'variation test');
      formData.append('size', '512x512');
      const imageBlob = new Blob([createTestImageBuffer()], { type: 'image/png' });
      formData.append('image', imageBlob, 'test.png');

      const response = await fetch(`${API_URL}/api/queue/variation`, {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.job_id).toBeTruthy();
    });
  });

  describe('Queue Job Lifecycle', () => {
    it('should track job through status changes', async () => {
      // Create job
      const createResponse = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'lifecycle test',
          size: '512x512'
        })
      });

      const created = await createResponse.json();
      expect(created.status).toBe('pending');

      // Get job details
      const response = await fetch(`${API_URL}/api/queue/${created.job_id}`);
      const job = await response.json();

      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('status');
      expect(job).toHaveProperty('created_at');
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for invalid queue job id', async () => {
      const response = await fetch(`${API_URL}/api/queue/invalid-job-id`);
      expect(response.status).toBe(404);
    });

    it('should return 404 for invalid generation id', async () => {
      const response = await fetch(`${API_URL}/api/generations/invalid-gen-id`);
      expect(response.status).toBe(404);
    });

    it('should return 404 for invalid model id', async () => {
      const response = await fetch(`${API_URL}/api/models/invalid-model-id`);
      expect(response.status).toBe(404);
    });
  });
});
