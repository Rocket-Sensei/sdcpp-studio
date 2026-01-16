#!/usr/bin/env node
/**
 * Model Args Parser Tool
 *
 * Parses model configuration YAML files to extract:
 * - File paths from the 'args' array (files passed via --diffusion-model, --vae, --llm, etc.)
 * - Steps values from the 'args' array (from --steps or -s flags)
 *
 * Generates a report showing which models have file tracking via huggingface config vs args
 *
 * Usage:
 *   node backend/scripts/parse-model-args.js                    # Full report
 *   node backend/scripts/parse-model-args.js --files-only       # Only files not in huggingface
 *   node backend/scripts/parse-model-args.js --model <id>       # Specific model
 *   node backend/scripts/parse-model-args.js --summary          # Summary only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONFIG_DIR = path.join(PROJECT_ROOT, 'backend/config');

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
  console.log('\n' + colors.bold + colors.blue + '═'.repeat(70) + colors.reset);
  console.log(colors.bold + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.bold + colors.blue + '═'.repeat(70) + colors.reset + '\n');
}

function printSubheader(title) {
  console.log('\n' + colors.bold + colors.cyan + `── ${title}` + colors.reset);
}

/**
 * Load all YAML config files from backend/config/
 */
function loadConfigFiles() {
  const configFiles = [];
  const files = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  // Load in alphabetical order (consistent with modelManager behavior)
  files.sort();

  for (const file of files) {
    const filePath = path.join(CONFIG_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const config = yaml.load(content);
      if (config && config.models) {
        configFiles.push({
          file,
          models: config.models
        });
      }
    } catch (error) {
      log(`Error loading ${file}: ${error.message}`, 'red');
    }
  }

  return configFiles;
}

/**
 * Flags that indicate the next arg is a file path
 */
const FILE_FLAGS = [
  '--diffusion-model',
  '--model',
  '-m',
  '--vae',
  '--llm',
  '--llm_vision',
  '--clip_l',
  '--t5xxl',
  '--clip',
  '--embeddings'
];

/**
 * Flags that indicate the next arg is a steps value
 */
const STEPS_FLAGS = [
  '--steps',
  '-s',
  '--sample-steps'
];

/**
 * Extract file paths and steps from args array
 */
function parseArgs(args) {
  if (!args || !Array.isArray(args)) {
    return { files: [], steps: null };
  }

  const files = [];
  let steps = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Check if this is a file flag
    if (FILE_FLAGS.includes(arg) && i + 1 < args.length) {
      const filePath = args[i + 1];
      // Only include if it looks like a file path (starts with ./ or / or contains .)
      if (filePath && (filePath.startsWith('./') || filePath.startsWith('/') || filePath.includes('.'))) {
        files.push({
          flag: arg,
          path: filePath
        });
      }
    }

    // Check if this is a steps flag
    if (STEPS_FLAGS.includes(arg) && i + 1 < args.length) {
      const stepsValue = args[i + 1];
      // Validate it's a number
      const num = parseInt(stepsValue, 10);
      if (!isNaN(num)) {
        steps = num;
      }
    }
  }

  return { files, steps };
}

/**
 * Get files defined in huggingface config
 */
function getHuggingFaceFiles(model) {
  if (!model.huggingface || !model.huggingface.files) {
    return [];
  }

  return model.huggingface.files.map(f => path.basename(f.path));
}

/**
 * Generate report for a single model
 */
function generateModelReport(modelId, model) {
  const { files: argFiles, steps } = parseArgs(model.args);
  const hfFiles = getHuggingFaceFiles(model);

  // Files in args but not in huggingface.files
  const missingFromHf = argFiles.filter(f => {
    const basename = path.basename(f.path);
    return !hfFiles.includes(basename);
  });

  return {
    id: modelId,
    name: model.name,
    execMode: model.exec_mode,
    modelType: model.model_type,
    port: model.port,
    hasHuggingFace: hfFiles.length > 0,
    hfFileCount: hfFiles.length,
    argFiles,
    steps,
    missingFromHf,
    allArgs: model.args || []
  };
}

/**
 * Print detailed report for a model
 */
function printModelReport(report) {
  const modeIndicator = report.execMode === 'server'
    ? colors.blue + '[SERVER]' + colors.reset
    : colors.cyan + '[CLI]' + colors.reset;

  const hfIndicator = report.hasHuggingFace
    ? colors.green + '✓ HF' + colors.reset
    : colors.yellow + '○ NO-HF' + colors.reset;

  log(`${modeIndicator} ${hfIndicator} ${colors.bold}${report.id}${colors.reset}`, 'white');
  log(`  Name:     ${report.name}`, 'gray');
  log(`  Type:     ${report.modelType || 'N/A'}`, 'gray');
  log(`  Port:     ${report.port || 'N/A'}`, 'gray');

  // Steps
  if (report.steps !== null) {
    log(`  Steps:    ${colors.green}${report.steps}${colors.reset} (from args)`, 'white');
  } else {
    log(`  Steps:    ${colors.yellow}not found in args${colors.reset}`, 'gray');
  }

  // HuggingFace files
  if (report.hasHuggingFace) {
    log(`  HF Files: ${report.hfFileCount} tracked`, 'gray');
  } else {
    log(`  HF Files: ${colors.yellow}none${colors.reset}`, 'yellow');
  }

  // Files from args
  if (report.argFiles.length > 0) {
    log(`\n  ${colors.bold}Files from args:${colors.reset}`, 'cyan');
    report.argFiles.forEach(f => {
      const basename = path.basename(f.path);
      const isTracked = report.hasHuggingFace && report.missingFromHf.findIndex(m => path.basename(m.path) === basename) === -1;
      const status = isTracked ? colors.green + '✓' : colors.yellow + '?';
      log(`    ${status} ${colors.dim}${f.flag}${colors.reset} ${f.path}`, 'white');
    });
  }

  // Missing from HuggingFace tracking
  if (report.missingFromHf.length > 0) {
    log(`\n  ${colors.yellow}Files NOT in huggingface.files:${colors.reset}`, 'yellow');
    report.missingFromHf.forEach(f => {
      log(`    ⚠ ${colors.dim}${f.flag}${colors.reset} ${f.path}`, 'yellow');
    });
  }

  console.log('');
}

/**
 * Print summary report
 */
function printSummary(reports) {
  const totalModels = reports.length;
  const withHf = reports.filter(r => r.hasHuggingFace).length;
  const withSteps = reports.filter(r => r.steps !== null).length;
  const withMissingFiles = reports.filter(r => r.missingFromHf.length > 0).length;

  printSubheader('Summary');
  log(`  Total models:           ${colors.bold}${totalModels}${colors.reset}`, 'white');
  log(`  With HuggingFace:       ${colors.green}${withHf}${colors.reset} / ${totalModels}`, 'white');
  log(`  With steps in args:     ${colors.cyan}${withSteps}${colors.reset} / ${totalModels}`, 'white');
  log(`  With missing HF files:  ${colors.yellow}${withMissingFiles}${colors.reset} / ${totalModels}`, 'white');

  // Models with missing files
  if (withMissingFiles > 0) {
    printSubheader('Models with files NOT in huggingface.files');
    reports.filter(r => r.missingFromHf.length > 0).forEach(r => {
      log(`  ${colors.yellow}${r.id.padEnd(25)}${colors.reset} ${r.missingFromHf.length} missing`, 'white');
      r.missingFromHf.forEach(f => {
        log(`    ${colors.dim}└─${f.flag} ${f.path}${colors.reset}`, 'gray');
      });
    });
  }

  // Models without steps in args
  const withoutSteps = reports.filter(r => r.steps === null && r.execMode === 'server');
  if (withoutSteps.length > 0) {
    printSubheader('Server models WITHOUT steps in args');
    withoutSteps.forEach(r => {
      log(`  ${colors.red}${r.id.padEnd(25)}${colors.reset} ${r.name}`, 'white');
    });
  }
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);

  // Parse command line options
  const options = {
    filesOnly: false,
    modelId: null,
    summary: false
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--files-only') {
      options.filesOnly = true;
    } else if (args[i] === '--model' && i + 1 < args.length) {
      options.modelId = args[i + 1];
      i++;
    } else if (args[i] === '--summary') {
      options.summary = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
Model Args Parser Tool - Usage:

  node backend/scripts/parse-model-args.js                    # Full report
  node backend/scripts/parse-model-args.js --files-only       # Only files not in huggingface
  node backend/scripts/parse-model-args.js --model <id>       # Specific model
  node backend/scripts/parse-model-args.js --summary          # Summary only

This tool parses model configuration YAML files to extract:
  - File paths from the 'args' array (--diffusion-model, --vae, --llm, etc.)
  - Steps values from the 'args' array (--steps or -s flags)

The report shows which models have file tracking via huggingface config vs args.
      `);
      process.exit(0);
    }
  }

  // Load all config files
  const configFiles = loadConfigFiles();
  printHeader('Model Args Parser Report');

  // Collect all models
  const allModels = {};
  configFiles.forEach(config => {
    Object.entries(config.models).forEach(([id, model]) => {
      allModels[id] = model;
    });
  });

  // Generate reports
  const reports = Object.entries(allModels)
    .filter(([id]) => !options.modelId || id === options.modelId)
    .map(([id, model]) => generateModelReport(id, model))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (options.modelId && reports.length === 0) {
    log(`Model "${options.modelId}" not found`, 'red');
    process.exit(1);
  }

  // Print reports
  if (options.summary) {
    printSummary(reports);
  } else if (options.filesOnly) {
    // Only show models with missing files
    const withMissing = reports.filter(r => r.missingFromHf.length > 0);
    if (withMissing.length === 0) {
      log('All model files in args are tracked in huggingface.files', 'green');
    } else {
      withMissing.forEach(r => {
        log(`${r.id}:`, 'cyan');
        r.missingFromHf.forEach(f => {
          log(`  ${f.flag} ${f.path}`, 'yellow');
        });
        console.log('');
      });
    }
    printSummary(reports);
  } else {
    // Full report
    reports.forEach(r => printModelReport(r));
    printSummary(reports);
  }
}

main();
