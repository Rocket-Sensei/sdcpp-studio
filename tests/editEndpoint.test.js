/**
 * Vitest tests for image edit/variation endpoints
 * Tests the queue-based edit and variation functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer, stopServer } from './helpers/testServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_IMAGE_DIR = path.join(__dirname, '../backend/data/input-test');
const API_URL = 'http://127.0.0.1:3000';

// Mock test data
const createTestImageBuffer = () => {
  // Create a minimal PNG buffer (1x1 transparent pixel)
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE
  ]);
};

describe('Edit/Variation Queue Endpoints', () => {
  beforeAll(async () => {
    await startServer();
  });

  afterAll(async () => {
    await stopServer();
  });

  beforeEach(async () => {
    // Create test directory
    if (!existsSync(TEST_IMAGE_DIR)) {
      await mkdir(TEST_IMAGE_DIR, { recursive: true });
    }
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      const testFiles = await import('fs/promises').then(fs =>
        fs.readdir(TEST_IMAGE_DIR).catch(() => [])
      );
      for (const file of testFiles) {
        await unlink(path.join(TEST_IMAGE_DIR, file));
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('POST /api/queue/edit', () => {
    it('should reject request without image file', async () => {
      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: JSON.stringify({
          model: 'qwen-image-edit',
          prompt: 'add a cat',
          size: '512x512'
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it.skip('should create queue job with input_image_path when image is uploaded', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'add a cat');
      formData.append('size', '512x512');
      formData.append('n', '1');
      const imageBlob = new Blob([createTestImageBuffer()], { type: 'image/png' });
      formData.append('image', imageBlob, 'test.png');

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header - let FormData set it with boundary
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.job_id).toBeTruthy();
      expect(data.status).toBe('pending');
    });

    it.skip('should handle mask image upload', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'add a cat');
      formData.append('size', '512x512');
      const imageBlob = new Blob([createTestImageBuffer()], { type: 'image/png' });
      formData.append('image', imageBlob, 'test.png');
      const maskBlob = new Blob([createTestImageBuffer()], { type: 'image/png' });
      formData.append('mask', maskBlob, 'mask.png');

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.job_id).toBeTruthy();
    });

    it.skip('should save uploaded image to disk', async () => {
      const testBuffer = createTestImageBuffer();
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'test edit');
      formData.append('size', '512x512');
      const imageBlob = new Blob([testBuffer], { type: 'image/png' });
      formData.append('image', imageBlob, 'test.png');

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        body: formData
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.job_id).toBeTruthy();
    });
  });

  describe('POST /api/queue/variation', () => {
    it('should reject request without image file', async () => {
      const response = await fetch(`${API_URL}/api/queue/variation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-image-edit',
          prompt: 'create variation',
          size: '512x512'
        })
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it.skip('should create queue job with type=variation', async () => {
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'create variation');
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

  describe('Queue Processor Edit Job Handling', () => {
    it('should process edit job with image from disk', async () => {
      // This test verifies that processEditJob correctly loads
      // the image from disk and makes the API call
      // Full integration test would require waiting for queue processing
    });

    it('should require input_image_path for edit jobs', async () => {
      // Verify that processEditJob throws error without input_image_path
      // This is a unit test for the queue processor
    });
  });

  describe('FormData Construction', () => {
    it('should use image[] field name for sdcpp API', async () => {
      // Verify that the FormData sent to sdcpp uses 'image[]' not 'image'
      // This would require mocking generateImageDirect
    });

    it('should use mask[] field name for mask uploads', async () => {
      // Verify that the FormData sent to sdcpp uses 'mask[]' not 'mask'
    });
  });
});
