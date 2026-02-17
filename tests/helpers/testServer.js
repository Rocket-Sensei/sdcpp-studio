/**
 * Test Server Helper
 *
 * Provides utilities to start/stop the backend server for integration tests.
 * Handles server process management and ensures proper cleanup.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_STARTUP_TIMEOUT = 30000; // 30 seconds
const SERVER_SHUTDOWN_TIMEOUT = 5000; // 5 seconds
// Use a different port for testing to avoid conflicts with running servers
const SERVER_PORT = process.env.TEST_PORT || 3999;
const SERVER_HOST = process.env.TEST_HOST || '127.0.0.1';

let serverProcess = null;
let isStarting = false;

/**
 * Wait for the server to be ready by polling the health endpoint
 */
async function waitForServer(timeout = SERVER_STARTUP_TIMEOUT) {
  const startTime = Date.now();
  const healthUrl = `http://${SERVER_HOST}:${SERVER_PORT}/api/health`;

  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Server not ready yet, continue polling
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  throw new Error(`Server failed to start within ${timeout}ms`);
}

/**
 * Check if the server is already running
 */
async function isServerRunning() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const response = await fetch(`http://${SERVER_HOST}:${SERVER_PORT}/api/health`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Start the backend server
 * @param {boolean} force - Force restart even if server is running
 * @returns {Promise<void>}
 */
async function startServer(force = false) {
  // Check if already starting
  if (isStarting) {
    throw new Error('Server is already starting');
  }

  // Check if server is already running (tracked)
  if (serverProcess !== null && !force) {
    console.log('Server is already running (process tracked)');
    return;
  }

  // If forcing a restart, stop any existing server first
  if (force && serverProcess !== null) {
    await stopServer();
    // Wait a bit for the port to be released
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Check if server is running externally (not tracked by us)
  // Since we use a unique test port (3999), this should rarely happen
  let runningChecks = 0;
  while (await isServerRunning() && runningChecks < 3) {
    runningChecks++;
    console.log(`Server is already running on test port - check ${runningChecks}/3`);
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  if (await isServerRunning()) {
    throw new Error(`Server is already running on port ${SERVER_PORT}. Please stop it manually or use a different port.`);
  }

  isStarting = true;

  const serverPath = path.join(__dirname, '../../backend/server.js');

  console.log(`Starting server at ${SERVER_HOST}:${SERVER_PORT}...`);
  console.log(`Server path: ${serverPath}`);

  // Spawn the server process
  // Create test environment without API_KEY (tests run without authentication)
  const testEnv = { ...process.env };
  testEnv.PORT = SERVER_PORT;
  testEnv.HOST = SERVER_HOST;
  testEnv.NODE_ENV = 'test';
  testEnv.DB_PATH = process.env.DB_PATH;
  testEnv.IMAGES_DIR = process.env.IMAGES_DIR;
  // Remove API_KEY from environment so tests run without authentication
  delete testEnv.API_KEY;

  serverProcess = spawn('node', [serverPath], {
    stdio: 'pipe',
    env: testEnv
  });

  // Handle server output (optional logging)
  serverProcess.stdout.on('data', (data) => {
    // Uncomment to see server output:
    // console.log(`[Server stdout] ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Server stderr] ${data}`);
  });

  // Handle server exit
  serverProcess.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code}, signal ${signal}`);
    serverProcess = null;
  });

  serverProcess.on('error', (error) => {
    console.error(`Server process error: ${error}`);
    serverProcess = null;
    isStarting = false;
  });

  // Wait for server to be ready
  try {
    await waitForServer();
    console.log('Server started successfully');
    isStarting = false;
  } catch (error) {
    console.error('Failed to start server:', error);
    // Cleanup failed process
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }
    isStarting = false;
    throw error;
  }
}

/**
 * Stop the backend server
 * @returns {Promise<void>}
 */
async function stopServer() {
  if (!serverProcess) {
    return;
  }

  console.log('Stopping server...');

  // Disconnect stdio to prevent hanging on pipe writes
  if (serverProcess.stdout) {
    try {
      serverProcess.stdout.destroy();
    } catch (e) {
      // Ignore
    }
  }
  if (serverProcess.stderr) {
    try {
      serverProcess.stderr.destroy();
    } catch (e) {
      // Ignore
    }
  }

  return new Promise((resolve) => {
    const cleanup = () => {
      serverProcess = null;
      console.log('Server stopped');
      resolve();
    };

    const timeout = setTimeout(() => {
      console.log('Server did not stop gracefully, forcing kill');
      try {
        serverProcess.kill('SIGKILL');
      } catch (e) {
        // Process may already be dead
      }
      cleanup();
    }, SERVER_SHUTDOWN_TIMEOUT);

    serverProcess.once('exit', (code, signal) => {
      clearTimeout(timeout);
      console.log(`Server process exited with code ${code}, signal ${signal}`);
      cleanup();
    });

    // Try graceful shutdown first
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {
      // Process may already be dead
      clearTimeout(timeout);
      cleanup();
    }

    // If no exit event fired within timeout, the timeout handler will force kill
  });
}

/**
 * Restart the server (stop and start)
 * @returns {Promise<void>}
 */
async function restartServer() {
  await stopServer();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause
  await startServer();
}

export {
  startServer,
  stopServer,
  restartServer,
  isServerRunning,
  SERVER_PORT,
  SERVER_HOST
};
