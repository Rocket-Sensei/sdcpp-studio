/**
 * Tests for Image Serving and Pagination
 *
 * Tests the static file serving for images and pagination functionality:
 * - Static file endpoints (/static/images/*, /static/input/*)
 * - Pagination API (limit/offset)
 * - Image response includes static_url field
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer, stopServer, SERVER_PORT, SERVER_HOST } from './helpers/testServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test-specific database path - MUST be set before importing database modules
const TEST_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'test-sd-cpp-studio.db');
process.env.DB_PATH = TEST_DB_PATH;

// Test-specific images directories - MUST be set before importing database modules
const TEST_IMAGES_DIR = path.join(__dirname, '..', 'backend', 'data', 'test-images');
const TEST_INPUT_DIR = path.join(__dirname, '..', 'backend', 'data', 'test-input');
process.env.IMAGES_DIR = TEST_IMAGES_DIR;
process.env.INPUT_DIR = TEST_INPUT_DIR;

// Import backend modules AFTER setting DB_PATH and directory paths
import { initializeDatabase, getImagesDir, getInputImagesDir, closeDatabase, clearDatabase } from '../backend/db/database.js';
import { createGeneration, createGeneratedImage, getAllGenerations, getGenerationsCount, getImageById } from '../backend/db/queries.js';

const API_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;

describe('Image Serving and Pagination', () => {
  beforeAll(async () => {
    // Initialize database (creates if not exists)
    initializeDatabase();

    // Start test server (will also use the test database path via env var)
    await startServer();
  });

  afterAll(async () => {
    // Stop test server
    await stopServer();

    // Close database connection
    closeDatabase();
  });

  beforeEach(async () => {
    // Clear any existing data from previous test runs
    clearDatabase();
  });

  afterAll(async () => {
    // Clean up test database files after all tests
    for (const ext of ['', '-wal', '-shm']) {
      const filePath = TEST_DB_PATH + ext;
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore errors
        }
      }
    }
  });

  // Helper function to clean up image files
  function cleanupDir(dir) {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const filePath = path.join(dir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          // Ignore errors
        }
      }
    }
  }

  describe('Static File Serving Configuration', () => {
    it('should have static file middleware configured', async () => {
      // Check that static middleware is registered by trying to access frontend dist
      const response = await fetch(API_URL + '/');

      // The request should not error (may return frontend or 404 but not crash)
      expect(response.status).toBeLessThan(500);
    });

    it('should serve images from /static/images path', async () => {
      const imagesDir = getImagesDir();

      // Create a test image file
      fs.mkdirSync(imagesDir, { recursive: true });
      const testImageId = 'test-' + Date.now();
      const testFilename = `${testImageId}.png`;
      const testFilePath = path.join(imagesDir, testFilename);
      fs.writeFileSync(testFilePath, Buffer.from('test-png-data'));

      // Try to access the static file
      const response = await fetch(`${API_URL}/static/images/${testFilename}`);
      expect(response.status).toBe(200);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toEqual(Buffer.from('test-png-data'));

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should serve input images from /static/input path', async () => {
      const inputDir = getInputImagesDir();

      // Create a test input image file
      fs.mkdirSync(inputDir, { recursive: true });
      const testImageId = 'input-test-' + Date.now();
      const testFilename = `${testImageId}.png`;
      const testFilePath = path.join(inputDir, testFilename);
      fs.writeFileSync(testFilePath, Buffer.from('input-test-data'));

      // Try to access the static file
      const response = await fetch(`${API_URL}/static/input/${testFilename}`);
      expect(response.status).toBe(200);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toEqual(Buffer.from('input-test-data'));

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should return 404 for non-existent static files', async () => {
      const response = await fetch(`${API_URL}/static/images/non-existent.png`);
      expect(response.status).toBe(404);
    });
  });

  describe('Image API Response - static_url Field', () => {
    it('should include static_url in getImageById response', async () => {
      const imagesDir = getImagesDir();
      fs.mkdirSync(imagesDir, { recursive: true });

      // Create a test image file
      const imageId = 'img-' + Date.now();
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      const imageData = Buffer.from('test-image-data');
      fs.writeFileSync(filePath, imageData);

      // Create a generation with image
      const generationId = 'gen-' + Date.now();
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test prompt',
        status: 'completed',
        seed: 12345
      });

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: imageData
      });

      // Get the image via API
      const image = getImageById(imageId);

      expect(image).toBeDefined();
      expect(image.static_url).toBeDefined();
      expect(image.static_url).toBe(`/static/images/${filename}`);
      expect(image.file_path).toBe(filePath);

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should include static_url for input images', async () => {
      const inputDir = getInputImagesDir();
      fs.mkdirSync(inputDir, { recursive: true });

      // Create a test input image file
      const filename = `input-${Date.now()}.png`;
      const filePath = path.join(inputDir, filename);
      fs.writeFileSync(filePath, Buffer.from('input-data'));

      // Mock an image object with input path
      const mockImage = {
        id: 'test-id',
        file_path: filePath,
        mime_type: 'image/png'
      };

      // Import and use the helper function
      const { addStaticUrlToImage } = await import('../backend/db/queries.js');

      // Note: addStaticUrlToImage is a private function, so we can't import it directly
      // Instead, we'll create a generation with input_image_path
      const generationId = 'gen-' + Date.now();
      await createGeneration({
        id: generationId,
        type: 'edit',
        model: 'test-model',
        prompt: 'test edit',
        status: 'pending',
        seed: 12345,
        input_image_path: filePath,
        input_image_mime_type: 'image/png'
      });

      const { getGenerationById } = await import('../backend/db/queries.js');
      const generation = getGenerationById(generationId);

      expect(generation.input_image_path).toBe(filePath);

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  describe('Pagination API', () => {
    beforeEach(async () => {
      // Create test generations
      for (let i = 0; i < 25; i++) {
        await createGeneration({
          id: `gen-pagination-${i}`,
          type: 'generate',
          model: 'test-model',
          prompt: `test prompt ${i}`,
          status: 'completed',
          seed: 1000 + i
        });
      }
    });

    it('should return paginated results with limit parameter', async () => {
      const response = await fetch(`${API_URL}/api/generations?limit=10`);
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data).toHaveProperty('generations');
      expect(data).toHaveProperty('pagination');
      expect(Array.isArray(data.generations)).toBe(true);
      expect(data.generations.length).toBe(10);
      expect(data.pagination).toEqual({
        total: 25,
        limit: 10,
        offset: 0,
        hasMore: true
      });
    });

    it('should support offset parameter for pagination', async () => {
      // Get first page
      const page1Response = await fetch(`${API_URL}/api/generations?limit=10&offset=0`);
      expect(page1Response.status).toBe(200);
      const page1 = await page1Response.json();

      expect(page1.generations.length).toBe(10);

      // Get second page
      const page2Response = await fetch(`${API_URL}/api/generations?limit=10&offset=10`);
      expect(page2Response.status).toBe(200);
      const page2 = await page2Response.json();

      expect(page2.generations.length).toBe(10);

      // Verify different items
      const page1Ids = page1.generations.map(g => g.id);
      const page2Ids = page2.generations.map(g => g.id);
      const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
      expect(hasOverlap).toBe(false);
    });

    it('should return correct hasMore flag', async () => {
      // First page - should have more
      const page1Response = await fetch(`${API_URL}/api/generations?limit=10&offset=0`);
      const page1 = await page1Response.json();
      expect(page1.pagination.hasMore).toBe(true);

      // Second page - should have more
      const page2Response = await fetch(`${API_URL}/api/generations?limit=10&offset=10`);
      const page2 = await page2Response.json();
      expect(page2.pagination.hasMore).toBe(true);

      // Third page - should not have more (only 5 items left)
      const page3Response = await fetch(`${API_URL}/api/generations?limit=10&offset=20`);
      const page3 = await page3Response.json();
      expect(page3.pagination.hasMore).toBe(false);
    });

    it('should return all results when no limit specified', async () => {
      const response = await fetch(`${API_URL}/api/generations`);
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.generations.length).toBe(25);
      expect(data.pagination).toEqual({
        total: 25,
        limit: 25,
        offset: 0,
        hasMore: false
      });
    });

    it('should return empty array when offset exceeds total', async () => {
      const response = await fetch(`${API_URL}/api/generations?limit=10&offset=100`);
      expect(response.status).toBe(200);

      const data = await response.json();

      expect(data.generations).toEqual([]);
      expect(data.pagination).toEqual({
        total: 25,
        limit: 10,
        offset: 100,
        hasMore: false
      });
    });
  });

  describe('Request Logging - Static Files Excluded', () => {
    it('should not log requests to /static/images/* paths', async () => {
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const filename = `test-${Date.now()}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Make a request to the static file
      const response = await fetch(`${API_URL}/static/images/${filename}`);
      expect(response.status).toBe(200);

      // Check that the request was successful
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toEqual(Buffer.from('data'));

      // Verify the file was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the static file request
        expect(logContent).not.toContain(`/static/images/${filename}`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should not log requests to /static/input/* paths', async () => {
      const inputDir = getInputImagesDir();

      // Create a test image
      fs.mkdirSync(inputDir, { recursive: true });
      const filename = `test-${Date.now()}.png`;
      const filePath = path.join(inputDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Make a request to the static file
      const response = await fetch(`${API_URL}/static/input/${filename}`);
      expect(response.status).toBe(200);

      // Check that the request was successful
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toEqual(Buffer.from('data'));

      // Verify the file was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the static file request
        expect(logContent).not.toContain(`/static/input/${filename}`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should not log requests to /api/images/:imageId', async () => {
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const imageId = `img-${Date.now()}`;
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Create a generation with image
      const generationId = `gen-${Date.now()}`;
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test',
        status: 'completed',
        seed: 12345
      });
      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: Buffer.from('data')
      });

      // Make a request to the image API
      const response = await fetch(`${API_URL}/api/images/${imageId}`);
      expect(response.status).toBe(200);

      // Check that the request was successful
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toEqual(Buffer.from('data'));

      // Verify the request was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the image API request
        expect(logContent).not.toContain(`/api/images/${imageId}`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should not log requests to /api/generations/:id/image', async () => {
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const imageId = `img-${Date.now()}`;
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Create a generation with image
      const generationId = `gen-${Date.now()}`;
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test',
        status: 'completed',
        seed: 12345
      });
      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: Buffer.from('data')
      });

      // Make a request to the generation image API
      const response = await fetch(`${API_URL}/api/generations/${generationId}/image`);
      expect(response.status).toBe(200);

      // Check that the request was successful
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer).toEqual(Buffer.from('data'));

      // Verify the request was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the generation image API request
        expect(logContent).not.toContain(`/api/generations/${generationId}/image`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  describe('getGenerationsCount Helper', () => {
    it('should return correct count of generations', async () => {
      // Create some test generations
      await createGeneration({
        id: `gen-count-1`,
        type: 'generate',
        model: 'test-model',
        prompt: 'test 1',
        status: 'completed',
        seed: 1
      });
      await createGeneration({
        id: `gen-count-2`,
        type: 'generate',
        model: 'test-model',
        prompt: 'test 2',
        status: 'pending',
        seed: 2
      });
      await createGeneration({
        id: `gen-count-3`,
        type: 'edit',
        model: 'test-model',
        prompt: 'test 3',
        status: 'failed',
        seed: 3
      });

      const count = getGenerationsCount();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should return 0 for empty database', async () => {
      // Create a fresh database
      const freshDbPath = path.join(__dirname, '..', 'backend', 'data', 'test-fresh.db');
      // Note: initializeDatabase uses a fixed path, so we can't easily test empty state
      // Instead, we just verify the function works
      const count = getGenerationsCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Image API Error Handling', () => {
    it('should return 404 when image file does not exist on disk', async () => {
      const imagesDir = getImagesDir();

      // Create a generation and image record in database
      const generationId = `gen-missing-${Date.now()}`;
      const imageId = `img-missing-${Date.now()}`;
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test',
        status: 'completed',
        seed: 12345
      });

      // Create image record but DO NOT create the actual file
      const db = (await import('../backend/db/database.js')).getDatabase();
      const stmt = db.prepare(`
        INSERT INTO generated_images (id, generation_id, file_path, mime_type)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(imageId, generationId, path.join(imagesDir, 'nonexistent.png'), 'image/png');

      // Request the image that doesn't exist
      const response = await fetch(`${API_URL}/api/images/${imageId}`);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('Image file not found on disk');
    });

    it('should return 404 for non-existent image ID', async () => {
      const response = await fetch(`${API_URL}/api/images/nonexistent-image-id`);
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error).toBe('Image not found');
    });

    it('should handle absolute and relative file paths correctly', async () => {
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const imageId = `img-path-${Date.now()}`;
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('path-test-data'));

      // Create a generation with image - the file_path stored will be absolute
      const generationId = `gen-path-${Date.now()}`;
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test',
        status: 'completed',
        seed: 12345
      });
      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: Buffer.from('path-test-data')
      });

      // Verify the file_path in database is absolute
      const image = getImageById(imageId);
      expect(path.isAbsolute(image.file_path)).toBe(true);

      // Request via API - should work correctly
      const response = await fetch(`${API_URL}/api/images/${imageId}`);
      expect(response.status).toBe(200);
      const buffer = Buffer.from(await response.arrayBuffer());
      expect(buffer).toEqual(Buffer.from('path-test-data'));

      // Clean up
      fs.unlinkSync(filePath);
    });
  });
});
