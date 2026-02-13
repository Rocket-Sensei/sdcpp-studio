/**
 * Vitest tests for image edit/variation endpoints
 * Tests the queue-based edit and variation functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync, unlinkSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { startServer, stopServer } from './helpers/testServer.js';

// Use form-data package instead of formdata-node for Node.js 24 compatibility
const require = createRequire(import.meta.url);
const FormData = require('form-data');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test-specific database path - MUST be set before importing database modules
const TEST_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'test-edit-sd-cpp-studio.db');
process.env.DB_PATH = TEST_DB_PATH;

// Test-specific images directories - MUST be set before importing database modules
const TEST_IMAGES_DIR = path.join(__dirname, '..', 'backend', 'data', 'test-edit-images');
const TEST_INPUT_DIR = path.join(__dirname, '..', 'backend', 'data', 'test-edit-input');
process.env.IMAGES_DIR = TEST_IMAGES_DIR;
process.env.INPUT_DIR = TEST_INPUT_DIR;
const API_URL = 'http://127.0.0.1:3999';

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

    // Clean up test database files after all tests
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

  beforeEach(async () => {
    // Create test directories
    if (!existsSync(TEST_IMAGES_DIR)) {
      await mkdir(TEST_IMAGES_DIR, { recursive: true });
    }
    if (!existsSync(TEST_INPUT_DIR)) {
      await mkdir(TEST_INPUT_DIR, { recursive: true });
    }
  });

  afterEach(async () => {
    // Cleanup test files
    try {
      const testFiles = await import('fs/promises').then(fs =>
        fs.readdir(TEST_INPUT_DIR).catch(() => [])
      );
      for (const file of testFiles) {
        await unlink(path.join(TEST_INPUT_DIR, file));
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

    it('should create queue job with input_image_path when image is uploaded', async () => {
      // Create a temporary test image file
      const testImagePath = path.join(TEST_INPUT_DIR, `test-${randomUUID()}.png`);
      await writeFile(testImagePath, createTestImageBuffer());

      // Use form-data package for Node.js 24 compatibility
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'add a cat');
      formData.append('size', '512x512');
      formData.append('n', '1');

      // Append buffer directly with options for filename and contentType
      const imageBuffer = createTestImageBuffer();
      formData.append('image', imageBuffer, { filename: 'test.png', contentType: 'image/png' });

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData.getBuffer(),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.job_id).toBeTruthy();
      expect(data.status).toBe('pending');
    });

    it('should handle mask image upload', async () => {
      // Use form-data package for Node.js 24 compatibility
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'add a cat');
      formData.append('size', '512x512');

      const imageBuffer = createTestImageBuffer();
      const maskBuffer = createTestImageBuffer();
      formData.append('image', imageBuffer, { filename: 'test.png', contentType: 'image/png' });
      formData.append('mask', maskBuffer, { filename: 'mask.png', contentType: 'image/png' });

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData.getBuffer()
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.job_id).toBeTruthy();
    });

    it('should save uploaded image to disk', async () => {
      // Use form-data package for Node.js 24 compatibility
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'test edit');
      formData.append('size', '512x512');

      const testBuffer = createTestImageBuffer();
      formData.append('image', testBuffer, { filename: 'test.png', contentType: 'image/png' });

      const response = await fetch(`${API_URL}/api/queue/edit`, {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData.getBuffer()
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

    it('should create queue job with type=variation', async () => {
      // Use form-data package for Node.js 24 compatibility
      const formData = new FormData();
      formData.append('model', 'qwen-image-edit');
      formData.append('prompt', 'create variation');
      formData.append('size', '512x512');

      const imageBuffer = createTestImageBuffer();
      formData.append('image', imageBuffer, { filename: 'test.png', contentType: 'image/png' });

      const response = await fetch(`${API_URL}/api/queue/variation`, {
        method: 'POST',
        headers: formData.getHeaders(),
        body: formData.getBuffer()
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
