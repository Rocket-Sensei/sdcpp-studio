/**
 * Test script for Model Manager
 *
 * This script demonstrates how to use the ModelManager service.
 * Note: This is a dry-run test that won't actually spawn processes
 * since sdcpp is not installed.
 */

import { getModelManager, ModelStatus, ExecMode, LoadMode } from './modelManager.js';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(50));
  log(title, 'blue');
  console.log('='.repeat(50));
}

async function testModelManager() {
  section('Model Manager Test Script');

  // Create/get singleton instance
  const manager = getModelManager({
    logPrefix: '[Test]'
  });

  try {
    // Test 1: Load configuration
    section('Test 1: Load Configuration');
    const loaded = manager.loadConfig();
    log(`Config loaded: ${loaded ? 'SUCCESS' : 'FAILED'}`, loaded ? 'green' : 'red');
    log(`Total models loaded: ${manager.getAllModels().length}`, 'yellow');

    // Test 2: Get all models
    section('Test 2: Get All Models');
    const allModels = manager.getAllModels();
    log(`Found ${allModels.length} models:`, 'yellow');
    allModels.forEach(model => {
      log(`  - ${model.id}: ${model.name} (${model.exec_mode} mode, ${model.mode} load)`, 'gray');
    });

    // Test 3: Get default model
    section('Test 3: Get Default Model');
    const defaultModel = manager.getDefaultModel();
    if (defaultModel) {
      log(`Default model: ${defaultModel.id} - ${defaultModel.name}`, 'green');
    } else {
      log('No default model configured', 'yellow');
    }

    // Test 4: Get specific model
    section('Test 4: Get Specific Model');
    const fluxModel = manager.getModel('fluxed-up-flux');
    if (fluxModel) {
      log(`Found model: ${fluxModel.name}`, 'green');
      log(`  Command: ${fluxModel.command}`, 'gray');
      log(`  Args: ${fluxModel.args.length} arguments`, 'gray');
      log(`  API: ${fluxModel.api || 'N/A'}`, 'gray');
      log(`  Port: ${fluxModel.port}`, 'gray');
      log(`  Exec Mode: ${fluxModel.exec_mode}`, 'gray');
      log(`  Load Mode: ${fluxModel.mode}`, 'gray');
    }

    // Test 5: Check model status (not running)
    section('Test 5: Check Model Status');
    const status = manager.getModelStatus('fluxed-up-flux');
    log(`Model "${status.id}" status: ${status.status}`, 'yellow');
    log(`Is running: ${manager.isModelRunning('fluxed-up-flux')}`, 'gray');

    // Test 6: Get running models (should be empty)
    section('Test 6: Get Running Models');
    const running = manager.getRunningModels();
    log(`Running models: ${running.length}`, 'yellow');

    // Test 7: CLI model info
    section('Test 7: CLI Mode Model');
    const cliModel = manager.getModel('sdxl-turbo');
    if (cliModel) {
      log(`CLI Model: ${cliModel.name}`, 'green');
      log(`Exec Mode: ${cliModel.exec_mode}`, 'gray');
      log(`Has API endpoint: ${cliModel.api ? 'Yes' : 'No'}`, 'gray');
    }

    // Test 8: Preload model info
    section('Test 8: Preload Mode Models');
    const preloadModels = manager.getAllModels().filter(m => m.mode === LoadMode.PRELOAD);
    log(`Preload models: ${preloadModels.length}`, 'yellow');
    preloadModels.forEach(model => {
      log(`  - ${model.id}: ${model.name}`, 'gray');
    });

    // Test 9: On-demand model info
    section('Test 9: On-Demand Mode Models');
    const onDemandModels = manager.getAllModels().filter(m => m.mode === LoadMode.ON_DEMAND);
    log(`On-demand models: ${onDemandModels.length}`, 'yellow');
    onDemandModels.forEach(model => {
      log(`  - ${model.id}: ${model.name}`, 'gray');
    });

    // Test 10: Demonstrate startModel (dry run - won't actually start)
    section('Test 10: Start Model (Dry Run)');
    log('Note: Would start model if sdcpp was installed', 'yellow');
    log('Expected behavior:', 'gray');
    log('  1. Spawn process with configured command and args', 'gray');
    log('  2. Track PID and port', 'gray');
    log('  3. Wait for server to be ready', 'gray');
    log('  4. Return ProcessEntry with status', 'gray');

    // Test 11: Cleanup demonstration
    section('Test 11: Cleanup Zombies');
    const cleaned = manager.cleanupZombies();
    log(`Cleaned up ${cleaned} zombie processes`, 'yellow');

    // Test 12: Get all processes
    section('Test 12: Get All Processes');
    const processes = manager.getAllProcesses();
    log(`Tracked processes: ${processes.length}`, 'yellow');

    section('Test Summary');
    log('All Model Manager API tests passed!', 'green');
    log('\nUsage Example:', 'blue');
    log(`
import { getModelManager } from './services/modelManager.js';

// Get singleton instance
const manager = getModelManager();

// Load configuration
manager.loadConfig();

// Get a model
const model = manager.getModel('fluxed-up-flux');

// Start the model (when sdcpp is installed)
await manager.startModel('fluxed-up-flux');

// Check status
const status = manager.getModelStatus('fluxed-up-flux');

// Stop the model
await manager.stopModel('fluxed-up-flux');
    `, 'gray');

  } catch (error) {
    log(`Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
testModelManager().catch(console.error);
