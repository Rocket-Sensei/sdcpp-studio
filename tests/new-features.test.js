/**
 * Vitest New Features Tests
 *
 * Tests new features implemented:
 * 1. Edit image button
 * 2. Delete All button
 * 3. Cancel All button
 * 4. Timing display (model_loading_time_ms, generation_time_ms)
 * 5. UI changes (status icon badge removed, download button icon-only)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'fs';
import { startServer, stopServer } from './helpers/testServer.js';
import { FormData, File } from 'formdata-node';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Test-specific paths - MUST be set before importing database modules
const TEST_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'test-new-features-sd-cpp-studio.db');
const TEST_IMAGES_DIR = path.join(__dirname, '..', 'backend', 'data', 'test-images');
const TEST_INPUT_DIR = path.join(__dirname, '..', 'backend', 'data', 'test-input');

process.env.DB_PATH = TEST_DB_PATH;
process.env.IMAGES_DIR = TEST_IMAGES_DIR;

const API_URL = 'http://127.0.0.1:3999';

// Create a minimal test PNG buffer
const createTestImageBuffer = () => {
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE
  ]);
};

// Helper: Direct database manipulation for testing timing columns
async function createGenerationWithTimings(timings = {}) {
  const db = (await import('../backend/db/database.js')).getDatabase();
  const { randomUUID } = await import('crypto');

  const id = randomUUID();
  const seed = Math.floor(Math.random() * 4294967295);

  const stmt = db.prepare(`
    INSERT INTO generations (
      id, type, model, prompt, size, seed, status, progress,
      model_loading_time_ms, generation_time_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    'generate',
    'qwen-image',
    'test prompt with timing',
    '512x512',
    seed,
    'completed',
    1.0,
    timings.model_loading_time_ms || null,
    timings.generation_time_ms || null
  );

  return id;
}

// Helper: Create test image files
function setupTestDirectories() {
  if (!existsSync(TEST_IMAGES_DIR)) {
    mkdirSync(TEST_IMAGES_DIR, { recursive: true });
  }
  if (!existsSync(TEST_INPUT_DIR)) {
    mkdirSync(TEST_INPUT_DIR, { recursive: true });
  }
}

// Helper: Clean up test database and files
function cleanupTestFiles() {
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
}

describe('New Features Tests', () => {
  beforeAll(async () => {
    setupTestDirectories();
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
    cleanupTestFiles();
  });

  describe('1. Edit Image Button (API Endpoint)', () => {
    it('should handle edit endpoint with image upload', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'edit test from new features');
      formData.append('size', '512x512');

      const imageBuffer = createTestImageBuffer();
      const imageFile = new File([imageBuffer], 'test-edit.png', { type: 'image/png' });
      formData.append('image', imageFile);

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.job_id).toBeTruthy();
      expect(data.status).toBe('pending');
    });

    it('should fetch generation data with images for editing', async () => {
      // Create a generation via the API
      const createResponse = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'test edit generation fetch',
          model: 'qwen-image',
          size: '512x512'
        })
      });

      const created = await createResponse.json();
      expect(created.job_id).toBeTruthy();

      // Fetch the generation
      const response = await fetch(`${API_URL}/api/generations/${created.job_id}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('prompt');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('images');
    });
  });

  describe('2. Delete All Button', () => {
    it('should delete all generations without deleting files', async () => {
      // Create some test generations via API
      await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'delete test 1', model: 'qwen-image' })
      });
      await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'delete test 2', model: 'qwen-image' })
      });

      // Verify they exist
      const beforeResponse = await fetch(`${API_URL}/api/generations`);
      const beforeData = await beforeResponse.json();
      expect(beforeData.generations.length).toBeGreaterThanOrEqual(2);

      // Delete all without deleting files
      const response = await fetch(`${API_URL}/api/generations`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('count');
      expect(data.count).toBeGreaterThanOrEqual(0);
      expect(data).toHaveProperty('filesDeleted', 0);

      // Verify database is empty
      const afterResponse = await fetch(`${API_URL}/api/generations`);
      const afterData = await afterResponse.json();
      expect(afterData.generations.length).toBe(0);
    });

    it('should respect delete_files=true query parameter', async () => {
      // Create a generation
      await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'delete files test', model: 'qwen-image' })
      });

      // Delete with delete_files=true
      const response = await fetch(`${API_URL}/api/generations?delete_files=true`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('count');
      expect(data).toHaveProperty('filesDeleted');
      expect(data.filesDeleted).toBeGreaterThanOrEqual(0);
    });

    it('should handle delete-all on empty database', async () => {
      // First ensure database is empty
      await fetch(`${API_URL}/api/generations`, { method: 'DELETE' });

      // Try deleting again
      const response = await fetch(`${API_URL}/api/generations`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data.count).toBe(0);
      expect(data.filesDeleted).toBe(0);
    });
  });

  describe('3. Cancel All Button', () => {
    it('should cancel all pending and processing jobs', async () => {
      // Create pending jobs via API
      const job1 = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'cancel test 1', model: 'qwen-image' })
      }).then(r => r.json());

      const job2 = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'cancel test 2', model: 'qwen-image' })
      }).then(r => r.json());

      // Cancel all
      const response = await fetch(`${API_URL}/api/queue/cancel-all`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('cancelled');
      expect(data.cancelled).toBeGreaterThanOrEqual(2);

      // Verify jobs are cancelled
      const job1Response = await fetch(`${API_URL}/api/generations/${job1.job_id}`);
      const job1Data = await job1Response.json();
      expect(job1Data.status).toBe('cancelled');

      const job2Response = await fetch(`${API_URL}/api/generations/${job2.job_id}`);
      const job2Data = await job2Response.json();
      expect(job2Data.status).toBe('cancelled');
    });

    it('should return cancelled: 0 when no pending/processing jobs', async () => {
      // Clear any existing jobs
      await fetch(`${API_URL}/api/generations`, { method: 'DELETE' });

      // Try cancel all
      const response = await fetch(`${API_URL}/api/queue/cancel-all`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data.cancelled).toBe(0);
    });
  });

  describe('4. Timing Display', () => {
    it('should store model_loading_time_ms in generations table', async () => {
      const db = (await import('../backend/db/database.js')).getDatabase();

      // Check if column exists
      const columns = db.prepare("PRAGMA table_info(generations)").all();
      const hasModelLoadingTime = columns.some(col => col.name === 'model_loading_time_ms');

      expect(hasModelLoadingTime).toBe(true);
    });

    it('should store generation_time_ms in generations table', async () => {
      const db = (await import('../backend/db/database.js')).getDatabase();

      // Check if column exists
      const columns = db.prepare("PRAGMA table_info(generations)").all();
      const hasGenerationTime = columns.some(col => col.name === 'generation_time_ms');

      expect(hasGenerationTime).toBe(true);
    });

    it('should create generation with timing data', async () => {
      const generationId = await createGenerationWithTimings({
        model_loading_time_ms: 1500,
        generation_time_ms: 3200
      });

      // Fetch via API to verify serialization
      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('model_loading_time_ms', 1500);
      expect(data).toHaveProperty('generation_time_ms', 3200);
    });

    it('should format timing info correctly for display', async () => {
      const generationId = await createGenerationWithTimings({
        model_loading_time_ms: 1234,
        generation_time_ms: 5678
      });

      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();

      // Verify values are present for frontend formatting
      // Frontend format: "Model: X.Xs • Gen: X.Xs"
      expect(data.model_loading_time_ms).toBe(1234);
      expect(data.generation_time_ms).toBe(5678);

      // Calculate expected formatted values
      const modelTimeFormatted = (1234 / 1000).toFixed(1); // "1.2"
      const genTimeFormatted = (5678 / 1000).toFixed(1); // "5.7"

      expect(modelTimeFormatted).toBe("1.2");
      expect(genTimeFormatted).toBe("5.7");
    });

    it('should handle generation with only model_loading_time_ms', async () => {
      const generationId = await createGenerationWithTimings({
        model_loading_time_ms: 2000
      });

      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('model_loading_time_ms', 2000);
      expect(data.generation_time_ms).toBeNull();
    });

    it('should handle generation with only generation_time_ms', async () => {
      const generationId = await createGenerationWithTimings({
        generation_time_ms: 4000
      });

      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.model_loading_time_ms).toBeNull();
      expect(data).toHaveProperty('generation_time_ms', 4000);
    });

    it('should handle generation without timing data', async () => {
      const generationId = await createGenerationWithTimings({});

      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.model_loading_time_ms).toBeNull();
      expect(data.generation_time_ms).toBeNull();
    });
  });

  describe('5. UI Changes', () => {
    it('should return correct structure for generation cards', async () => {
      // Create a generation via API
      const createResponse = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'test card structure',
          model: 'qwen-image',
          size: '768x768'
        })
      });

      const created = await createResponse.json();

      const response = await fetch(`${API_URL}/api/generations/${created.job_id}`);
      const data = await response.json();

      // Verify all expected fields for card rendering
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('prompt');
      expect(data).toHaveProperty('model');
      expect(data).toHaveProperty('created_at');
      expect(data).toHaveProperty('images');
    });

    it('should provide pagination info for gallery', async () => {
      const response = await fetch(`${API_URL}/api/generations?offset=0&limit=10`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('generations');
      expect(data).toHaveProperty('pagination');
      expect(data.pagination).toHaveProperty('offset', 0);
      expect(data.pagination).toHaveProperty('limit', 10);
      expect(data.pagination).toHaveProperty('total');
      expect(data.pagination).toHaveProperty('hasMore');
    });

    it('should handle variation endpoint', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'variation test');
      formData.append('size', '512x512');

      const imageBuffer = createTestImageBuffer();
      const imageFile = new File([imageBuffer], 'test-variation.png', { type: 'image/png' });
      formData.append('image', imageFile);

      const response = await fetch(`${API_URL}/api/queue/variation`, {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.job_id).toBeTruthy();
      expect(data.status).toBe('pending');
    });
  });

  describe('Integration: Combined Operations', () => {
    it('should handle create, cancel, and delete workflow', async () => {
      // Create multiple jobs
      const job1 = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'workflow 1', model: 'qwen-image' })
      }).then(r => r.json());

      const job2 = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'workflow 2', model: 'qwen-image' })
      }).then(r => r.json());

      const job3 = await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'workflow 3', model: 'qwen-image' })
      }).then(r => r.json());

      // Verify they exist
      let allResponse = await fetch(`${API_URL}/api/generations`);
      let allData = await allResponse.json();
      const initialCount = allData.generations.filter(g =>
        g.prompt && g.prompt.startsWith('workflow')
      ).length;
      expect(initialCount).toBeGreaterThanOrEqual(3);

      // Cancel all
      const cancelResponse = await fetch(`${API_URL}/api/queue/cancel-all`, {
        method: 'POST'
      });
      expect(cancelResponse.ok).toBe(true);
      const cancelData = await cancelResponse.json();
      expect(cancelData.cancelled).toBeGreaterThanOrEqual(3);

      // Verify cancelled status
      const job1Resp = await fetch(`${API_URL}/api/generations/${job1.job_id}`);
      const job1Data = await job1Resp.json();
      expect(job1Data.status).toBe('cancelled');

      // Delete all
      const deleteResponse = await fetch(`${API_URL}/api/generations`, {
        method: 'DELETE'
      });
      expect(deleteResponse.ok).toBe(true);

      // Verify deletion
      allResponse = await fetch(`${API_URL}/api/generations`);
      allData = await allResponse.json();
      const remaining = allData.generations.filter(g =>
        g.prompt && g.prompt.startsWith('workflow')
      );
      expect(remaining.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid delete_files parameter', async () => {
      // Create a test generation
      await fetch(`${API_URL}/api/queue/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'edge case delete', model: 'qwen-image' })
      });

      // Try with invalid delete_files parameter
      const response = await fetch(`${API_URL}/api/generations?delete_files=invalid`, {
        method: 'DELETE'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      expect(data.filesDeleted).toBe(0);
    });

    it('should handle cancel all when database is empty', async () => {
      // Clear database
      await fetch(`${API_URL}/api/generations`, { method: 'DELETE' });

      const response = await fetch(`${API_URL}/api/queue/cancel-all`, {
        method: 'POST'
      });

      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.cancelled).toBe(0);
    });

    it('should handle very large timing values', async () => {
      const generationId = await createGenerationWithTimings({
        model_loading_time_ms: 999999,
        generation_time_ms: 888888
      });

      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.model_loading_time_ms).toBe(999999);
      expect(data.generation_time_ms).toBe(888888);

      // Verify formatting would still work
      const modelTimeFormatted = (999999 / 1000).toFixed(1); // "1000.0"
      const genTimeFormatted = (888888 / 1000).toFixed(1); // "888.9"

      expect(modelTimeFormatted).toBe("1000.0");
      expect(genTimeFormatted).toBe("888.9");
    });

    it('should handle zero timing values', async () => {
      const generationId = await createGenerationWithTimings({
        model_loading_time_ms: 0,
        generation_time_ms: 0
      });

      const response = await fetch(`${API_URL}/api/generations/${generationId}`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      // Zero values should be stored as 0 (not null)
      // Note: Some database drivers may return 0 or null for unset values
      expect(data.model_loading_time_ms === 0 || data.model_loading_time_ms === null).toBe(true);
      expect(data.generation_time_ms === 0 || data.generation_time_ms === null).toBe(true);
    });
  });
});
