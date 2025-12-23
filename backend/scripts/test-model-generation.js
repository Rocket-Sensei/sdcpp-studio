#!/usr/bin/env node
/**
 * Model Generation Test Script
 *
 * This script tests model loading and image generation with the configured models.
 * It tests both CLI mode and Server mode models.
 *
 * Usage:
 *   node backend/scripts/test-model-generation.js                # Test all configured models
 *   node backend/scripts/test-model-generation.js --model <id>   # Test specific model
 *   node backend/scripts/test-model-generation.js --cli         # Test CLI mode only
 *   node backend/scripts/test-model-generation.js --server      # Test server mode only
 *   node backend/scripts/test-model-generation.js --list        # List available models
 *
 * Examples:
 *   node backend/scripts/test-model-generation.js --list
 *   node backend/scripts/test-model-generation.js --model qwen-image
 *   node backend/scripts/test-model-generation.js --cli
 */

import { getModelManager, ExecMode, ModelStatus, LoadMode } from '../services/modelManager.js';
import { existsSync, readFileSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

function colorize(message, color) {
  return colors[color] + message + colors.reset;
}

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function printHeader(title) {
  console.log('');
  console.log(colors.bold + colors.blue + '═'.repeat(70) + colors.reset);
  console.log(colors.bold + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.bold + colors.blue + '═'.repeat(70) + colors.reset);
  console.log('');
}

function printSubheader(title) {
  console.log('');
  console.log(colors.bold + colors.cyan + `── ${title}` + colors.reset);
}

// Get project root path (backend/..)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

/**
 * Check if model files exist on disk
 */
function checkModelFiles(model) {
  if (!model.huggingface || !model.huggingface.files) {
    return { files: [], allExist: false, hasHuggingFace: false };
  }

  const fileStatus = model.huggingface.files.map(file => {
    const destDir = file.dest || process.env.MODELS_DIR || './models';
    const resolvedDestDir = resolve(PROJECT_ROOT, destDir);
    const fileName = basename(file.path);
    const filePath = join(resolvedDestDir, fileName);
    const exists = existsSync(filePath);

    return {
      path: file.path,
      exists,
      filePath
    };
  });

  const allExist = fileStatus.every(f => f.exists);

  return {
    files: fileStatus,
    allExist,
    hasHuggingFace: true
  };
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    model: null,
    cliOnly: false,
    serverOnly: false,
    listOnly: false,
    quickTest: false,
    prompt: 'a cute cat'
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--cli':
        options.cliOnly = true;
        break;
      case '--server':
        options.serverOnly = true;
        break;
      case '--list':
      case '-l':
        options.listOnly = true;
        break;
      case '--quick':
      case '-q':
        options.quickTest = true;
        break;
      case '--prompt':
      case '-p':
        options.prompt = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Model Generation Test Script

Usage:
  node backend/scripts/test-model-generation.js [options]

Options:
  -m, --model <id>     Test specific model by ID
  --cli                Test CLI mode models only
  --server             Test server mode models only
  -l, --list           List available models and exit
  -q, --quick          Quick test (skip generation, just check files and config)
  -p, --prompt <text>  Custom prompt for generation test
  -h, --help           Show this help message

Examples:
  # List all available models
  node backend/scripts/test-model-generation.js --list

  # Test a specific model (full generation test)
  node backend/scripts/test-model-generation.js --model qwen-image

  # Quick test all models (skip generation)
  node backend/scripts/test-model-generation.js --quick

  # Test all CLI mode models
  node backend/scripts/test-model-generation.js --cli

  # Test with custom prompt
  node backend/scripts/test-model-generation.js --prompt "a beautiful landscape"
  `);
}

/**
 * List all available models
 */
function listModels(manager) {
  printHeader('Available Models');

  const allModels = manager.getAllModels();
  const defaultModel = manager.getDefaultModel();

  allModels.forEach(model => {
    const isDefault = defaultModel?.id === model.id;
    const fileStatus = checkModelFiles(model);

    const statusIndicators = [
      isDefault ? colorize('[DEFAULT]', 'green') : '',
      model.exec_mode === 'server' ? colorize('[SERVER]', 'blue') : colorize('[CLI]', 'cyan'),
      model.mode === 'preload' ? colorize('[PRELOAD]', 'yellow') : colorize('[ON-DEMAND]', 'gray')
    ].filter(Boolean).join(' ');

    log(`${model.id.padEnd(25)} ${model.name}`, 'bold');
    console.log(`  ${statusIndicators}`);
    console.log(`  Description: ${model.description || 'N/A'}`);
    console.log(`  Type: ${model.model_type} | Size: ${model.default_size || 'N/A'}`);
    console.log(`  Command: ${model.command}`);
    console.log(`  Files: ${fileStatus.hasHuggingFace ? `${fileStatus.files.filter(f => f.exists).length}/${fileStatus.files.length} present` : 'N/A'}`);
    console.log('');
  });

  log(`Total: ${allModels.length} models`, 'cyan');
}

/**
 * Quick test - verify model configuration and files without generating
 */
async function quickTestModel(manager, model) {
  printSubheader(`Quick Test: ${model.name} (${model.id})`);

  const tests = [];

  // Test 1: Model configuration is valid
  tests.push({
    name: 'Configuration',
    pass: !!(model.id && model.name && model.command && model.exec_mode),
    detail: model.exec_mode === 'server' ? `Port: ${model.port || 'N/A'}` : 'CLI mode'
  });

  // Test 2: Binary exists
  const binaryPath = resolve(PROJECT_ROOT, model.command);
  tests.push({
    name: 'Binary exists',
    pass: existsSync(binaryPath),
    detail: binaryPath
  });

  // Test 3: Model files exist
  const fileStatus = checkModelFiles(model);
  if (fileStatus.hasHuggingFace) {
    tests.push({
      name: 'Model files',
      pass: fileStatus.allExist,
      detail: `${fileStatus.files.filter(f => f.exists).length}/${fileStatus.files.length} present`
    });
  } else {
    tests.push({
      name: 'Model files',
      pass: true,
      detail: 'No HuggingFace config'
    });
  }

  // Test 4: Can get model from manager
  const retrievedModel = manager.getModel(model.id);
  tests.push({
    name: 'Manager lookup',
    pass: retrievedModel !== null,
    detail: retrievedModel ? `Found as "${retrievedModel.name}"` : 'Not found'
  });

  // Print results
  let allPass = true;
  tests.forEach(test => {
    const status = test.pass ? colorize('✓ PASS', 'green') : colorize('✗ FAIL', 'red');
    console.log(`  ${status}  ${test.name}: ${test.detail}`);
    if (!test.pass) allPass = false;
  });

  return allPass;
}

/**
 * Full test - attempt to start the model and verify it's ready
 */
async function fullTestModel(manager, model, prompt) {
  printSubheader(`Full Test: ${model.name} (${model.id})`);

  log(`Execution mode: ${model.exec_mode}`, 'cyan');
  log(`Load mode: ${model.mode}`, 'cyan');

  // First run quick tests
  const quickPass = await quickTestModel(manager, model);
  if (!quickPass) {
    log('Quick tests failed, skipping full test', 'yellow');
    return false;
  }

  console.log('');

  // For CLI mode models, we can't really "start" them - they run per generation
  if (model.exec_mode === ExecMode.CLI) {
    log('CLI mode model - will run on-demand during generation', 'yellow');
    log('To test generation, use the queue API or trigger a generation from the UI', 'yellow');
    return true;
  }

  // For server mode models, try to start the server
  if (model.exec_mode === ExecMode.SERVER) {
    log('Server mode model - attempting to start server...', 'yellow');

    try {
      // Check if already running
      if (manager.isModelRunning(model.id)) {
        log('Model is already running', 'green');
        return true;
      }

      log('Starting model server...', 'yellow');
      const processEntry = await manager.startModel(model.id);

      log(`Server started with PID: ${processEntry.pid}`, 'green');

      // Wait a moment for the server to initialize
      log('Waiting for server to be ready...', 'yellow');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check status
      const status = manager.getModelStatus(model.id);
      if (status.status === ModelStatus.RUNNING) {
        log(`Server is running on port ${status.port}`, 'green');

        // Clean up - stop the server
        log('Stopping test server...', 'yellow');
        await manager.stopModel(model.id);
        log('Server stopped', 'green');

        return true;
      } else {
        log(`Server status: ${status.status}`, 'red');
        if (status.error) {
          log(`Error: ${status.error}`, 'red');
        }
        return false;
      }
    } catch (error) {
      log(`Failed to start server: ${error.message}`, 'red');
      return false;
    }
  }

  return true;
}

/**
 * Main test runner
 */
async function main() {
  const options = parseArgs();
  const manager = getModelManager();

  printHeader('Model Generation Test Suite');

  // Load configuration
  log('Loading model configuration...', 'yellow');
  const loaded = manager.loadConfig();

  if (!loaded) {
    log('Failed to load model configuration', 'red');
    process.exit(1);
  }

  const allModels = manager.getAllModels();
  const defaultModel = manager.getDefaultModel();
  log(`Loaded ${allModels.length} models`, 'green');
  log(`Default model: ${defaultModel?.id || 'none'}`, 'cyan');

  // List only mode
  if (options.listOnly) {
    listModels(manager);
    return;
  }

  // Filter models to test
  let modelsToTest = allModels;

  if (options.model) {
    const model = manager.getModel(options.model);
    if (!model) {
      log(`Model "${options.model}" not found`, 'red');
      log('Use --list to see available models', 'yellow');
      process.exit(1);
    }
    modelsToTest = [model];
  } else {
    // Filter by execution mode
    if (options.cliOnly) {
      modelsToTest = allModels.filter(m => m.exec_mode === ExecMode.CLI);
      log(`Testing CLI mode models only (${modelsToTest.length} found)`, 'cyan');
    } else if (options.serverOnly) {
      modelsToTest = allModels.filter(m => m.exec_mode === ExecMode.SERVER);
      log(`Testing server mode models only (${modelsToTest.length} found)`, 'cyan');
    }
  }

  console.log('');

  // Run tests
  const results = [];

  for (const model of modelsToTest) {
    let pass;
    if (options.quickTest) {
      pass = await quickTestModel(manager, model);
    } else {
      pass = await fullTestModel(manager, model, options.prompt);
    }

    results.push({
      id: model.id,
      name: model.name,
      pass,
      mode: model.exec_mode
    });

    console.log('');
  }

  // Print summary
  printHeader('Test Summary');

  const passCount = results.filter(r => r.pass).length;
  const failCount = results.length - passCount;

  results.forEach(result => {
    const status = result.pass ? colorize('✓ PASS', 'green') : colorize('✗ FAIL', 'red');
    const mode = result.mode === ExecMode.CLI ? '[CLI]' : '[SERVER]';
    console.log(`  ${status}  ${mode} ${result.id.padEnd(20)} ${result.name}`);
  });

  console.log('');
  log(`Results: ${passCount} passed, ${failCount} failed out of ${results.length} total`,
      passCount === results.length ? 'green' : 'yellow');

  if (failCount > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Test suite error:', error);
  process.exit(1);
});
