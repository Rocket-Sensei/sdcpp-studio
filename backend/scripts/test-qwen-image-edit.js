#!/usr/bin/env node
/**
 * Test script for qwen-image-edit model only
 */

import { existsSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';

const CONFIG = {
  backendUrl: 'http://127.0.0.1:3000',
  pollInterval: 3000,
  maxPollTime: 300000,
  serverStartupTimeout: 60000,
};

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkBackendHealth() {
  log('Checking backend server health...', 'blue');
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/health`);
    if (response.ok) {
      const data = await response.json();
      log(`Backend is healthy: ${data.status}`, 'green');
      return true;
    }
    return false;
  } catch (error) {
    log(`Backend health check failed: ${error.message}`, 'red');
    return false;
  }
}

async function getModelStatus(modelId) {
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/models/${modelId}/status`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    log(`Error getting model status: ${error.message}`, 'red');
    return null;
  }
}

async function startModelServer(modelId) {
  log(`Starting model server: ${modelId}...`, 'blue');
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/models/${modelId}/start`, {
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();
      log(`Model ${modelId} start initiated: ${data.message}`, 'green');

      const startTime = Date.now();
      while (Date.now() - startTime < CONFIG.serverStartupTimeout) {
        await new Promise(r => setTimeout(r, 3000));

        const status = await getModelStatus(modelId);
        if (status && status.status === 'running') {
          log(`Model ${modelId} is now running on port ${status.port}`, 'green');
          return true;
        }

        if (status && status.status === 'error') {
          log(`Model ${modelId} failed to start: ${status.error || 'Unknown error'}`, 'red');
          return false;
        }
      }

      log(`Model ${modelId} startup timed out`, 'yellow');
      return false;
    } else {
      const error = await response.json();
      log(`Failed to start model: ${error.error}`, 'red');
      return false;
    }
  } catch (error) {
    log(`Error starting model server: ${error.message}`, 'red');
    if (error.cause) {
      log(`  Cause: ${error.cause}`, 'red');
    }
    return false;
  }
}

async function stopModelServer(modelId) {
  log(`Stopping model server: ${modelId}...`, 'blue');
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/models/${modelId}/stop`, {
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();
      log(`Model ${modelId} stopped: ${data.message}`, 'green');
      return true;
    } else {
      const error = await response.json();
      log(`Failed to stop model: ${error.error}`, 'yellow');
      return false;
    }
  } catch (error) {
    log(`Error stopping model server: ${error.message}`, 'yellow');
    return false;
  }
}

async function submitGenerationRequest(modelId, prompt, size = '1024x1024') {
  log(`Submitting generation request for model: ${modelId}...`, 'blue');
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/queue/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        prompt: prompt,
        size: size,
        n: 1,
        quality: 'medium'
      })
    });

    if (response.ok) {
      const data = await response.json();
      log(`Generation request submitted: job_id=${data.job_id}`, 'green');
      return data.job_id;
    } else {
      const error = await response.text();
      log(`Failed to submit generation: ${error}`, 'red');
      return null;
    }
  } catch (error) {
    log(`Error submitting generation: ${error.message}`, 'red');
    if (error.cause) {
      log(`  Cause: ${error.cause}`, 'red');
    }
    return null;
  }
}

async function pollJobStatus(jobId) {
  log(`Polling job status for: ${jobId}...`, 'blue');

  const startTime = Date.now();
  let lastProgress = -1;

  while (Date.now() - startTime < CONFIG.maxPollTime) {
    try {
      const response = await fetch(`${CONFIG.backendUrl}/api/queue/${jobId}`);
      if (!response.ok) {
        log(`Failed to get job status`, 'red');
        return { success: false, job: null };
      }

      const job = await response.json();

      if (job.progress !== undefined && job.progress !== lastProgress) {
        log(`  Progress: ${Math.round(job.progress * 100)}%`, 'cyan');
        lastProgress = job.progress;
      }

      if (job.status === 'completed') {
        log(`Job ${jobId} completed`, 'green');
        return { success: true, job };
      } else if (job.status === 'failed') {
        log(`Job ${jobId} failed: ${job.error || 'Unknown error'}`, 'red');
        return { success: false, job };
      } else if (job.status === 'cancelled') {
        log(`Job ${jobId} was cancelled`, 'yellow');
        return { success: false, job };
      }

      await new Promise(r => setTimeout(r, CONFIG.pollInterval));
    } catch (error) {
      log(`Error polling job status: ${error.message}`, 'red');
      if (error.cause) {
        log(`  Cause: ${error.cause}`, 'red');
      }
      await new Promise(r => setTimeout(r, CONFIG.pollInterval));
    }
  }

  log(`Job ${jobId} timed out after ${CONFIG.maxPollTime}ms`, 'red');
  return { success: false, job: null };
}

async function main() {
  log('\n' + colors.bold + colors.blue + '='.repeat(60) + colors.reset);
  log(colors.bold + colors.blue + '  Qwen Image Edit Full Workflow Test' + colors.reset);
  log(colors.bold + colors.blue + '='.repeat(60) + colors.reset + '\n');

  // Check backend health
  const backendHealthy = await checkBackendHealth();
  if (!backendHealthy) {
    log('Backend server is not running or not healthy!', 'red');
    process.exit(1);
  }

  const modelId = 'qwen-image-edit';
  const testPrompt = 'A futuristic cityscape with flying cars';

  // Check if model is already running
  log(`Checking if ${modelId} is already running...`, 'blue');
  const initialStatus = await getModelStatus(modelId);
  if (initialStatus && initialStatus.status === 'running') {
    log(`Model ${modelId} is already running, stopping it first...`, 'yellow');
    await stopModelServer(modelId);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Start model server
  log('\n=== Step 1: Starting Model Server ===', 'cyan');
  const serverStarted = await startModelServer(modelId);
  if (!serverStarted) {
    log('TEST FAILED: Could not start model server', 'red');
    process.exit(1);
  }

  try {
    // Submit generation request
    log('\n=== Step 2: Submitting Generation Request ===', 'cyan');
    const jobId = await submitGenerationRequest(modelId, testPrompt, '1024x1024');

    if (!jobId) {
      log('TEST FAILED: Could not submit generation request', 'red');
      process.exit(1);
    }

    // Poll job status
    log('\n=== Step 3: Polling Job Status ===', 'cyan');
    const pollResult = await pollJobStatus(jobId);

    if (!pollResult.success || !pollResult.job) {
      log('TEST FAILED: Job failed or timed out', 'red');
      process.exit(1);
    }

    // Success!
    log('\n=== TEST PASSED ===', 'green');
    log(`Job ${jobId} completed successfully`, 'green');
    log(`Generation ID: ${pollResult.job.generation_id}`, 'cyan');

    process.exit(0);
  } finally {
    // Cleanup: Stop server
    log('\n=== Cleanup: Stopping Model Server ===', 'cyan');
    await stopModelServer(modelId);
  }
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
