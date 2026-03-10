#!/usr/bin/env node
/**
 * Models CLI Tool
 *
 * Command-line interface for managing and inspecting AI models.
 * Provides information about model configuration, file status, and running state.
 *
 * Usage:
 *   node backend/scripts/models-cli.js                    # List all models
 *   node backend/scripts/models-cli.js list               # List all models
 *   node backend/scripts/models-cli.js info <model-id>    # Get detailed model info
 *   node backend/scripts/models-cli.js running            # Show running models
 *   node backend/scripts/models-cli.js files <model-id>   # Check model file status
 *   node backend/scripts/models-cli.js downloaded         # Show downloaded models
 */

import { getModelManager } from '../services/modelManager.js';
import { getModelFileStatus } from '../utils/modelHelpers.js';
import { statSync } from 'fs';
import { dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';

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

// Status symbols
const symbols = {
  present: colors.green + '✓' + colors.reset,
  absent: colors.red + '✗' + colors.reset,
  running: colors.green + '●' + colors.reset,
  stopped: colors.gray + '○' + colors.reset,
  server: colors.blue + 'S' + colors.reset,
  cli: colors.cyan + 'C' + colors.reset,
  preload: colors.yellow + 'P' + colors.reset,
  ondemand: colors.dim + 'D' + colors.reset
};

function colorize(message, color) {
  return colors[color] + message + colors.reset;
}

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function printHeader(title) {
  console.log('');
  console.log(colors.bold + colors.blue + '═'.repeat(60) + colors.reset);
  console.log(colors.bold + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.bold + colors.blue + '═'.repeat(60) + colors.reset);
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
 * Uses the shared getModelFileStatus from modelHelpers.js (same as GUI)
 * Priority: 1) model.args file flags  2) config fields  3) huggingface.files  4) external API
 */
async function checkModelFiles(model) {
  const status = await getModelFileStatus(model);

  // Normalize the returned file format for CLI display
  const normalizedFiles = status.files.map(file => ({
    path: file.path,
    flag: file.flag,
    filePath: file.filePath,
    exists: file.exists,
    fileName: basename(file.filePath),
    dest: file.dest || null
  }));

  return {
    files: normalizedFiles,
    allExist: status.allFilesExist,
    hasHuggingFace: status.hasHuggingFace,
    source: status.source,
    isExternal: status.allFilesExist && normalizedFiles.length === 0 && !status.hasHuggingFace
  };
}

/**
 * Format file size in human readable format
 */
function formatFileSize(bytes) {
  if (!bytes) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * List all models
 */
async function listModels() {
  const manager = getModelManager();
  manager.loadConfig();

  const allModels = manager.getAllModels();
  const defaultModel = manager.getDefaultModel();
  const runningModels = manager.getRunningModels();

  printHeader('Available Models');

  for (const model of allModels) {
    const isDefault = defaultModel?.id === model.id;
    const isRunning = runningModels.includes(model.id);
    const fileStatus = await checkModelFiles(model);
    const fileCount = fileStatus.files.length;
    const presentCount = fileStatus.files.filter(f => f.exists).length;

    // Status indicators
    const statusIndicators = [
      isDefault ? colorize('DEFAULT', 'green') : '',
      isRunning ? colorize('RUNNING', 'green') : colorize('STOPPED', 'gray'),
      model.exec_mode === 'server' ? colorize('[SERVER]', 'blue') : colorize('[CLI]', 'cyan'),
      model.mode === 'preload' ? colorize('[PRELOAD]', 'yellow') : colorize('[ON-DEMAND]', 'dim')
    ].filter(Boolean).join(' ');

    // Model line
    console.log(
      colors.bold + model.id.padEnd(20) + colors.reset +
      '  ' +
      (fileStatus.allExist ? symbols.present : symbols.absent) +
      '  ' +
      (isRunning ? symbols.running : symbols.stopped) +
      '  ' +
      statusIndicators
    );

    // Model details
    let filesText;
    if (fileStatus.source === 'args') {
      const components = fileStatus.files.map(f => {
        const flagName = f.flag.replace(/^--/, '');
        return f.exists ? colorize(flagName, 'green') : colorize(flagName, 'red');
      }).join(', ');
      filesText = `${presentCount}/${fileCount} present (${components})`;
    } else if (fileStatus.hasHuggingFace) {
      filesText = `${presentCount}/${fileCount} present` + (fileStatus.allExist ? '' : colorize(' (incomplete)', 'red'));
    } else if (fileStatus.isExternal) {
      filesText = colorize('External API', 'blue');
    } else {
      filesText = colorize('No files configured', 'yellow');
    }

    console.log(
      colors.dim + '  Name:     ' + colors.reset + model.name +
      colors.dim + '\n  Type:     ' + colors.reset + model.model_type +
      colors.dim + '\n  Files:    ' + colors.reset + filesText
    );
    console.log('');
  }

  // Summary
  printSubheader('Summary');
  const totalModels = allModels.length;

  // Check file status for all models for summary
  const allFileStatuses = await Promise.all(allModels.map(m => checkModelFiles(m)));
  const withFiles = allFileStatuses.filter(status => status.source === 'args' || status.hasHuggingFace || status.isExternal).length;
  const withLocalFiles = allFileStatuses.filter(status => status.source === 'args' || status.hasHuggingFace).length;
  const allFilesPresent = allFileStatuses.filter(status => status.allExist).length;
  const runningCount = runningModels.length;

  console.log(`  Total models:     ${colorize(totalModels.toString(), 'bold')}`);
  console.log(`  With files:       ${colorize(withFiles.toString(), 'cyan')}`);
  console.log(`  Files present:    ${colorize(allFilesPresent.toString(), allFilesPresent === withLocalFiles ? 'green' : 'yellow')} / ${withLocalFiles}`);
  console.log(`  Running:          ${colorize(runningCount.toString(), runningCount > 0 ? 'green' : 'gray')}`);
  console.log(`  Default model:    ${colorize(defaultModel?.id || 'none', defaultModel ? 'blue' : 'gray')}`);
}

/**
 * Show detailed info for a specific model
 */
async function showModelInfo(modelId) {
  const manager = getModelManager();
  manager.loadConfig();

  const model = manager.getModel(modelId);

  if (!model) {
    console.error(colorize(`Error: Model "${modelId}" not found`, 'red'));
    console.log('Run "node backend/scripts/models-cli.js list" to see available models.');
    process.exit(1);
  }

  const isRunning = manager.isModelRunning(modelId);
  const fileStatus = await checkModelFiles(model);

  printHeader(`Model: ${model.name}`);

  // Basic info
  console.log(colors.bold + 'Basic Information:' + colors.reset);
  console.log(`  ID:           ${colorize(model.id, 'cyan')}`);
  console.log(`  Name:         ${model.name}`);
  console.log(`  Description:  ${model.description || 'N/A'}`);
  console.log(`  Type:         ${model.model_type}`);
  console.log(`  Default Size: ${model.default_size || 'N/A'}`);

  // Execution info
  console.log('');
  console.log(colors.bold + 'Execution Configuration:' + colors.reset);
  console.log(`  Command:      ${colorize(model.command, 'yellow')}`);
  console.log(`  Exec Mode:    ${model.exec_mode === 'server' ? colorize('server', 'blue') : colorize('cli', 'cyan')}`);
  console.log(`  Load Mode:    ${model.mode === 'preload' ? colorize('preload', 'yellow') : colorize('on_demand', 'dim')}`);
  console.log(`  API:          ${model.api || colorize('N/A (CLI mode)', 'gray')}`);
  console.log(`  Port:         ${model.port || colorize('N/A', 'gray')}`);
  console.log(`  Status:       ${isRunning ? colorize('RUNNING', 'green') : colorize('STOPPED', 'gray')}`);

  // Arguments
  if (model.args && model.args.length > 0) {
    console.log('');
    console.log(colors.bold + 'Arguments:' + colors.reset);
    model.args.forEach(arg => {
      console.log(`  ${arg}`);
    });
  }

  // File status
  if (fileStatus.hasHuggingFace) {
    console.log('');
    console.log(colors.bold + 'HuggingFace Files:' + colors.reset);
    console.log(`  Repo:         ${colorize(model.huggingface.repo, 'blue')}`);
    console.log(`  Files:        ${fileStatus.files.filter(f => f.exists).length}/${fileStatus.files.length} present`);
    console.log('');

    fileStatus.files.forEach(file => {
      const status = file.exists ? symbols.present : symbols.absent;
      const statusText = file.exists ? colorize('PRESENT', 'green') : colorize('ABSENT', 'red');
      console.log(`  ${status} ${file.path}`);
      console.log(`     Dest: ${file.dest || './models'}`);
      console.log(`     Path: ${file.filePath}`);
      console.log(`     ${statusText}`);
      console.log('');
    });
  } else {
    console.log('');
    console.log(colors.yellow + 'No HuggingFace configuration' + colors.reset);
  }
}

/**
 * Show running models
 */
function showRunningModels() {
  const manager = getModelManager();
  manager.loadConfig();

  const runningModels = manager.getRunningModels();

  printHeader('Running Models');

  if (runningModels.length === 0) {
    console.log(colorize('No models are currently running.', 'yellow'));
    return;
  }

  runningModels.forEach(modelId => {
    const model = manager.getModel(modelId);
    const status = manager.getModelStatus(modelId);

    console.log(colors.bold + modelId + colors.reset);
    console.log(`  Name:       ${model?.name || modelId}`);
    console.log(`  Status:     ${colorize(status.status, 'green')}`);
    console.log(`  Exec Mode:  ${model?.exec_mode || 'N/A'}`);
    console.log(`  API:        ${model?.api || 'N/A'}`);
    console.log(`  Port:       ${model?.port || 'N/A'}`);
    console.log('');
  });
}

/**
 * Show model file status
 */
async function showModelFiles(modelId) {
  const manager = getModelManager();
  manager.loadConfig();

  const model = manager.getModel(modelId);

  if (!model) {
    console.error(colorize(`Error: Model "${modelId}" not found`, 'red'));
    process.exit(1);
  }

  const fileStatus = await checkModelFiles(model);

  printHeader(`File Status: ${model.name}`);

  // Handle models with no files configured
  if (fileStatus.files.length === 0) {
    if (fileStatus.isExternal) {
      console.log(colorize('External API model - no local files required.', 'blue'));
    } else {
      console.log(colorize('No files configured for this model.', 'yellow'));
    }
    return;
  }

  const allPresent = fileStatus.allExist;
  const presentCount = fileStatus.files.filter(f => f.exists).length;

  console.log(
    `Status:  ${allPresent ? colorize('All files present', 'green') : colorize(`${presentCount}/${fileStatus.files.length} files present`, 'yellow')}`
  );

  if (fileStatus.source === 'huggingface') {
    console.log(`Repo:    ${colorize(model.huggingface.repo, 'blue')}`);
  } else if (fileStatus.source === 'args') {
    console.log(`Source:  ${colorize('Model arguments', 'cyan')}`);
  }
  console.log('');

  fileStatus.files.forEach(file => {
    const status = file.exists ? symbols.present : symbols.absent;
    const statusColor = file.exists ? 'green' : 'red';
    const size = file.exists ? formatFileSize(statSync(file.filePath).size) : 'N/A';

    if (fileStatus.source === 'args') {
      // Show component type and file path for args-based files
      const flagName = file.flag.replace(/^--/, '');
      console.log(`  ${status} ${colorize(`[${flagName}]`, 'cyan')} ${colorize(file.fileName, statusColor)}`);
      console.log(`     ${colors.dim}Arg:    ${file.flag}${colors.reset}`);
      console.log(`     ${colors.dim}Path:   ${file.filePath}${colors.reset}`);
      console.log(`     ${colors.dim}Size:   ${size}${colors.reset}`);
    } else {
      // HuggingFace-style display
      console.log(`  ${status} ${colorize(file.path, statusColor)}`);
      console.log(`     ${colors.dim}Source: ${file.path}${colors.reset}`);
      console.log(`     ${colors.dim}Dest:   ${file.dest || './models'}${colors.reset}`);
      console.log(`     ${colors.dim}Path:   ${file.filePath}${colors.reset}`);
      console.log(`     ${colors.dim}Size:   ${size}${colors.reset}`);
    }
    console.log('');
  });
}

/**
 * Show downloaded models
 */
function showDownloadedModels() {
  printHeader('Downloaded Models');
  console.log(colorize('Note: This feature is under development.', 'yellow'));
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'list';
  const target = args[1];

  switch (command) {
    case 'list':
    case 'ls':
      await listModels();
      break;

    case 'info':
    case 'show':
      if (!target) {
        console.error(colorize('Error: Model ID required', 'red'));
        console.log('Usage: node backend/scripts/models-cli.js info <model-id>');
        process.exit(1);
      }
      await showModelInfo(target);
      break;

    case 'running':
    case 'status':
      showRunningModels();
      break;

    case 'files':
      if (!target) {
        console.error(colorize('Error: Model ID required', 'red'));
        console.log('Usage: node backend/scripts/models-cli.js files <model-id>');
        process.exit(1);
      }
      await showModelFiles(target);
      break;

    case 'downloaded':
      showDownloadedModels();
      break;

    case 'help':
    case '--help':
    case '-h':
      console.log(`
Models CLI Tool - Usage:

  node backend/scripts/models-cli.js                    # List all models
  node backend/scripts/models-cli.js list               # List all models
  node backend/scripts/models-cli.js info <model-id>    # Get detailed model info
  node backend/scripts/models-cli.js running            # Show running models
  node backend/scripts/models-cli.js files <model-id>   # Check model file status
  node backend/scripts/models-cli.js downloaded         # Show downloaded models
  node backend/scripts/models-cli.js help               # Show this help

Status indicators:
  ✓ = All files present    ✗ = Files missing
  ● = Model running        ○ = Model stopped
  [SERVER] = Server mode   [CLI] = CLI mode
  [PRELOAD] = Preload      [ON-DEMAND] = On-demand
      `);
      break;

    default:
      console.error(colorize(`Error: Unknown command "${command}"`, 'red'));
      console.log('Run "node backend/scripts/models-cli.js help" for usage information.');
      process.exit(1);
  }
}

main();
