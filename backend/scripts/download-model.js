#!/usr/bin/env node
/**
 * Model Download CLI Tool
 *
 * Command-line interface for downloading AI models from HuggingFace.
 * Uses the same downloader code as the web application.
 *
 * Usage:
 *   node backend/scripts/download-model.js                          # List available models
 *   node backend/scripts/download-model.js list                     # List available models
 *   node backend/scripts/download-model.js <model-id>               # Download a specific model
 *   node backend/scripts/download-model.js <model-id> --force       # Re-download even if files exist
 *   node backend/scripts/download-model.js --repo <repo> <file>     # Download specific file
 *
 * Examples:
 *   node backend/scripts/download-model.js z-image-turbo
 *   node backend/scripts/download-model.js --repo leejet/Z-Image-Turbo-GGUF z_image_turbo-Q8_0.gguf
 *   node backend/scripts/download-model.py qwen-image --force
 */

import { mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath as importMetaUrl } from 'url';

const __filename = importMetaUrl(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (backend/scripts -> backend -> ..)
const PROJECT_ROOT = resolve(__dirname, '../..');

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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function printHeader(title) {
  console.log('\n' + colors.bold + colors.blue + '═'.repeat(60) + colors.reset);
  console.log(colors.bold + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.bold + colors.blue + '═'.repeat(60) + colors.reset + '\n');
}

function printSubheader(title) {
  console.log('\n' + colors.bold + colors.cyan + `── ${title}` + colors.reset);
}

// Load model manager to get model configs
async function loadModelManager() {
  try {
    const { getModelManager } = await import('../services/modelManager.js');
    return getModelManager();
  } catch (error) {
    log(`Error loading model manager: ${error.message}`, 'red');
    return null;
  }
}

// Import modelDownloader service
async function getModelDownloader() {
  try {
    const module = await import('../services/modelDownloader.js');
    return module.modelDownloader;
  } catch (error) {
    log(`Error loading model downloader: ${error.message}`, 'red');
    return null;
  }
}

// Import modelDownloader utilities
async function getDownloaderUtils() {
  try {
    const module = await import('../services/modelDownloader.js');
    return {
      formatBytes: module.formatBytes,
      formatTime: module.formatTime,
      getDownloadMethod: module.getDownloadMethod,
      DOWNLOAD_METHOD: module.DOWNLOAD_METHOD
    };
  } catch (error) {
    return null;
  }
}

/**
 * List all models with HuggingFace configuration
 */
async function listModels() {
  printHeader('Available Models for Download');

  const manager = await loadModelManager();
  if (!manager) {
    log('Failed to load model manager', 'red');
    process.exit(1);
  }

  manager.loadConfig();
  const allModels = manager.getAllModels();

  // Filter models with HuggingFace config
  const modelsWithHF = allModels.filter(m => m.huggingface && m.huggingface.files);

  if (modelsWithHF.length === 0) {
    log('No models with HuggingFace configuration found.', 'yellow');
    process.exit(0);
  }

  for (const model of modelsWithHF) {
    // Check file status
    const filesExist = checkModelFiles(model);
    const allPresent = filesExist.every(f => f.exists);

    // Status indicators
    const status = allPresent ? colors.green + '✓ DOWNLOADED' : colors.yellow + '○ MISSING';
    const mode = model.exec_mode === 'server' ? colors.blue + '[SERVER]' : colors.cyan + '[CLI]';

    log(`${status} ${mode} ${colors.bold}${model.id}${colors.reset}`, 'white');
    log(`  Name:    ${model.name}`, 'gray');
    log(`  Repo:    ${model.huggingface.repo}`, 'gray');
    log(`  Files:   ${model.huggingface.files.length} (${filesExist.filter(f => f.exists).length} present)`, 'gray');

    // List files
    for (const file of model.huggingface.files) {
      const fileStatus = filesExist.find(f => f.path === file.path);
      const exists = fileStatus?.exists || false;
      const icon = exists ? colors.green + '✓' : colors.red + '✗';
      log(`    ${icon} ${basename(file.path)}`, exists ? 'green' : 'red');
    }
    console.log('');
  }

  // Summary
  const total = modelsWithHF.length;
  const downloaded = modelsWithHF.filter(m => checkModelFiles(m).every(f => f.exists)).length;
  printSubheader('Summary');
  log(`  Total models:   ${total}`, 'white');
  log(`  Downloaded:     ${colors.green}${downloaded}${colors.reset} / ${total}`);
  log(`  Not downloaded: ${colors.yellow}${total - downloaded}${colors.reset} / ${total}`);
}

/**
 * Check if model files exist on disk
 */
function checkModelFiles(model) {
  if (!model.huggingface || !model.huggingface.files) {
    return [];
  }

  return model.huggingface.files.map(file => {
    // Resolve dest directory from project root
    const destDir = file.dest || process.env.MODELS_DIR || './models';
    const resolvedDestDir = resolve(PROJECT_ROOT, destDir);
    const fileName = basename(file.path);
    const filePath = join(resolvedDestDir, fileName);
    const exists = existsSync(filePath);

    return {
      path: file.path,
      dest: file.dest,
      filePath,
      resolvedDestDir,
      exists,
      fileName
    };
  });
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format seconds to human readable
 */
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Download a specific model
 */
async function downloadModel(modelId, force = false) {
  const manager = await loadModelManager();
  if (!manager) {
    log('Failed to load model manager', 'red');
    process.exit(1);
  }

  manager.loadConfig();
  const model = manager.getModel(modelId);

  if (!model) {
    log(`Model "${modelId}" not found`, 'red');
    log('Run "node backend/scripts/download-model.js list" to see available models.', 'yellow');
    process.exit(1);
  }

  if (!model.huggingface || !model.huggingface.files) {
    log(`Model "${modelId}" has no HuggingFace configuration`, 'red');
    process.exit(1);
  }

  printHeader(`Downloading Model: ${model.name}`);

  // Check existing files
  const fileStatus = checkModelFiles(model);
  const allPresent = fileStatus.every(f => f.exists);

  if (allPresent && !force) {
    log('All files already exist. Use --force to re-download.', 'yellow');
    return;
  }

  // Show what will be downloaded
  printSubheader('Files to download');
  for (const file of fileStatus) {
    const status = file.exists ? colors.green + '✓ EXISTS' : colors.yellow + '↓ DOWNLOAD';
    log(`  ${status} ${file.fileName}`, file.exists ? 'green' : 'white');
  }

  // Get download method info
  const utils = await getDownloaderUtils();
  if (utils) {
    const method = await utils.getDownloadMethod();
    log(`\nDownload method: ${method}`, 'cyan');
  }

  // Create directories for missing files
  for (const file of fileStatus) {
    if (!file.exists && file.resolvedDestDir) {
      if (!existsSync(file.resolvedDestDir)) {
        mkdirSync(file.resolvedDestDir, { recursive: true });
        log(`Created directory: ${file.resolvedDestDir}`, 'dim');
      }
    }
  }

  // Update files with resolved dest directories and filter out existing files (unless --force)
  const filesWithResolvedDest = model.huggingface.files
    .map(file => ({
      ...file,
      dest: resolve(PROJECT_ROOT, file.dest || process.env.MODELS_DIR || './models')
    }))
    .filter(file => {
      const filePath = join(file.dest, basename(file.path));
      const exists = existsSync(filePath);
      if (exists && !force) {
        log(`  Skipping ${basename(file.path)} (already exists)`, 'dim');
        return false;
      }
      return true;
    });

  if (filesWithResolvedDest.length === 0) {
    log('\nAll files already exist. Use --force to re-download.', 'green');
    return;
  }

  log(`\nDownloading ${filesWithResolvedDest.length} file(s)...`, 'blue');

  try {
    const downloader = await getModelDownloader();
    if (!downloader) {
      log('Failed to load model downloader', 'red');
      process.exit(1);
    }

    let lastProgress = { currentFile: '', overallProgress: 0 };

    const downloadId = await downloader.downloadModel(
      model.huggingface.repo,
      filesWithResolvedDest,
      (progress) => {
        // Clear line and show progress
        const fileProgress = progress.fileProgress || 0;
        const overallProgress = progress.overallProgress || 0;

        // Only log on significant updates
        if (progress.currentFile !== lastProgress.currentFile ||
            Math.floor(overallProgress) > Math.floor(lastProgress.overallProgress)) {

          const downloaded = formatBytes(progress.bytesDownloaded || 0);
          const total = formatBytes(progress.totalBytes || 0);
          const speed = progress.speed || '--';
          const eta = progress.eta || '--';

          process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear line
          log(`[${Math.floor(overallProgress)}%] ${progress.fileName || 'Starting...'} (${downloaded}/${total}) ${speed} ETA: ${eta}`, 'cyan');
        }

        lastProgress = {
          currentFile: progress.currentFile,
          overallProgress
        };
      }
    );

    log('\n', 'reset');
    log('Download completed successfully!', 'green');
    printSubheader('Downloaded Files');

    // Verify files
    for (const file of model.huggingface.files) {
      const destDir = resolve(PROJECT_ROOT, file.dest || process.env.MODELS_DIR || './models');
      const fileName = basename(file.path);
      const filePath = join(destDir, fileName);

      if (existsSync(filePath)) {
        const size = formatBytes(statSync(filePath).size);
        log(`  ✓ ${fileName} (${size})`, 'green');
      } else {
        log(`  ✗ ${fileName} - NOT FOUND`, 'red');
      }
    }

  } catch (error) {
    log(`\nDownload failed: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Download specific file from repo
 */
async function downloadFile(repo, fileName, destDir) {
  printHeader(`Downloading File: ${fileName} from ${repo}`);

  const resolvedDest = destDir ? resolve(PROJECT_ROOT, destDir) : resolve(PROJECT_ROOT, './models');

  if (!existsSync(resolvedDest)) {
    mkdirSync(resolvedDest, { recursive: true });
    log(`Created directory: ${resolvedDest}`, 'dim');
  }

  const downloader = await getModelDownloader();
  if (!downloader) {
    log('Failed to load model downloader', 'red');
    process.exit(1);
  }

  const files = [{
    path: fileName,
    dest: resolvedDest
  }];

  try {
    log('\nStarting download...', 'blue');

    const downloadId = await downloader.downloadModel(
      repo,
      files,
      (progress) => {
        const fileProgress = progress.fileProgress || 0;
        const overallProgress = progress.overallProgress || 0;
        const downloaded = formatBytes(progress.bytesDownloaded || 0);
        const total = formatBytes(progress.totalBytes || 0);

        process.stdout.write('\r' + ' '.repeat(100) + '\r');
        log(`[${Math.floor(overallProgress)}%] ${fileName} (${downloaded}/${total})`, 'cyan');
      }
    );

    log('\n', 'reset');
    log('Download completed successfully!', 'green');

  } catch (error) {
    log(`\nDownload failed: ${error.message}`, 'red');
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'list' || args[0] === 'ls') {
    await listModels();
    return;
  }

  if (args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    console.log(`
Model Download CLI Tool - Usage:

  node backend/scripts/download-model.js                          # List available models
  node backend/scripts/download-model.js list                     # List available models
  node backend/scripts/download-model.js <model-id>               # Download a specific model
  node backend/scripts/download-model.js <model-id> --force       # Re-download even if files exist
  node backend/scripts/download-model.js --repo <repo> <file>     # Download specific file

Examples:
  node backend/scripts/download-model.js z-image-turbo
  node backend/scripts/download-model.js --repo leejet/Z-Image-Turbo-GGUF z_image_turbo-Q8_0.gguf
  node backend/scripts/download-model.js qwen-image --force
    `);
    return;
  }

  // Check for --repo flag (download specific file)
  const repoIndex = args.indexOf('--repo');
  if (repoIndex !== -1 && repoIndex + 1 < args.length) {
    const repo = args[repoIndex + 1];
    const fileName = args[repoIndex + 2];
    if (!fileName) {
      log('Error: --repo requires <repo> and <filename>', 'red');
      process.exit(1);
    }
    const destDir = args[repoIndex + 3];
    await downloadFile(repo, fileName, destDir);
    return;
  }

  // Download specific model
  const modelId = args[0];
  const force = args.includes('--force');

  await downloadModel(modelId, force);
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
