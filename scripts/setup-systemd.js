#!/usr/bin/env node
/**
 * SD.cpp Studio - Systemd User Service Setup
 * 
 * This script sets up the application as systemd user services.
 * It creates two services:
 *   - sd-cpp-studio-backend:  The API server (loads backend/.env)
 *   - sd-cpp-studio-frontend: The Vite dev server
 * 
 * Usage:
 *   npm run systemd:setup              # Interactive setup
 *   npm run systemd:setup -- --start   # Setup and start immediately
 *   npm run systemd:setup -- --force   # Overwrite existing service files
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Configuration
const SERVICES = [
  { name: 'sd-cpp-studio-backend', template: 'sd-cpp-studio-backend.service.template' },
  { name: 'sd-cpp-studio-frontend', template: 'sd-cpp-studio-frontend.service.template' }
];
const ENV_FILE = join(PROJECT_ROOT, '.env.production');
const SYSTEMD_USER_DIR = join(homedir(), '.config', 'systemd', 'user');

// Default values
const DEFAULTS = {
  ALLOWED_HOSTS: 'studio.rscx.ru',
  BACKEND_HOST: '192.168.1.48',
  HOST: '192.168.1.48'
};

// Parse command line arguments
const args = process.argv.slice(2);
const shouldStart = args.includes('--start');
const forceOverwrite = args.includes('--force');
const verbose = args.includes('--verbose') || args.includes('-v');

/**
 * Print a formatted message
 */
function log(level, message) {
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    warn: '\x1b[33m',    // Yellow
    error: '\x1b[31m',   // Red
    reset: '\x1b[0m'
  };
  
  const prefix = {
    info: 'ℹ',
    success: '✓',
    warn: '⚠',
    error: '✗'
  };
  
  console.log(`${colors[level]}${prefix[level]}${colors.reset} ${message}`);
}

/**
 * Execute a shell command and return output
 */
function exec(command, options = {}) {
  try {
    return execSync(command, { 
      encoding: 'utf-8',
      stdio: verbose ? 'inherit' : 'pipe',
      ...options 
    });
  } catch (error) {
    if (options.ignoreError) return null;
    throw error;
  }
}

/**
 * Check if systemd is available
 */
function checkSystemd() {
  try {
    exec('systemctl --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the full path to a command
 */
function getCommandPath(cmd) {
  try {
    return exec(`which ${cmd}`, { stdio: 'pipe' }).trim();
  } catch {
    return cmd;
  }
}

/**
 * Create systemd user directory structure
 */
function createSystemdDir() {
  if (!existsSync(SYSTEMD_USER_DIR)) {
    log('info', `Creating systemd user directory: ${SYSTEMD_USER_DIR}`);
    mkdirSync(SYSTEMD_USER_DIR, { recursive: true });
  }
}

/**
 * Generate service file from template
 */
function generateServiceFile(templateName) {
  const templatePath = join(PROJECT_ROOT, 'scripts', templateName);
  if (!existsSync(templatePath)) {
    throw new Error(`Service template not found: ${templatePath}`);
  }

  const template = readFileSync(templatePath, 'utf-8');
  const npmPath = getCommandPath('npm');
  const nodePath = getCommandPath('node');
  
  // Replace template variables
  let serviceContent = template
    .replace(/\{\{WORKING_DIRECTORY\}\}/g, PROJECT_ROOT)
    .replace(/\{\{NPM_PATH\}\}/g, npmPath)
    .replace(/\{\{NODE_PATH\}\}/g, nodePath)
    .replace(/\{\{ENV_FILE\}\}/g, ENV_FILE)
    .replace(/\{\{ALLOWED_HOSTS\}\}/g, DEFAULTS.ALLOWED_HOSTS)
    .replace(/\{\{BACKEND_HOST\}\}/g, DEFAULTS.BACKEND_HOST)
    .replace(/\{\{HOST\}\}/g, DEFAULTS.HOST);

  return serviceContent;
}

/**
 * Install a service file
 */
function installServiceFile(name, content) {
  const servicePath = join(SYSTEMD_USER_DIR, `${name}.service`);
  
  if (existsSync(servicePath) && !forceOverwrite) {
    log('warn', `Service file already exists: ${servicePath}`);
    return false;
  }

  writeFileSync(servicePath, content);
  log('success', `Service file created: ${servicePath}`);
  return true;
}

/**
 * Reload systemd daemon
 */
function reloadDaemon() {
  log('info', 'Reloading systemd daemon...');
  exec('systemctl --user daemon-reload');
  log('success', 'Systemd daemon reloaded');
}

/**
 * Enable a service
 */
function enableService(name) {
  log('info', `Enabling ${name} service...`);
  exec(`systemctl --user enable ${name}.service`);
  log('success', `Service ${name} enabled`);
}

/**
 * Start a service
 */
function startService(name) {
  log('info', `Starting ${name} service...`);
  try {
    exec(`systemctl --user start ${name}.service`);
    log('success', `Service ${name} started`);
    return true;
  } catch (error) {
    log('error', `Failed to start ${name}: ${error.message}`);
    return false;
  }
}

/**
 * Stop a service
 */
function stopService(name) {
  try {
    exec(`systemctl --user stop ${name}.service`, { ignoreError: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check service status
 */
function checkStatus(name) {
  try {
    const status = exec(`systemctl --user status ${name}.service --no-pager`, { 
      stdio: 'pipe',
      ignoreError: true 
    });
    return status;
  } catch {
    return null;
  }
}

/**
 * Print service status
 */
function printStatus(name) {
  const status = checkStatus(name);
  if (status) {
    console.log(`\n--- ${name} Status ---\n`);
    console.log(status);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Service Management Commands:
  systemctl --user start sd-cpp-studio-backend   # Start backend only
  systemctl --user start sd-cpp-studio-frontend  # Start frontend (auto-starts backend)
  systemctl --user stop sd-cpp-studio-frontend   # Stop frontend only
  systemctl --user stop sd-cpp-studio-backend    # Stop backend (stops both)
  
  # Or use npm shortcuts:
  npm run systemd:start     # Start both services
  npm run systemd:stop      # Stop both services
  npm run systemd:restart   # Restart both services
  npm run systemd:status    # Check status of both services
  npm run systemd:logs      # Follow logs from both services

Log Commands:
  journalctl --user -u sd-cpp-studio-backend -f   # Backend logs
  journalctl --user -u sd-cpp-studio-frontend -f  # Frontend logs
  journalctl --user -u 'sd-cpp-studio*' -f        # All logs
`);
}

/**
 * Main setup function
 */
async function main() {
  console.log('\n========================================');
  console.log('  SD.cpp Studio - Systemd Setup');
  console.log('========================================\n');

  // Check for help
  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  // Check systemd availability
  if (!checkSystemd()) {
    log('error', 'systemctl not found. Is systemd installed?');
    process.exit(1);
  }

  // Check backend .env exists
  const backendEnv = join(PROJECT_ROOT, 'backend', '.env');
  if (!existsSync(backendEnv)) {
    log('warn', `Backend .env not found: ${backendEnv}`);
    log('info', 'The backend service will still work but may use default configuration.');
  } else {
    log('success', `Backend .env found: ${backendEnv}`);
    log('info', 'The backend will load MODELS_DIR and other settings from this file.');
  }

  // Ensure frontend environment file exists
  if (!existsSync(ENV_FILE)) {
    log('info', `Creating default environment file: ${ENV_FILE}`);
    const defaultEnv = `# SD.cpp Studio Production Environment Variables
ALLOWED_HOSTS=${DEFAULTS.ALLOWED_HOSTS}
BACKEND_HOST=${DEFAULTS.BACKEND_HOST}
HOST=${DEFAULTS.HOST}
NODE_ENV=production
`;
    writeFileSync(ENV_FILE, defaultEnv);
  }

  // Stop existing services if we're force-updating
  if (forceOverwrite) {
    log('info', 'Stopping existing services for update...');
    stopService('sd-cpp-studio-frontend');
    stopService('sd-cpp-studio-backend');
  }

  // Create systemd directory
  createSystemdDir();

  // Install both service files
  let anyInstalled = false;
  for (const service of SERVICES) {
    try {
      const content = generateServiceFile(service.template);
      const installed = installServiceFile(service.name, content);
      if (installed) anyInstalled = true;
    } catch (error) {
      log('error', `Failed to install ${service.name}: ${error.message}`);
      process.exit(1);
    }
  }

  if (!anyInstalled && !forceOverwrite) {
    log('info', 'Setup skipped (service files exist)');
    log('info', 'Use --force to overwrite');
    printUsage();
    process.exit(0);
  }

  // Reload daemon
  reloadDaemon();

  // Enable both services
  for (const service of SERVICES) {
    enableService(service.name);
  }

  // Start services if requested
  if (shouldStart) {
    // Start backend first, then frontend
    startService('sd-cpp-studio-backend');
    
    // Wait a moment for backend to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    startService('sd-cpp-studio-frontend');
    
    // Wait and show status
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('\n========================================');
    console.log('  Services Status');
    console.log('========================================');
    printStatus('sd-cpp-studio-backend');
    printStatus('sd-cpp-studio-frontend');
  } else {
    log('info', 'Services are enabled but not started');
    log('info', 'Run: npm run systemd:start');
  }

  console.log('\n========================================');
  log('success', 'Setup complete!');
  console.log('========================================\n');

  printUsage();
}

main().catch(error => {
  log('error', error.message);
  process.exit(1);
});
