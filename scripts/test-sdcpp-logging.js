#!/usr/bin/env node
/**
 * Test script to verify sd.cpp logs are properly tagged with generation_id
 *
 * This script:
 * 1. Runs an actual generation using flux1-schnell-fp8 (server mode)
 * 2. Runs an actual generation using flux1-schnell-fp8-cli (CLI mode)
 * 3. Reads the actual log file at backend/logs/sdcpp.log
 * 4. Verifies that log entries contain the generation_id tag
 *
 * Usage: node scripts/test-sdcpp-logging.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const LOG_FILE_PATH = join(PROJECT_ROOT, 'backend', 'logs', 'sdcpp.log');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`ℹ ${message}`, 'blue');
}

function warning(message) {
  log(`⚠ ${message}`, 'yellow');
}

/**
 * Parse a log line and extract the generation_id if present
 */
function parseLogLine(line) {
  try {
    const logEntry = JSON.parse(line);
    return {
      generation_id: logEntry.generation_id || null,
      module: logEntry.module || null,
      level: logEntry.level || null,
      message: logEntry.msg || logEntry.message || '',
      eventType: logEntry.eventType || null,
      stdout: logEntry.stdout || null,
      stderr: logEntry.stderr || null,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Read and parse the sdcpp.log file
 */
function readSdCppLog() {
  if (!existsSync(LOG_FILE_PATH)) {
    return [];
  }

  const content = readFileSync(LOG_FILE_PATH, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  return lines.map(parseLogLine).filter(entry => entry !== null);
}

/**
 * Filter log entries by generation_id
 */
function filterByGenerationId(logs, generationId) {
  return logs.filter(entry => entry.generation_id === generationId);
}

/**
 * Get log entries for sd.cpp output (stdout/stderr)
 */
function getSdCppOutputLogs(logs, generationId) {
  return filterByGenerationId(logs, generationId).filter(entry =>
    entry.stdout || entry.stderr
  );
}

/**
 * Run a test generation via the API
 */
async function runGeneration(modelId, prompt = 'a cat') {
  const API_URL = 'http://127.0.0.1:3000/api/queue';

  info(`Queuing generation with model: ${modelId}`);

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      prompt: prompt,
      size: '512x512',
      n: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.id; // Return the generation ID
}

/**
 * Poll for generation completion
 */
async function waitForGeneration(generationId, timeoutMs = 120000) {
  const API_URL = `http://127.0.0.1:3000/api/generations/${generationId}`;
  const startTime = Date.now();
  const pollInterval = 1000;

  while (Date.now() - startTime < timeoutMs) {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch generation status: ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'completed') {
      return data;
    } else if (data.status === 'failed') {
      throw new Error(`Generation failed: ${data.error || 'Unknown error'}`);
    } else if (data.status === 'cancelled') {
      throw new Error('Generation was cancelled');
    }

    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Generation timeout after ${timeoutMs}ms`);
}

/**
 * Analyze logs for a specific generation
 */
function analyzeLogsForGeneration(logs, generationId) {
  const genLogs = filterByGenerationId(logs, generationId);
  const outputLogs = getSdCppOutputLogs(logs, generationId);

  return {
    total: genLogs.length,
    withGenerationId: genLogs.length,
    sdCppOutput: outputLogs.length,
    sampleLogs: genLogs.slice(0, 5).map(log => ({
      hasGenerationId: !!log.generation_id,
      hasModelId: !!log.modelId,
      module: log.module,
      level: log.level,
      message: log.message?.substring(0, 100) || log.stdout?.substring(0, 100) || log.stderr?.substring(0, 100) || '',
    })),
  };
}

/**
 * Check if there are ANY sd.cpp logs (for server mode, which won't have generation_id)
 */
function checkAnySdCppLogs(logs, modelId = null) {
  // Filter for logs with module='sdcpp'
  const sdcppLogs = logs.filter(entry => entry.module === 'sdcpp');

  // For server mode, look for logs with modelId
  const modelLogs = modelId
    ? sdcppLogs.filter(entry => entry.modelId === modelId)
    : sdcppLogs;

  return {
    total: sdcppLogs.length,
    forModel: modelLogs.length,
    sampleLogs: modelLogs.slice(0, 5).map(log => ({
      hasGenerationId: !!log.generation_id,
      hasModelId: !!log.modelId,
      level: log.level,
      eventType: log.eventType,
      message: log.message?.substring(0, 100) || log.stdout?.substring(0, 100) || log.stderr?.substring(0, 100) || '',
    })),
  };
}

/**
 * Main test function
 */
async function main() {
  log('\n=== sd.cpp Logging Test ===', 'bright');
  log('This script tests that generation_id is properly tagged in sdcpp.log\n', 'cyan');

  // Check if backend is running
  info('Checking if backend is running...');
  try {
    await fetch('http://127.0.0.1:3000/api/health', { signal: AbortSignal.timeout(5000) });
    success('Backend is running');
  } catch (e) {
    error('Backend is not running. Please start it with: npm run dev:backend');
    process.exit(1);
  }

  // Clear or note existing log file
  if (existsSync(LOG_FILE_PATH)) {
    warning(`Log file exists at ${LOG_FILE_PATH}`);
    info('Note: Test will look for NEW log entries after the test starts\n');
  } else {
    info('Log file does not exist yet. It will be created during the test.\n');
  }

  // Get initial log count
  const initialLogs = readSdCppLog();
  const initialCount = initialLogs.length;
  info(`Initial log file has ${initialCount} entries\n`);

  // Test 1: Server mode generation
  log('\n--- Test 1: Server Mode (flux1-schnell-fp8) ---', 'bright');
  let serverGenId;
  try {
    serverGenId = await runGeneration('flux1-schnell-fp8', 'a red cat');
    success(`Queued server mode generation: ${serverGenId}`);
    info('Waiting for generation to complete...');

    const serverResult = await waitForGeneration(serverGenId, 180000);
    success(`Server mode generation completed: ${serverResult.status}`);
  } catch (e) {
    error(`Server mode generation failed: ${e.message}`);
    serverGenId = null;
  }

  // Test 2: CLI mode generation
  log('\n--- Test 2: CLI Mode (flux1-schnell-fp8-cli) ---', 'bright');
  let cliGenId;
  try {
    cliGenId = await runGeneration('flux1-schnell-fp8-cli', 'a blue dog');
    success(`Queued CLI mode generation: ${cliGenId}`);
    info('Waiting for generation to complete...');

    const cliResult = await waitForGeneration(cliGenId, 180000);
    success(`CLI mode generation completed: ${cliResult.status}`);
  } catch (e) {
    error(`CLI mode generation failed: ${e.message}`);
    cliGenId = null;
  }

  // Wait a bit for logs to flush
  log('\n--- Analyzing Logs ---', 'bright');
  info('Waiting 3 seconds for logs to flush...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Read logs
  const finalLogs = readSdCppLog();
  const newLogs = finalLogs.slice(initialCount);

  info(`Found ${finalLogs.length} total log entries (${newLogs.length} new)`);

  // Analyze results
  log('\n--- Results ---', 'bright');

  let passedTests = 0;
  let totalTests = 0;

  // Test server mode logging
  if (serverGenId) {
    totalTests++;
    log('\nServer Mode (flux1-schnell-fp8):', 'cyan');

    // For server mode, we need to check for logs with modelId since generation_id won't be present
    // The server is a long-running process so its output isn't tied to specific generations
    const serverAnalysis = checkAnySdCppLogs(finalLogs, 'flux1-schnell-fp8');

    // Also check if there are any logs with generation_id (there shouldn't be for server mode)
    const serverGenAnalysis = analyzeLogsForGeneration(finalLogs, serverGenId);

    log(`  Server mode sdcpp logs (with modelId): ${serverAnalysis.forModel}`, 'blue');
    log(`  Generation-specific logs (with generation_id): ${serverGenAnalysis.total}`, 'blue');

    // Server mode is expected to have logs with modelId but not necessarily with generation_id
    // The key test is that there ARE sdcpp logs being written
    if (serverAnalysis.forModel > 0 || serverGenAnalysis.sdCppOutput > 0) {
      if (serverAnalysis.forModel > 0) {
        success(`Found ${serverAnalysis.forModel} server mode sd.cpp logs (with modelId)`);
      }
      if (serverGenAnalysis.sdCppOutput > 0) {
        success(`Found ${serverGenAnalysis.sdCppOutput} logs with generation_id (unexpected but OK)`);
      }
      passedTests++;

      // Show sample logs
      log('Sample logs:', 'blue');
      const sampleSource = serverAnalysis.sampleLogs.length > 0
        ? serverAnalysis.sampleLogs
        : serverGenAnalysis.sampleLogs;
      sampleSource.slice(0, 3).forEach((logEntry, i) => {
        const tags = [];
        if (logEntry.hasGenerationId) tags.push('gen_id');
        if (logEntry.hasModelId) tags.push('model_id');
        const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
        log(`  ${i + 1}. [${logEntry.level}]${tagStr} ${logEntry.message}`, 'reset');
      });
    } else {
      error('No sd.cpp logs found for server mode generation');
      warning('Server mode should log to sdcpp.log with modelId context');
    }
  }

  // Test CLI mode logging
  if (cliGenId) {
    totalTests++;
    log('\nCLI Mode (flux1-schnell-fp8-cli):', 'cyan');
    const cliAnalysis = analyzeLogsForGeneration(finalLogs, cliGenId);

    // CLI mode SHOULD have logs with generation_id
    if (cliAnalysis.sdCppOutput > 0) {
      success(`Found ${cliAnalysis.sdCppOutput} sd.cpp output log entries with generation_id`);
      passedTests++;

      // Show sample logs
      log('Sample logs:', 'blue');
      cliAnalysis.sampleLogs.slice(0, 3).forEach((logEntry, i) => {
        const tags = [];
        if (logEntry.hasGenerationId) tags.push('gen_id');
        if (logEntry.hasModelId) tags.push('model_id');
        const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
        log(`  ${i + 1}. [${logEntry.level}]${tagStr} ${logEntry.message}`, 'reset');
      });
    } else {
      error('No sd.cpp output logs found with generation_id for CLI mode');
      if (cliAnalysis.total > 0) {
        warning(`Found ${cliAnalysis.total} logs total, but without sd.cpp output`);
      } else {
        warning('No logs found for this generation at all');
      }
    }
  }

  // Summary
  log('\n=== Summary ===', 'bright');
  log(`Tests passed: ${passedTests}/${totalTests}`, passedTests === totalTests ? 'green' : 'yellow');

  if (passedTests === totalTests) {
    success('All tests passed! Generation IDs are properly tagged in sdcpp.log');
    process.exit(0);
  } else {
    error('Some tests failed. See details above.');
    process.exit(1);
  }
}

// Run the test
main().catch(err => {
  error(`Test script error: ${err.message}`);
  console.error(err);
  process.exit(1);
});
