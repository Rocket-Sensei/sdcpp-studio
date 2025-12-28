/**
 * Vitest Full Workflow Integration Tests
 *
 * End-to-end testing for the sd.cpp Studio image generation pipeline.
 * Tests the complete flow from API call to image saved on disk.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { startServer, stopServer } from './helpers/testServer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');

// Test-specific database path - MUST be set before importing database modules
const TEST_DB_PATH = path.join(PROJECT_ROOT, 'backend/data/test-fullworkflow-sd-cpp-studio.db');
process.env.DB_PATH = TEST_DB_PATH;

// Test-specific images directories - MUST be set before importing backend modules
const TEST_IMAGES_DIR = path.join(PROJECT_ROOT, 'backend/data/test-fullworkflow-images');
const TEST_INPUT_DIR = path.join(PROJECT_ROOT, 'backend/data/test-fullworkflow-input');
process.env.IMAGES_DIR = TEST_IMAGES_DIR;
process.env.INPUT_DIR = TEST_INPUT_DIR;

const API_URL = 'http://127.0.0.1:3000';

// Test configuration
const TEST_MODELS = [
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    execMode: 'server',
    port: 1236,
    testPrompt: 'A serene landscape with mountains and a lake at sunset',
    testSize: '1024x1024'
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    execMode: 'server',
    port: 1237,
    testPrompt: 'A futuristic cityscape with flying cars',
    testSize: '1024x1024'
  },
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    execMode: 'cli',
    testPrompt: 'A cute robot holding a flower',
    testSize: '1024x1024'
  }
];

// Helper functions
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function getModelStatus(modelId) {
  const response = await fetch(`${API_URL}/api/models/${modelId}/status`);
  if (response.ok) {
    return await response.json();
  }
  return null;
}

async function startModel(modelId) {
  const response = await fetch(`${API_URL}/api/models/${modelId}/start`, {
    method: 'POST'
  });
  return response.ok ? await response.json() : null;
}

async function stopModel(modelId) {
  const response = await fetch(`${API_URL}/api/models/${modelId}/stop`, {
    method: 'POST'
  });
  return response.ok;
}

async function waitForModelRunning(modelId, timeout = 60000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const status = await getModelStatus(modelId);
    if (status && status.status === 'running') {
      return true;
    }
    if (status && status.status === 'error') {
      throw new Error(`Model ${modelId} failed to start: ${status.error || 'Unknown error'}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Model ${modelId} startup timed out`);
}

async function submitGenerationJob(modelId, prompt, size = '1024x1024') {
  const response = await fetch(`${API_URL}/api/queue/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      prompt: prompt,
      size: size,
      n: 1
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to submit job: ${response.statusText}`);
  }

  return await response.json();
}

async function pollJobCompletion(jobId, timeout = 300000) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const response = await fetch(`${API_URL}/api/queue/${jobId}`);
    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.statusText}`);
    }

    const job = await response.json();

    if (job.status === 'completed') {
      return job;
    }
    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error || 'Unknown error'}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Job ${jobId} timed out`);
}

function verifyGenerationInDatabase(generationId) {
  const db = new Database(TEST_DB_PATH, { readonly: true });

  const generation = db.prepare('SELECT * FROM generations WHERE id = ?').get(generationId);
  expect(generation).toBeTruthy();
  expect(generation.type).toBe('generate');

  const images = db.prepare('SELECT * FROM generated_images WHERE generation_id = ?').all(generationId);
  expect(images.length).toBeGreaterThan(0);

  const imagePath = images[0].file_path;
  expect(existsSync(imagePath)).toBe(true);

  db.close();
  return { generation, images };
}

// Tests
describe.skip('Full Workflow Integration Tests', () => {
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

  describe('Backend Health', () => {
    it('should have backend server running', async () => {
      const isHealthy = await checkBackendHealth();
      expect(isHealthy).toBe(true);
    });

    it('should return model list', async () => {
      const response = await fetch(`${API_URL}/api/models`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.models).toBeInstanceOf(Array);
      expect(data.models.length).toBeGreaterThan(0);
    });
  });

  describe('qwen-image (SERVER mode)', () => {
    const model = TEST_MODELS[0];

    it('should start the model server', async () => {
      // Check if already running
      const status = await getModelStatus(model.id);
      if (status && status.status === 'running') {
        return; // Already running, skip start
      }

      const result = await startModel(model.id);
      expect(result).toBeTruthy();

      // Wait for server to be ready
      await waitForModelRunning(model.id);
    });

    it('should generate image via queue', async () => {
      const job = await submitGenerationJob(model.id, model.testPrompt, model.testSize);
      expect(job.job_id).toBeTruthy();

      const completedJob = await pollJobCompletion(job.job_id);
      expect(completedJob.status).toBe('completed');
      expect(completedJob.generation_id).toBeTruthy();

      // Verify in database
      verifyGenerationInDatabase(completedJob.generation_id);
    });
  });

  describe('qwen-image-edit (SERVER mode)', () => {
    const model = TEST_MODELS[1];

    it('should start the model server', async () => {
      const status = await getModelStatus(model.id);
      if (status && status.status === 'running') {
        return;
      }

      const result = await startModel(model.id);
      expect(result).toBeTruthy();

      await waitForModelRunning(model.id);
    });

    it('should generate image via queue', async () => {
      const job = await submitGenerationJob(model.id, model.testPrompt, model.testSize);
      expect(job.job_id).toBeTruthy();

      const completedJob = await pollJobCompletion(job.job_id);
      expect(completedJob.status).toBe('completed');
      expect(completedJob.generation_id).toBeTruthy();

      verifyGenerationInDatabase(completedJob.generation_id);
    });
  });

  describe('z-image-turbo (CLI mode)', () => {
    const model = TEST_MODELS[2];

    it('should generate image via CLI mode', async () => {
      // CLI mode doesn't require starting a server
      const job = await submitGenerationJob(model.id, model.testPrompt, model.testSize);
      expect(job.job_id).toBeTruthy();

      const completedJob = await pollJobCompletion(job.job_id);
      expect(completedJob.status).toBe('completed');
      expect(completedJob.generation_id).toBeTruthy();

      verifyGenerationInDatabase(completedJob.generation_id);
    });
  });

  describe('Queue Operations', () => {
    it('should handle multiple concurrent jobs', async () => {
      const model = TEST_MODELS[0]; // qwen-image

      // Submit 2 jobs concurrently
      const job1 = await submitGenerationJob(model.id, 'First image', '512x512');
      const job2 = await submitGenerationJob(model.id, 'Second image', '512x512');

      expect(job1.job_id).toBeTruthy();
      expect(job2.job_id).toBeTruthy();

      // Wait for both to complete
      const completed1 = await pollJobCompletion(job1.job_id);
      const completed2 = await pollJobCompletion(job2.job_id);

      expect(completed1.status).toBe('completed');
      expect(completed2.status).toBe('completed');
    });
  });

  describe('Model Management', () => {
    it('should stop a running model', async () => {
      const modelId = 'qwen-image';

      // Check if running
      const status = await getModelStatus(modelId);
      if (!status || status.status !== 'running') {
        return; // Not running, skip
      }

      // Stop the model
      const stopped = await stopModel(modelId);
      expect(stopped).toBe(true);

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify it's stopped
      const newStatus = await getModelStatus(modelId);
      expect(newStatus?.status).not.toBe('running');
    });
  });
});
