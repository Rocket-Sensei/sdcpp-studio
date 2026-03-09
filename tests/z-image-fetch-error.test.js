/**
 * Test for z-image model fetch timeout handling
 * This test reproduces the issue where fetch fails with "logger is not defined"
 * 
 * This test requires GPU and model files, so it's skipped in CI
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer } from './helpers/testServer.js';
import { existsSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '../..');

// Test-specific database path
const TEST_DB_PATH = path.join(PROJECT_ROOT, 'backend/data/test-z-image.db');
process.env.DB_PATH = TEST_DB_PATH;

// Test-specific images directories
const TEST_IMAGES_DIR = path.join(PROJECT_ROOT, 'backend/data/test-z-image-images');
const TEST_INPUT_DIR = path.join(PROJECT_ROOT, 'backend/data/test-z-image-input');
process.env.IMAGES_DIR = TEST_IMAGES_DIR;
process.env.INPUT_DIR = TEST_INPUT_DIR;

const API_URL = `http://127.0.0.1:${process.env.TEST_PORT || 3999}`;

// Skip in CI environments since we need GPU and model files
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const testSuite = isCI ? describe.skip : describe;

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

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`Failed to submit job: ${response.statusText} - ${JSON.stringify(data)}`);
  }

  return data;
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
      return job; // Return failed job for inspection
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error(`Job ${jobId} timed out`);
}

testSuite('z-image Model Generation Test', () => {
  beforeAll(async () => {
    await startServer();
  });

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

  it('should handle z-image generation without logger undefined error', async () => {
    // Submit a generation job
    const job = await submitGenerationJob(
      'z-image',
      'A simple test image for debugging',
      '512x512'
    );

    expect(job.job_id).toBeDefined();
    expect(job.status).toBe('pending');

    // Poll for job completion
    const completedJob = await pollJobCompletion(job.job_id, 120000);

    // Check the job status
    if (completedJob.status === 'failed') {
      // Check if it's the specific logger error we're testing for
      if (completedJob.error && completedJob.error.includes('logger is not defined')) {
        throw new Error(`Logger undefined error detected: ${completedJob.error}`);
      }
      
      // Other errors are expected if model files are missing
      // but the test passes if we don't see the logger error
      expect(completedJob.error).not.toContain('logger is not defined');
    } else {
      // If completed successfully, verify the result
      expect(completedJob.status).toBe('completed');
      
      // Verify in database
      const db = new Database(TEST_DB_PATH, { readonly: true });
      const generation = db.prepare('SELECT * FROM generations WHERE id = ?').get(job.job_id);
      expect(generation).toBeTruthy();
      db.close();
    }
  }, 130000);
});
