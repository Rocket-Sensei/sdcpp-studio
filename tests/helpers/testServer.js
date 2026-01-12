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
 * @param {boolean} force - Force restart even if server is running
 * @returns {Promise<void>}
 */
async function startServer(force = false) {
  // Check if already starting
  if (isStarting) {
    throw new Error('Server is already starting');
  }

  // If forcing a restart, stop any existing server first
  if (force) {
    if (serverProcess !== null) {
      await stopServer();
    }
    // Wait a bit for the port to be released
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if there's still an external process running and kill it
    if (await isServerRunning()) {
      console.log('External server still running, waiting for port to be released...');
      let attempts = 0;
      while (await isServerRunning() && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 250));
        attempts++;
      }
      if (await isServerRunning()) {
        throw new Error('Failed to stop existing server after 5 seconds');
      }
    }
  } else {
    // Check if server is already running (tracked)
    if (serverProcess !== null) {
      console.log('Server is already running (process tracked)');
      return;
    }

    // Check if server is running externally (not tracked by us)
    if (await isServerRunning()) {
      console.log('Server is already running (external process) - killing it...');
      // Kill the external process and start fresh
      await stopServer();
      await new Promise(resolve => setTimeout(resolve, 500));
    }
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
    // Check if there's an external server running (from a previous test run)
    if (await isServerRunning()) {
      console.log('Stopping external server by finding and killing its process...');
      // Try to find and kill the process using the port
      try {
        // On Linux/macOS, use lsof to find the process
        const { spawn } = await import('child_process');
        const findProcess = spawn('lsof', ['-ti', `:${SERVER_PORT}`]);
        let pid = '';
        for await (const chunk of findProcess.stdout) {
          pid += chunk.toString();
        }
        pid = pid.trim();
        if (pid) {
          process.kill(parseInt(pid), 'SIGTERM');
          // Wait for it to exit
          await new Promise(resolve => setTimeout(resolve, 500));
          // Check if still running, force kill if needed
          if (await isServerRunning()) {
            process.kill(parseInt(pid), 'SIGKILL');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          console.log('External server stopped');
        }
      } catch (e) {
        console.log('Could not stop external server:', e.message);
      }
    }
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
