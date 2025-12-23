#!/usr/bin/env node
/**
 * Full Workflow Test Suite
 *
 * Comprehensive end-to-end testing for the SD WebUI image generation pipeline.
 * Tests the complete flow from API call to image saved on disk.
 *
 * Usage:
 *   node backend/scripts/test-full-workflow.js
 *
 * Test Models:
 *   - qwen-image (server mode, port 1236)
 *   - qwen-image-edit (server mode, port 1237)
 *   - z-image-turbo (CLI mode)
 *
 * Requirements:
 *   - Backend server running on localhost:3000
 *   - Model files present (test will skip if not)
 *   - better-sqlite3 for database verification
 */

import { existsSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

// Test configuration
const CONFIG = {
  backendUrl: 'http://127.0.0.1:3000',
  apiGenerate: '/api/queue/generate',
  apiQueue: '/api/queue',
  apiQueueStatus: '/api/queue/stats',
  apiModels: '/api/models',
  apiModelStatus: '/api/models',
  dbPath: resolve(dirname(fileURLToPath(import.meta.url)), '../data/sd-webui.db'),
  imagesDir: resolve(dirname(fileURLToPath(import.meta.url)), '../data/images'),
  projectRoot: resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  pollInterval: 2000, // ms
  maxPollTime: 300000, // 5 minutes max per generation
  serverStartupTimeout: 60000, // 60 seconds for server to start
};

// Test models configuration
const TEST_MODELS = [
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    execMode: 'server',
    port: 1236,
    requiredFiles: [
      'Qwen_Image-Q4_K_M.gguf',
      'qwen_image_vae.safetensors',
      'Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf'
    ],
    testPrompt: 'A serene landscape with mountains and a lake at sunset',
    testSize: '1024x1024'
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    execMode: 'server',
    port: 1237,
    requiredFiles: [
      'Qwen-Image-Edit-2509-Q4_K_M.gguf',
      'qwen_image_vae.safetensors',
      'Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf'
    ],
    testPrompt: 'A futuristic cityscape with flying cars',
    testSize: '1024x1024'
  },
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    execMode: 'cli',
    requiredFiles: [
      'z_image_turbo-Q8_0.gguf',
      'ae.safetensors',
      'Qwen3-4B-Instruct-2507-Q8_0.gguf'
    ],
    testPrompt: 'A cute robot holding a flower',
    testSize: '1024x1024'
  }
];

// Test results tracking
const testResults = {
  passed: [],
  failed: [],
  skipped: [],
  warnings: []
};

/**
 * Color logging utilities
 */
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(title) {
  console.log('\n' + colors.bold + colors.blue + '═'.repeat(70) + colors.reset);
  console.log(colors.bold + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.bold + colors.blue + '═'.repeat(70) + colors.reset + '\n');
}

function printSubheader(title) {
  console.log('\n' + colors.bold + colors.cyan + `── ${title}` + colors.reset);
}

function printTestResult(testName, passed, message = '') {
  const status = passed ? colors.green + 'PASS' : colors.red + 'FAIL';
  const symbol = passed ? '✓' : '✗';
  log(`  ${symbol} ${testName}: ${status}${message ? ' - ' + message : ''}`, passed ? 'green' : 'red');
}

/**
 * Check if backend server is running
 */
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

/**
 * Check if model files exist on disk
 */
function checkModelFiles(modelConfig) {
  const fileStatus = [];
  let allPresent = true;

  for (const fileName of modelConfig.requiredFiles) {
    // Check in multiple possible locations
    const possiblePaths = [
      resolve(CONFIG.projectRoot, 'models', fileName),
      resolve(CONFIG.projectRoot, fileName),
      resolve(CONFIG.projectRoot, 'models', basename(fileName))
    ];

    let found = false;
    for (const filePath of possiblePaths) {
      if (existsSync(filePath)) {
        fileStatus.push({ fileName, filePath, exists: true });
        found = true;
        break;
      }
    }

    if (!found) {
      fileStatus.push({ fileName, filePath: null, exists: false });
      allPresent = false;
    }
  }

  return { fileStatus, allPresent };
}

/**
 * Get model status from backend API
 */
async function getModelStatus(modelId) {
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/models/${modelId}/status`);
    if (response.ok) {
      return await response.json();
    }
    return null;
  } catch (error) {
    log(`Error getting model status: ${error.message}`, 'red');
    if (error.cause) {
      log(`  Cause: ${error.cause}`, 'red');
    }
    return null;
  }
}

/**
 * Get list of running models
 */
async function getRunningModels() {
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/models/running`);
    if (response.ok) {
      const data = await response.json();
      return data.models || [];
    }
    return [];
  } catch (error) {
    log(`Error getting running models: ${error.message}`, 'red');
    return [];
  }
}

/**
 * Start a model server
 */
async function startModelServer(modelId) {
  log(`Starting model server: ${modelId}...`, 'blue');
  try {
    const response = await fetch(`${CONFIG.backendUrl}/api/models/${modelId}/start`, {
      method: 'POST'
    });

    if (response.ok) {
      const data = await response.json();
      log(`Model ${modelId} start initiated: ${data.message}`, 'green');

      // Wait for server to be ready
      const startTime = Date.now();
      while (Date.now() - startTime < CONFIG.serverStartupTimeout) {
        await new Promise(r => setTimeout(r, 2000));

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

/**
 * Stop a model server
 */
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

/**
 * Submit a generation request
 */
async function submitGenerationRequest(modelId, prompt, size = '1024x1024') {
  log(`Submitting generation request for model: ${modelId}...`, 'blue');
  try {
    const response = await fetch(`${CONFIG.backendUrl}${CONFIG.apiGenerate}`, {
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
    return null;
  }
}

/**
 * Poll job status until completion
 */
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

      // Log progress updates
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

      // Wait before next poll
      await new Promise(r => setTimeout(r, CONFIG.pollInterval));
    } catch (error) {
      log(`Error polling job status: ${error.message}`, 'red');
      await new Promise(r => setTimeout(r, CONFIG.pollInterval));
    }
  }

  log(`Job ${jobId} timed out after ${CONFIG.maxPollTime}ms`, 'red');
  return { success: false, job: null };
}

/**
 * Verify generation record in database
 */
function verifyGenerationRecord(generationId) {
  log(`Verifying generation record in database: ${generationId}...`, 'blue');

  try {
    const db = new Database(CONFIG.dbPath, { readonly: true });

    // Check generations table
    const genStmt = db.prepare('SELECT * FROM generations WHERE id = ?');
    const generation = genStmt.get(generationId);

    if (!generation) {
      log(`Generation record not found in database`, 'red');
      db.close();
      return { success: false, data: null };
    }

    log(`  Found generation record: id=${generation.id}, model=${generation.model}`, 'cyan');

    // Check generated_images table
    const imagesStmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ?');
    const images = imagesStmt.all(generationId);

    if (images.length === 0) {
      log(`No images found for generation`, 'red');
      db.close();
      return { success: false, data: generation };
    }

    log(`  Found ${images.length} image(s) in database`, 'cyan');

    db.close();
    return { success: true, data: { generation, images } };
  } catch (error) {
    log(`Error verifying generation record: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

/**
 * Verify image file exists on disk
 */
function verifyImageFile(imagePath) {
  log(`Verifying image file on disk: ${imagePath}...`, 'blue');

  if (existsSync(imagePath)) {
    log(`  Image file exists`, 'green');
    return { success: true, path: imagePath };
  } else {
    log(`  Image file NOT found`, 'red');
    return { success: false, path: imagePath };
  }
}

/**
 * Run a single model test
 */
async function runModelTest(modelConfig) {
  printSubheader(`Testing Model: ${modelConfig.name} (${modelConfig.id})`);

  const testSteps = [];
  let shouldContinue = true;

  // Step 1: Check file status
  log('Step 1: Checking model file status...', 'blue');
  const { fileStatus, allPresent } = checkModelFiles(modelConfig);

  for (const file of fileStatus) {
    const status = file.exists ? colors.green + 'PRESENT' : colors.red + 'ABSENT';
    log(`  ${file.fileName}: ${status}`, file.exists ? 'green' : 'red');
  }

  if (!allPresent) {
    log(`Model ${modelConfig.id} files incomplete - SKIPPING TEST`, 'yellow');
    testResults.skipped.push({
      model: modelConfig.id,
      reason: 'Model files not present'
    });
    return { success: false, skipped: true, reason: 'Model files not present' };
  }
  testSteps.push({ name: 'File Status Check', passed: true });

  // Step 2: Check CLI binary exists (for CLI mode)
  if (modelConfig.execMode === 'cli') {
    log('Step 2: Checking CLI binary...', 'blue');
    const cliPath = resolve(CONFIG.projectRoot, 'bin/sd-cli');
    if (!existsSync(cliPath)) {
      log(`CLI binary not found at ${cliPath} - SKIPPING TEST`, 'yellow');
      testResults.skipped.push({
        model: modelConfig.id,
        reason: 'CLI binary not found'
      });
      return { success: false, skipped: true, reason: 'CLI binary not found' };
    }
    log(`  CLI binary found`, 'green');
    testSteps.push({ name: 'CLI Binary Check', passed: true });
  }

  // Step 3: Start model server (for server mode)
  let serverStarted = false;
  if (modelConfig.execMode === 'server') {
    log('Step 3: Starting model server...', 'blue');

    // Check if already running
    const initialStatus = await getModelStatus(modelConfig.id);
    if (initialStatus && initialStatus.status === 'running') {
      log(`  Model already running on port ${initialStatus.port}`, 'yellow');
      testResults.warnings.push({
        model: modelConfig.id,
        message: 'Model was already running'
      });
      serverStarted = true;
    } else {
      serverStarted = await startModelServer(modelConfig.id);
      if (!serverStarted) {
        log(`Failed to start model server - TEST FAILED`, 'red');
        testSteps.push({ name: 'Start Model Server', passed: false });
        testResults.failed.push({
          model: modelConfig.id,
          step: 'Start Model Server',
          reason: 'Failed to start server'
        });
        return { success: false, steps: testSteps };
      }
    }
    testSteps.push({ name: 'Start Model Server', passed: true });
  }

  try {
    // Step 4: Submit generation request
    log('Step 4: Submitting generation request...', 'blue');
    const jobId = await submitGenerationRequest(
      modelConfig.id,
      modelConfig.testPrompt,
      modelConfig.testSize
    );

    if (!jobId) {
      log(`Failed to submit generation request - TEST FAILED`, 'red');
      testSteps.push({ name: 'Submit Generation', passed: false });
      testResults.failed.push({
        model: modelConfig.id,
        step: 'Submit Generation',
        reason: 'Failed to submit request'
      });
      return { success: false, steps: testSteps };
    }
    testSteps.push({ name: 'Submit Generation', passed: true });

    // Step 5: Poll job status
    log('Step 5: Polling job status...', 'blue');
    const pollResult = await pollJobStatus(jobId);

    if (!pollResult.success || !pollResult.job) {
      log(`Job failed or timed out - TEST FAILED`, 'red');
      testSteps.push({ name: 'Poll Job Status', passed: false });
      testResults.failed.push({
        model: modelConfig.id,
        step: 'Poll Job Status',
        reason: pollResult.job?.error || 'Job failed or timed out'
      });
      return { success: false, steps: testSteps };
    }
    testSteps.push({ name: 'Poll Job Status', passed: true });

    // Step 6: Verify database record
    log('Step 6: Verifying database record...', 'blue');
    const generationId = pollResult.job.generation_id;

    if (!generationId) {
      log(`No generation_id in completed job - TEST FAILED`, 'red');
      testSteps.push({ name: 'Verify Database Record', passed: false });
      testResults.failed.push({
        model: modelConfig.id,
        step: 'Verify Database Record',
        reason: 'No generation_id in job'
      });
      return { success: false, steps: testSteps };
    }

    const dbResult = verifyGenerationRecord(generationId);
    if (!dbResult.success) {
      log(`Database verification failed - TEST FAILED`, 'red');
      testSteps.push({ name: 'Verify Database Record', passed: false });
      testResults.failed.push({
        model: modelConfig.id,
        step: 'Verify Database Record',
        reason: dbResult.error || 'Generation record not found'
      });
      return { success: false, steps: testSteps };
    }
    testSteps.push({ name: 'Verify Database Record', passed: true });

    // Step 7: Verify image file exists
    log('Step 7: Verifying image file...', 'blue');
    const imageData = dbResult.data.images[0];
    const imageFileResult = verifyImageFile(imageData.file_path);

    if (!imageFileResult.success) {
      log(`Image file verification failed - TEST FAILED`, 'red');
      testSteps.push({ name: 'Verify Image File', passed: false });
      testResults.failed.push({
        model: modelConfig.id,
        step: 'Verify Image File',
        reason: `Image file not found at ${imageData.file_path}`
      });
      return { success: false, steps: testSteps };
    }
    testSteps.push({ name: 'Verify Image File', passed: true });

    // All tests passed!
    log(`All tests PASSED for ${modelConfig.id}`, 'green');
    testResults.passed.push({
      model: modelConfig.id,
      jobId,
      generationId,
      imagePath: imageData.file_path
    });

    return { success: true, steps: testSteps, data: { jobId, generationId, imagePath: imageData.file_path } };

  } finally {
    // Cleanup: Stop server if we started it
    if (modelConfig.execMode === 'server' && serverStarted) {
      log('Cleanup: Stopping model server...', 'blue');
      await stopModelServer(modelConfig.id);
    }
  }
}

/**
 * Print detailed test report
 */
function printTestReport() {
  printHeader('Test Report Summary');

  // Overall status
  const totalTests = TEST_MODELS.length;
  const passed = testResults.passed.length;
  const failed = testResults.failed.length;
  const skipped = testResults.skipped.length;

  log(`Total Models: ${totalTests}`, 'white');
  log(`Passed: ${colors.green}${passed}${colors.reset}`);
  log(`Failed: ${colors.red}${failed}${colors.reset}`);
  log(`Skipped: ${colors.yellow}${skipped}${colors.reset}`);

  // Passed tests
  if (testResults.passed.length > 0) {
    printSubheader('Passed Tests');
    for (const result of testResults.passed) {
      log(`  ✓ ${result.model}`, 'green');
      log(`    Job ID: ${result.jobId}`, 'gray');
      log(`    Generation ID: ${result.generationId}`, 'gray');
      log(`    Image Path: ${result.imagePath}`, 'gray');
    }
  }

  // Failed tests
  if (testResults.failed.length > 0) {
    printSubheader('Failed Tests');
    for (const result of testResults.failed) {
      log(`  ✗ ${result.model}`, 'red');
      log(`    Step: ${result.step}`, 'gray');
      log(`    Reason: ${result.reason}`, 'gray');
    }
  }

  // Skipped tests
  if (testResults.skipped.length > 0) {
    printSubheader('Skipped Tests');
    for (const result of testResults.skipped) {
      log(`  ○ ${result.model}`, 'yellow');
      log(`    Reason: ${result.reason}`, 'gray');
    }
  }

  // Warnings
  if (testResults.warnings.length > 0) {
    printSubheader('Warnings');
    for (const warning of testResults.warnings) {
      log(`  ! ${warning.model}: ${warning.message}`, 'yellow');
    }
  }

  // Exit code
  const allPassedOrSkipped = failed === 0;
  printHeader(allPassedOrSkipped ? 'All Tests Passed!' : 'Some Tests Failed');
  return allPassedOrSkipped ? 0 : 1;
}

/**
 * Main test execution
 */
async function main() {
  printHeader('SD WebUI Full Workflow Test Suite');

  log('Configuration:', 'blue');
  log(`  Backend URL: ${CONFIG.backendUrl}`, 'gray');
  log(`  Database: ${CONFIG.dbPath}`, 'gray');
  log(`  Images Dir: ${CONFIG.imagesDir}`, 'gray');
  log(`  Project Root: ${CONFIG.projectRoot}`, 'gray');

  // Check backend health
  printSubheader('Prerequisites Check');
  const backendHealthy = await checkBackendHealth();
  if (!backendHealthy) {
    log('Backend server is not running or not healthy!', 'red');
    log('Please start the backend server first:', 'yellow');
    log('  node backend/server.js', 'cyan');
    process.exit(1);
  }

  // Check database
  log('Checking database...', 'blue');
  if (!existsSync(CONFIG.dbPath)) {
    log(`Database not found at ${CONFIG.dbPath}`, 'red');
    log('The backend server will create the database on first run.', 'yellow');
  } else {
    log(`Database found`, 'green');
  }

  // Check images directory
  log('Checking images directory...', 'blue');
  if (!existsSync(CONFIG.imagesDir)) {
    log(`Images directory not found at ${CONFIG.imagesDir}`, 'yellow');
    log('The backend server will create this directory on first run.', 'gray');
  } else {
    log(`Images directory found`, 'green');
  }

  // Run tests for each model
  printSubheader('Running Tests');

  for (const modelConfig of TEST_MODELS) {
    try {
      await runModelTest(modelConfig);
    } catch (error) {
      log(`Unexpected error testing ${modelConfig.id}: ${error.message}`, 'red');
      console.error(error);
      testResults.failed.push({
        model: modelConfig.id,
        step: 'Unexpected Error',
        reason: error.message
      });
    }
  }

  // Print final report and exit
  const exitCode = printTestReport();
  process.exit(exitCode);
}

// Run the tests
main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
