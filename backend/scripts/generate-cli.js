#!/usr/bin/env node
/**
 * Image Generation CLI Tool
 *
 * Two-pass tool for queuing images and fetching results with live monitoring.
 *
 * Usage:
 *   node backend/scripts/generate-cli.js generate --prompt "a cat" --model qwen-image --size 1024x1024
 *   node backend/scripts/generate-cli.js test-resolutions [--watch] [--prompt "text"]
 *   node backend/scripts/generate-cli.js status
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { AsciiTable3, AlignmentEnum } from 'ascii-table3';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');

const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  config({ path: envPath });
}

const CONFIG = {
  backendUrl: process.env.BACKEND_URL || 'http://192.168.2.180:3000',
  apiKey: process.env.API_KEY || null,
  pollInterval: 30000,
  statusPollInterval: 2000,
  maxPollTime: 300000,
};

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  inverse: '\x1b[7m',
};

const statusSymbols = {
  pending: '○',
  processing: '⋯',
  completed: '●',
  failed: '✗',
  cancelled: '⊘',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function moveCursor(row, col = 0) {
  process.stdout.write(`\x1b[${row};${col + 1}H`);
}

function hideCursor() {
  process.stdout.write('\x1b[?25l');
}

function showCursor() {
  process.stdout.write('\x1b[?25h');
}

function printHeader(title) {
  console.log(colors.bold + colors.blue + '═'.repeat(80) + colors.reset);
  console.log(colors.bold + colors.blue + `  ${title}` + colors.reset);
  console.log(colors.bold + colors.blue + '═'.repeat(80) + colors.reset);
}

async function api(endpoint, options = {}) {
  const url = `${CONFIG.backendUrl}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };
  if (CONFIG.apiKey) {
    headers['X-Api-Key'] = CONFIG.apiKey;
  }
  const response = await fetch(url, {
    headers,
    ...options,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text}`);
  }
  return response.json();
}

async function checkBackend() {
  try {
    await api('/api/health');
    return true;
  } catch {
    return false;
  }
}

async function findExistingJob(model, size, prompt) {
  const data = await api('/api/queue?status=pending');
  const jobs = data.jobs || [];
  return jobs.find(j => 
    j.model === model && 
    j.size === size && 
    j.prompt && j.prompt.includes(prompt.slice(0, 30))
  );
}

async function queueGeneration(model, prompt, size) {
  const result = await api('/api/queue/generate', {
    method: 'POST',
    body: JSON.stringify({ model, prompt, size, n: 1 }),
  });
  return result.job_id;
}

async function getJobStatus(jobId) {
  return api(`/api/queue/${jobId}`);
}

async function getGeneration(generationId) {
  return api(`/api/generations/${generationId}`);
}

async function getRecentGenerations(limit = 5) {
  return api(`/api/generations?limit=${limit}`);
}

async function getQueueStats() {
  return api('/api/queue/stats');
}

async function getAllJobs() {
  const data = await api('/api/queue');
  return data.jobs || [];
}

async function cmdGenerate(args) {
  const model = args.model || 'qwen-image';
  const prompt = args.prompt || 'a beautiful landscape';
  const size = args.size || '1024x1024';

  printHeader('Generate Image');

  if (!(await checkBackend())) {
    log('Error: Backend server not running', 'red');
    process.exit(1);
  }

  log(`Model: ${model}`, 'cyan');
  log(`Size: ${size}`, 'cyan');
  log(`Prompt: ${prompt}`, 'cyan');
  console.log('');

  log('Queuing generation...', 'yellow');
  const jobId = await queueGeneration(model, prompt, size);
  log(`Job ID: ${jobId}`, 'green');

  log('Waiting for completion...', 'yellow');
  
  const startTime = Date.now();
  let lastProgress = -1;

  while (Date.now() - startTime < CONFIG.maxPollTime) {
    const job = await getJobStatus(jobId);
    
    if (job.progress !== undefined && job.progress !== lastProgress) {
      process.stdout.write(`\r  Progress: ${Math.round(job.progress * 100)}%`.padEnd(30));
      lastProgress = job.progress;
    }

    if (job.status === 'completed') {
      process.stdout.write('\r' + ' '.repeat(30) + '\r');
      log('Generation completed!', 'green');
      try {
        const gen = await getGeneration(jobId);
        if (gen.images && gen.images[0]) {
          log(`Image saved: ${gen.images[0].file_path}`, 'green');
        }
      } catch (e) {}
      return;
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      process.stdout.write('\r' + ' '.repeat(30) + '\r');
      log(`Generation failed: ${job.error || job.status}`, 'red');
      process.exit(1);
    }

    await new Promise(r => setTimeout(r, CONFIG.statusPollInterval));
  }

  log('Timeout waiting for generation', 'red');
  process.exit(1);
}

function loadTestConfig() {
  const modelsPath = resolve(PROJECT_ROOT, 'docs/models.json');
  const resolutionsPath = resolve(PROJECT_ROOT, 'docs/resolutions.json');

  const models = JSON.parse(readFileSync(modelsPath, 'utf-8'));
  const resolutions = JSON.parse(readFileSync(resolutionsPath, 'utf-8'));

  return { models, resolutions };
}

function buildStatusMatrix(jobs, testPrompt, models, resolutions) {
  const matrix = {};
  const stats = { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
  const modelStats = {};

  for (const model of models) {
    matrix[model] = {};
    modelStats[model] = { pending: 0, processing: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const res of resolutions) {
      const size = `${res.width}x${res.height}`;
      matrix[model][size] = { status: 'pending', job: null };
    }
  }

  const promptFilter = testPrompt ? testPrompt.slice(0, 30) : null;

  for (const job of jobs) {
    const model = job.model;
    const size = job.size;
    
    if (matrix[model] && matrix[model][size]) {
      if (promptFilter && (!job.prompt || !job.prompt.includes(promptFilter))) {
        continue;
      }
      
      const existing = matrix[model][size];
      const isBetter = 
        existing.status === 'pending' ||
        (job.status === 'completed' && existing.status !== 'completed') ||
        (job.status === 'failed' && existing.status !== 'completed');
      
      if (isBetter) {
        matrix[model][size] = { status: job.status, job };
      }
    }
  }

  for (const model of models) {
    for (const res of resolutions) {
      const size = `${res.width}x${res.height}`;
      const cellStatus = matrix[model][size].status;
      stats[cellStatus]++;
      modelStats[model][cellStatus]++;
    }
  }

  return { matrix, stats, modelStats };
}

function formatResolution(res) {
  if (res.width === res.height) return `${res.width}`;
  return `${res.width}x${res.height}`;
}

function renderMatrix(matrix, modelStats, stats, models, resolutions, options = {}) {
  const { startTime = Date.now(), title = 'Resolution Test', showElapsed = true, showControls = true } = options;

  console.log(colors.bold + title + colors.reset);
  if (showElapsed && startTime) {
    console.log(colors.dim + `Started: ${new Date(startTime).toLocaleTimeString()}` + colors.reset);
  }
  console.log('');

  const resLabels = resolutions.map(r => formatResolution(r));
  
  const headings = ['Model', ...resLabels];
  const rows = [];
  
  for (const model of models) {
    const row = [model.slice(0, 20)];
    for (const res of resolutions) {
      const size = `${res.width}x${res.height}`;
      const cell = matrix[model]?.[size] || { status: 'pending' };
      
      let symbol = statusSymbols[cell.status] || '○';
      
      if (cell.status === 'completed') {
        symbol = colors.green + symbol + colors.reset;
      } else if (cell.status === 'failed' || cell.status === 'cancelled') {
        symbol = colors.red + symbol + colors.reset;
      } else if (cell.status === 'processing') {
        symbol = colors.cyan + '●' + colors.reset;
      } else {
        symbol = colors.gray + symbol + colors.reset;
      }
      
      row.push(symbol);
    }
    rows.push(row);
  }

  const table = new AsciiTable3('Resolution Matrix')
    .setHeading(...headings)
    .addRowMatrix(rows)
    .setAlign(1, AlignmentEnum.LEFT);
  
  for (let i = 2; i <= resLabels.length + 1; i++) {
    table.setAlign(i, AlignmentEnum.CENTER);
  }
  
  console.log(table.toString());
  console.log('');

  const summaryTable = new AsciiTable3('Model Summary')
    .setHeading('Model', 'Progress', 'Done', 'Total')
    .setAlign(2, AlignmentEnum.CENTER)
    .setAlign(3, AlignmentEnum.RIGHT)
    .setAlign(4, AlignmentEnum.RIGHT);
  
  for (const model of models) {
    const ms = modelStats[model] || {};
    const total = (ms.completed || 0) + (ms.failed || 0) + (ms.pending || 0) + (ms.processing || 0);
    const pct = total > 0 ? Math.round(((ms.completed || 0) + (ms.failed || 0)) / total * 100) : 0;
    const barLen = 10;
    const doneLen = Math.round((ms.completed || 0) / total * barLen);
    const failLen = Math.round((ms.failed || 0) / total * barLen);
    const bar = colors.green + '█'.repeat(doneLen) + colors.reset + 
                colors.red + '█'.repeat(failLen) + colors.reset + 
                colors.dim + '░'.repeat(barLen - doneLen - failLen) + colors.reset;
    
    summaryTable.addRow(model.slice(0, 20), bar, `${ms.completed || 0}`, `${total}`);
  }
  
  console.log(summaryTable.toString());
  console.log('');

  console.log(colors.bold + 'Overall:' + colors.reset);
  const total = stats.pending + stats.processing + stats.completed + stats.failed + stats.cancelled;
  const donePct = total > 0 ? Math.round((stats.completed + stats.failed + stats.cancelled) / total * 100) : 0;
  console.log(`  Pending: ${colors.yellow}${stats.pending}${colors.reset}  ` +
              `Processing: ${colors.cyan}${stats.processing}${colors.reset}  ` +
              `Completed: ${colors.green}${stats.completed}${colors.reset}  ` +
              `Failed: ${colors.red}${stats.failed}${colors.reset}  ` +
              `(${donePct}% done)`);
  
  if (showElapsed && startTime) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    console.log(colors.dim + `  Elapsed: ${mins}m ${secs}s` + colors.reset);
  }
  
  console.log('');
  console.log(colors.dim + 'Legend: ○ pending  ● completed  ✗ failed  ● processing' + colors.reset);
  if (showControls) {
    console.log(colors.dim + 'Press Ctrl+C to exit' + colors.reset);
  }
}

async function cmdTestResolutions(args) {
  const watchOnly = args.watch || args.w || false;
  const summaryOnly = args.summary || args.s || false;
  const forceRegenerate = args['force-regenerate'] || args.f || false;
  const testPrompt = args.prompt || null;

  if (!(await checkBackend())) {
    log('Error: Backend server not running', 'red');
    process.exit(1);
  }

  const { models, resolutions } = loadTestConfig();
  const total = models.length * resolutions.length;
  
  const startTime = Date.now();

  if (summaryOnly) {
    console.log(colors.bold + 'Resolution Test Summary' + colors.reset);
    if (testPrompt) {
      console.log(colors.dim + `Filter: "${testPrompt}"` + colors.reset);
    } else {
      console.log(colors.dim + 'Filter: all jobs' + colors.reset);
    }
    console.log('');

    const jobs = await getAllJobs();
    const { matrix, stats, modelStats } = buildStatusMatrix(jobs, testPrompt, models, resolutions);
    
    renderMatrix(matrix, modelStats, stats, models, resolutions, {
      title: 'Resolution Summary',
      showElapsed: false,
      showControls: false
    });
    return;
  }

  let queuedJobs = new Map();

  if (!watchOnly) {
    const promptToUse = testPrompt || 'a serene mountain landscape at sunset';
    printHeader('Resolution Testing - Queuing Jobs');
    
    log(`Models: ${models.length}`, 'cyan');
    log(`Resolutions: ${resolutions.length}`, 'cyan');
    log(`Total combinations: ${total}`, 'cyan');
    log(`Prompt: "${promptToUse}"`, 'cyan');
    console.log('');

    log('Queuing generations...', 'yellow');

    let queued = 0;
    let skipped = 0;
    let failed = 0;

    for (const model of models) {
      for (const res of resolutions) {
        const size = `${res.width}x${res.height}`;

        if (!forceRegenerate) {
          const existing = await findExistingJob(model, size, promptToUse);
          if (existing) {
            queuedJobs.set(`${model}|${size}`, existing.id);
            skipped++;
            process.stdout.write(`\r  Queued: ${queued}  Skipped: ${skipped}  Failed: ${failed}  `.padEnd(50));
            continue;
          }
        }

        try {
          const jobId = await queueGeneration(model, promptToUse, size);
          queuedJobs.set(`${model}|${size}`, jobId);
          queued++;
        } catch (e) {
          failed++;
        }

        process.stdout.write(`\r  Queued: ${queued}  Skipped: ${skipped}  Failed: ${failed}  `.padEnd(50));
      }
    }

    console.log('');
    log(`Done. Queued: ${queued}, Skipped: ${skipped}, Failed: ${failed}`, 'green');
    console.log('');
  }

  log('Starting monitor... Press Ctrl+C to exit', 'yellow');
  await new Promise(r => setTimeout(r, 1000));

  hideCursor();
  
  const cleanup = () => {
    showCursor();
    clearScreen();
    console.log('Monitor stopped.');
    process.exit(0);
  };
  
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  const promptToUse = testPrompt || 'a serene mountain landscape at sunset';

  while (true) {
    try {
      const jobs = await getAllJobs();
      const { matrix, stats, modelStats } = buildStatusMatrix(jobs, promptToUse, models, resolutions);
      
      clearScreen();
      renderMatrix(matrix, modelStats, stats, models, resolutions, {
        startTime,
        title: 'Resolution Test Monitor',
        showElapsed: true,
        showControls: true
      });
      
      const totalJobs = stats.pending + stats.processing + stats.completed + stats.failed + stats.cancelled;
      if (totalJobs > 0 && stats.pending === 0 && stats.processing === 0) {
        console.log('');
        log('All jobs completed!', 'green');
        cleanup();
      }
    } catch (e) {
      clearScreen();
      log(`Error: ${e.message}`, 'red');
      log('Retrying in 5 seconds...', 'yellow');
      await new Promise(r => setTimeout(r, 5000));
      continue;
    }

    await new Promise(r => setTimeout(r, CONFIG.pollInterval));
  }
}

async function cmdStatus(options = {}) {
  printHeader('Queue Status');

  if (!(await checkBackend())) {
    log('Error: Backend server not running', 'red');
    process.exit(1);
  }

  const stats = await api('/api/queue/stats');
  const jobs = await api('/api/queue');

  log(`Pending: ${stats.pending}`, 'yellow');
  log(`Processing: ${stats.processing}`, 'cyan');
  log(`Completed: ${stats.completed}`, 'green');
  log(`Failed: ${stats.failed}`, 'red');
  console.log('');

  if (jobs.jobs && jobs.jobs.length > 0) {
    log('Recent jobs:', 'bold');
    for (const job of jobs.jobs.slice(0, 10)) {
      const status = job.status === 'completed' ? '✓' : 
                     job.status === 'failed' ? '✗' : 
                     job.status === 'processing' ? '⋯' : '○';
      log(`  ${status} ${job.model.padEnd(20)} ${job.size || '-'.padEnd(12)} ${job.status}`, 
          job.status === 'completed' ? 'green' : 
          job.status === 'failed' ? 'red' : 'dim');
    }
  }
}

function printHelp() {
  console.log(`
Image Generation CLI Tool

Usage:
  node backend/scripts/generate-cli.js <command> [options]

Commands:
  generate              Generate a single image
    --model <id>        Model ID (default: qwen-image)
    --prompt <text>     Prompt text (default: "a beautiful landscape")
    --size <WxH>        Image size (default: 1024x1024)

  test-resolutions      Test all models at all resolutions
    --watch, -w         Watch mode only (don't queue new jobs, just monitor)
    --summary, -s       Show one-time summary of completed tests and exit
    --force-regenerate  Re-queue even if already queued
    -f                  Same as --force-regenerate
    --prompt <text>     Filter by prompt (default: show all jobs for summary,
                        use "a serene mountain landscape at sunset" for queue/watch)

  status                Show queue status

  help                  Show this help

Examples:
  # Generate single image
  node backend/scripts/generate-cli.js generate --model qwen-image --prompt "a cat" --size 512x512

  # Run resolution test (queue + monitor)
  node backend/scripts/generate-cli.js test-resolutions

  # Show summary of all completed tests
  node backend/scripts/generate-cli.js test-resolutions --summary

  # Show summary filtered by prompt
  node backend/scripts/generate-cli.js test-resolutions --summary --prompt "a beautiful sunset"

  # Watch existing queue without adding new jobs
  node backend/scripts/generate-cli.js test-resolutions --watch

  # Force regenerate all (re-queue everything)
  node backend/scripts/generate-cli.js test-resolutions --force-regenerate
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const options = {};

  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options[key] = args[++i];
      } else {
        options[key] = true;
      }
    } else if (args[i].startsWith('-') && args[i] !== '-') {
      const key = args[i].slice(1);
      options[key] = true;
    }
  }

  return { command, options };
}

async function main() {
  const { command, options } = parseArgs();

  if (options['api-key']) {
    CONFIG.apiKey = options['api-key'];
  }

  try {
    switch (command) {
      case 'generate':
        await cmdGenerate(options);
        break;
      case 'test-resolutions':
        await cmdTestResolutions(options);
        break;
      case 'status':
        await cmdStatus(options);
        break;
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;
      default:
        log(`Unknown command: ${command}`, 'red');
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    showCursor();
    log(`Error: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
