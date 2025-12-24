/**
 * Test Server Helper
 *
 * Provides utilities to start/stop the backend server for integration tests.
 * Handles server process management and ensures proper cleanup.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SERVER_STARTUP_TIMEOUT = 30000; // 30 seconds
const SERVER_SHUTDOWN_TIMEOUT = 5000; // 5 seconds
const SERVER_PORT = process.env.TEST_PORT || 3000;
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
    const response = await fetch(`http://${SERVER_HOST}:${SERVER_PORT}/api/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Start the backend server
 * @returns {Promise<void>}
 */
async function startServer() {
  // Check if already starting
  if (isStarting) {
    throw new Error('Server is already starting');
  }

  // Check if server is already running
  if (serverProcess !== null) {
    console.log('Server is already running (process tracked)');
    return;
  }

  // Check if server is running externally (not tracked by us)
  if (await isServerRunning()) {
    console.log('Server is already running (external process)');
    return;
  }

  isStarting = true;

  const serverPath = path.join(__dirname, '../../backend/server.js');

  console.log(`Starting server at ${SERVER_HOST}:${SERVER_PORT}...`);
  console.log(`Server path: ${serverPath}`);

  // Spawn the server process
  serverProcess = spawn('node', [serverPath], {
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: SERVER_PORT,
      HOST: SERVER_HOST,
      NODE_ENV: 'test'
    }
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
    console.log('No server process to stop');
    return;
  }

  console.log('Stopping server...');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('Server did not stop gracefully, forcing kill');
      serverProcess.kill('SIGKILL');
      serverProcess = null;
      resolve();
    }, SERVER_SHUTDOWN_TIMEOUT);

    serverProcess.once('exit', () => {
      clearTimeout(timeout);
      serverProcess = null;
      console.log('Server stopped');
      resolve();
    });

    // Try graceful shutdown first
    serverProcess.kill('SIGTERM');

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
