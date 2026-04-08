#!/usr/bin/env node
/**
 * SD.cpp Studio - Systemd User Service Setup
 * 
 * This script sets up the application as a systemd user service.
 * It creates the systemd unit file, enables it, and optionally starts it.
 * 
 * Usage:
 *   npm run systemd:setup              # Interactive setup
 *   npm run systemd:setup -- --start   # Setup and start immediately
 *   npm run systemd:setup -- --force   # Overwrite existing service file
 */

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Configuration
const SERVICE_NAME = 'sd-cpp-studio';
const SERVICE_TEMPLATE = join(PROJECT_ROOT, 'scripts', 'sd-cpp-studio.service.template');
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
 * Get the full path to npm
 */
function getNpmPath() {
  try {
    return exec('which npm', { stdio: 'pipe' }).trim();
  } catch {
    return 'npm';
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
 * Generate the service file from template
 */
function generateServiceFile() {
  if (!existsSync(SERVICE_TEMPLATE)) {
    throw new Error(`Service template not found: ${SERVICE_TEMPLATE}`);
  }

  const template = readFileSync(SERVICE_TEMPLATE, 'utf-8');
  const npmPath = getNpmPath();
  
  // Replace template variables
  let serviceContent = template
    .replace(/\{\{WORKING_DIRECTORY\}\}/g, PROJECT_ROOT)
    .replace(/\{\{NPM_PATH\}\}/g, npmPath)
    .replace(/\{\{ENV_FILE\}\}/g, ENV_FILE)
    .replace(/\{\{ALLOWED_HOSTS\}\}/g, DEFAULTS.ALLOWED_HOSTS)
    .replace(/\{\{BACKEND_HOST\}\}/g, DEFAULTS.BACKEND_HOST)
    .replace(/\{\{HOST\}\}/g, DEFAULTS.HOST);

  return serviceContent;
}

/**
 * Install the service file
 */
function installServiceFile(content) {
  const servicePath = join(SYSTEMD_USER_DIR, `${SERVICE_NAME}.service`);
  
  if (existsSync(servicePath) && !forceOverwrite) {
    log('warn', `Service file already exists: ${servicePath}`);
    log('info', 'Use --force to overwrite');
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
 * Enable the service
 */
function enableService() {
  log('info', `Enabling ${SERVICE_NAME} service...`);
  exec(`systemctl --user enable ${SERVICE_NAME}.service`);
  log('success', `Service ${SERVICE_NAME} enabled`);
}

/**
 * Start the service
 */
function startService() {
  log('info', `Starting ${SERVICE_NAME} service...`);
  try {
    exec(`systemctl --user start ${SERVICE_NAME}.service`);
    log('success', `Service ${SERVICE_NAME} started`);
    return true;
  } catch (error) {
    log('error', `Failed to start service: ${error.message}`);
    return false;
  }
}

/**
 * Check service status
 */
function checkStatus() {
  try {
    const status = exec(`systemctl --user status ${SERVICE_NAME}.service --no-pager`, { 
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
function printStatus() {
  const status = checkStatus();
  if (status) {
    console.log('\n--- Service Status ---\n');
    console.log(status);
  }
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Usage: npm run systemd:setup [options]

Options:
  --start     Start the service immediately after setup
  --force     Overwrite existing service file
  -v, --verbose  Show verbose output

Commands after setup:
  systemctl --user start ${SERVICE_NAME}      # Start the service
  systemctl --user stop ${SERVICE_NAME}       # Stop the service
  systemctl --user restart ${SERVICE_NAME}    # Restart the service
  systemctl --user status ${SERVICE_NAME}     # Check service status
  journalctl --user -u ${SERVICE_NAME} -f     # Follow logs
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

  // Ensure environment file exists
  if (!existsSync(ENV_FILE)) {
    log('warn', `Environment file not found: ${ENV_FILE}`);
    log('info', 'Creating default environment file...');
    const defaultEnv = `# SD.cpp Studio Production Environment Variables
ALLOWED_HOSTS=${DEFAULTS.ALLOWED_HOSTS}
BACKEND_HOST=${DEFAULTS.BACKEND_HOST}
HOST=${DEFAULTS.HOST}
NODE_ENV=production
`;
    writeFileSync(ENV_FILE, defaultEnv);
  }

  // Create systemd directory
  createSystemdDir();

  // Generate and install service file
  try {
    const serviceContent = generateServiceFile();
    const installed = installServiceFile(serviceContent);
    
    if (!installed && !forceOverwrite) {
      log('info', 'Setup skipped (service file exists)');
      printUsage();
      process.exit(0);
    }
  } catch (error) {
    log('error', `Failed to install service: ${error.message}`);
    process.exit(1);
  }

  // Reload daemon
  reloadDaemon();

  // Enable service
  enableService();

  // Start service if requested
  if (shouldStart) {
    const started = startService();
    if (started) {
      // Wait a moment and show status
      await new Promise(resolve => setTimeout(resolve, 1000));
      printStatus();
    }
  } else {
    log('info', 'Service is enabled but not started');
    log('info', `Run: systemctl --user start ${SERVICE_NAME}`);
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
