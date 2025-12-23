/**
 * Process Tracker Service
 *
 * Manages running model processes, tracking their PIDs, ports, execution modes,
 * and health status. Handles process registration, cleanup, and port management.
 */

import net from 'net';
import { spawn } from 'child_process';

// Configuration constants
const PORT_RANGE_START = 8000;
const PORT_RANGE_END = 9000;
const HEARTBEAT_INTERVAL_MS = 30000; // 30 seconds
const HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds - process considered dead if no heartbeat
const ZOMBIE_CHECK_INTERVAL_MS = 60000; // 1 minute

// Process storage: Map<modelId, ProcessInfo>
// ProcessInfo: { process, pid, port, execMode, startedAt, lastHeartbeat, status }
const processes = new Map();

// Port tracking: Set of ports currently in use
const usedPorts = new Set();

// Timer references for cleanup
let zombieCheckInterval = null;

/**
 * Process status enum
 */
export const ProcessStatus = {
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  ERROR: 'error',
  ZOMBIE: 'zombie'
};

/**
 * Initialize the process tracker with zombie cleanup
 */
export function initializeProcessTracker() {
  if (zombieCheckInterval) {
    console.log('Process tracker already initialized');
    return;
  }

  console.log('Initializing process tracker...');

  // Clean up any zombie processes on startup
  cleanupZombies();

  // Start periodic zombie check
  zombieCheckInterval = setInterval(() => {
    cleanupZombies();
  }, ZOMBIE_CHECK_INTERVAL_MS);

  // Register shutdown handler
  registerShutdownHandler();

  console.log('Process tracker initialized');
}

/**
 * Shutdown the process tracker and clean up all processes
 */
export function shutdownProcessTracker() {
  console.log('Shutting down process tracker...');

  // Stop zombie check interval
  if (zombieCheckInterval) {
    clearInterval(zombieCheckInterval);
    zombieCheckInterval = null;
  }

  // Kill all running processes
  const allProcesses = getAllProcesses();
  for (const procInfo of allProcesses) {
    try {
      killProcess(procInfo.modelId);
    } catch (error) {
      console.error(`Error killing process ${procInfo.modelId}:`, error.message);
    }
  }

  console.log('Process tracker shut down');
}

/**
 * Register a running process
 *
 * @param {string} modelId - Unique identifier for the model
 * @param {import('child_process').ChildProcess} process - The spawned process
 * @param {number} port - The port the process is listening on
 * @param {string} execMode - Execution mode: 'server' or 'cli'
 * @returns {Object} Process info object
 */
export function registerProcess(modelId, process, port, execMode) {
  if (!modelId) {
    throw new Error('modelId is required');
  }

  if (!process) {
    throw new Error('process is required');
  }

  if (port === undefined || port === null) {
    throw new Error('port is required');
  }

  if (!execMode || !['server', 'cli'].includes(execMode)) {
    throw new Error('execMode must be "server" or "cli"');
  }

  // Check if process already exists for this model
  if (processes.has(modelId)) {
    const existing = processes.get(modelId);
    if (existing.status === ProcessStatus.RUNNING || existing.status === ProcessStatus.STARTING) {
      console.warn(`Process already registered for model ${modelId}, killing existing process`);
      killProcess(modelId);
    }
  }

  const now = Date.now();
  const processInfo = {
    modelId,
    process,
    pid: process.pid,
    port,
    execMode,
    startedAt: now,
    lastHeartbeat: now,
    status: ProcessStatus.STARTING
  };

  processes.set(modelId, processInfo);
  usedPorts.add(port);

  // Set up process event handlers
  setupProcessHandlers(modelId, process);

  console.log(`Registered process for model ${modelId}: PID=${process.pid}, port=${port}, mode=${execMode}`);

  return getProcessInfo(processInfo);
}

/**
 * Set up event handlers for a spawned process
 *
 * @param {string} modelId - Model identifier
 * @param {import('child_process').ChildProcess} process - The child process
 */
function setupProcessHandlers(modelId, process) {
  // Handle process exit
  process.on('exit', (code, signal) => {
    const procInfo = processes.get(modelId);
    if (procInfo) {
      console.log(`Process for model ${modelId} exited: code=${code}, signal=${signal}`);
      procInfo.status = ProcessStatus.STOPPED;
      // Don't remove from map immediately, allow cleanupZombies to handle it
      // This allows callers to check final status
    }
    // Release port
    if (procInfo && procInfo.port) {
      usedPorts.delete(procInfo.port);
    }
  });

  // Handle process error
  process.on('error', (error) => {
    console.error(`Process error for model ${modelId}:`, error);
    const procInfo = processes.get(modelId);
    if (procInfo) {
      procInfo.status = ProcessStatus.ERROR;
      procInfo.error = error.message;
    }
    // Release port on error
    if (procInfo && procInfo.port) {
      usedPorts.delete(procInfo.port);
    }
  });

  // Handle stdout for health monitoring (server mode processes)
  if (process.stdout) {
    process.stdout.on('data', (data) => {
      const procInfo = processes.get(modelId);
      if (procInfo) {
        // Update heartbeat on any output
        procInfo.lastHeartbeat = Date.now();
        // If we were in starting state, consider process running once we see output
        if (procInfo.status === ProcessStatus.STARTING) {
          procInfo.status = ProcessStatus.RUNNING;
        }
      }
    });
  }

  // Handle stderr
  if (process.stderr) {
    process.stderr.on('data', (data) => {
      const procInfo = processes.get(modelId);
      if (procInfo) {
        // Update heartbeat on stderr output too (some processes log to stderr)
        procInfo.lastHeartbeat = Date.now();
      }
    });
  }
}

/**
 * Unregister a process
 *
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if process was unregistered
 */
export function unregisterProcess(modelId) {
  const procInfo = processes.get(modelId);
  if (!procInfo) {
    return false;
  }

  // Release port
  if (procInfo.port) {
    usedPorts.delete(procInfo.port);
  }

  processes.delete(modelId);
  console.log(`Unregistered process for model ${modelId}`);
  return true;
}

/**
 * Get process information by model ID
 *
 * @param {string} modelId - Model identifier
 * @returns {Object|null} Process info object or null if not found
 */
export function getProcess(modelId) {
  const procInfo = processes.get(modelId);
  if (!procInfo) {
    return null;
  }

  // Refresh heartbeat timestamp check
  const info = getProcessInfo(procInfo);

  // Check if process is still alive
  if (info.status === ProcessStatus.RUNNING || info.status === ProcessStatus.STARTING) {
    const isAlive = checkProcessAlive(procInfo);
    if (!isAlive) {
      info.status = ProcessStatus.ZOMBIE;
      procInfo.status = ProcessStatus.ZOMBIE;
    }
  }

  return info;
}

/**
 * Get all registered processes
 *
 * @returns {Array} Array of process info objects
 */
export function getAllProcesses() {
  const result = [];
  for (const [modelId, procInfo] of processes.entries()) {
    const info = getProcessInfo(procInfo);

    // Check if process is still alive
    if (info.status === ProcessStatus.RUNNING || info.status === ProcessStatus.STARTING) {
      const isAlive = checkProcessAlive(procInfo);
      if (!isAlive) {
        info.status = ProcessStatus.ZOMBIE;
        procInfo.status = ProcessStatus.ZOMBIE;
      }
    }

    result.push(info);
  }
  return result;
}

/**
 * Get process info object (cloned, without the raw process object)
 *
 * @param {Object} procInfo - Internal process info
 * @returns {Object} Public process info
 */
function getProcessInfo(procInfo) {
  return {
    modelId: procInfo.modelId,
    pid: procInfo.pid,
    port: procInfo.port,
    execMode: procInfo.execMode,
    startedAt: procInfo.startedAt,
    lastHeartbeat: procInfo.lastHeartbeat,
    status: procInfo.status,
    uptime: Date.now() - procInfo.startedAt,
    error: procInfo.error || null
  };
}

/**
 * Kill a process by model ID
 *
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if process was killed
 */
export function killProcess(modelId) {
  const procInfo = processes.get(modelId);
  if (!procInfo) {
    console.warn(`No process found for model ${modelId}`);
    return false;
  }

  const pid = procInfo.pid;
  const port = procInfo.port;

  // Update status to stopping
  procInfo.status = ProcessStatus.STOPPING;

  // Try to kill the process gracefully first
  if (procInfo.process && procInfo.process.pid) {
    try {
      // Try SIGTERM first
      process.kill(procInfo.process.pid, 'SIGTERM');

      // Give it 5 seconds, then SIGKILL
      setTimeout(() => {
        try {
          process.kill(procInfo.process.pid, 'SIGKILL');
        } catch (e) {
          // Process might already be dead, which is fine
        }
      }, 5000);
    } catch (error) {
      // If the process doesn't exist, we can still clean up the tracking
      console.warn(`Process ${pid} not found, cleaning up tracking`);
    }
  }

  // Release port
  if (port) {
    usedPorts.delete(port);
  }

  // Remove from processes map
  processes.delete(modelId);

  console.log(`Killed process for model ${modelId} (PID: ${pid})`);
  return true;
}

/**
 * Clean up zombie processes
 *
 * A zombie process is one that:
 * - Has exited but is still in the map
 * - Hasn't sent a heartbeat within HEARTBEAT_TIMEOUT_MS
 * - Has a PID that no longer exists
 *
 * @returns {number} Number of zombies cleaned up
 */
export function cleanupZombies() {
  const now = Date.now();
  const zombies = [];

  for (const [modelId, procInfo] of processes.entries()) {
    let isZombie = false;

    // Check 1: Process status is STOPPED (exited)
    if (procInfo.status === ProcessStatus.STOPPED) {
      isZombie = true;
    }

    // Check 2: Heartbeat timeout
    if (!isZombie && (now - procInfo.lastHeartbeat) > HEARTBEAT_TIMEOUT_MS) {
      isZombie = true;
      console.warn(`Process ${modelId} (PID: ${procInfo.pid}) heartbeat timeout`);
    }

    // Check 3: PID no longer exists
    if (!isZombie && !checkProcessAlive(procInfo)) {
      isZombie = true;
      console.warn(`Process ${modelId} (PID: ${procInfo.pid}) no longer exists`);
    }

    if (isZombie) {
      zombies.push(modelId);
    }
  }

  // Clean up zombies
  for (const modelId of zombies) {
    const procInfo = processes.get(modelId);
    console.log(`Cleaning up zombie process: ${modelId} (PID: ${procInfo?.pid})`);

    // Release port
    if (procInfo && procInfo.port) {
      usedPorts.delete(procInfo.port);
    }

    processes.delete(modelId);
  }

  if (zombies.length > 0) {
    console.log(`Cleaned up ${zombies.length} zombie process(es)`);
  }

  return zombies.length;
}

/**
 * Check if a process is still alive
 *
 * @param {Object} procInfo - Process info object
 * @returns {boolean} True if process is alive
 */
function checkProcessAlive(procInfo) {
  if (!procInfo || !procInfo.pid) {
    return false;
  }

  try {
    // Send signal 0 to check if process exists
    // This doesn't actually kill the process
    process.kill(procInfo.pid, 0);
    return true;
  } catch (error) {
    // ESRCH means no such process
    return false;
  }
}

/**
 * Check if a port is available
 *
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} True if port is available
 */
export function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createConnection({ port, host: '127.0.0.1' });

    server.on('connect', () => {
      server.destroy();
      resolve(false); // Port is in use
    });

    server.on('error', (error) => {
      server.destroy();
      // ECONNREFUSED means port is not in use
      resolve(error.code === 'ECONNREFUSED');
    });

    // Set timeout
    setTimeout(() => {
      server.destroy();
      resolve(false); // Treat timeout as port in use
    }, 1000);
  });
}

/**
 * Get an available port within the configured range
 *
 * @returns {Promise<number>} Available port number
 * @throws {Error} If no ports available
 */
export async function getAvailablePort() {
  // First try ports not in our used set
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!usedPorts.has(port)) {
      const available = await isPortAvailable(port);
      if (available) {
        return port;
      }
    }
  }

  // If no luck, scan again including used ports (might be stale)
  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }

  throw new Error(`No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Send a heartbeat for a process (updates last activity timestamp)
 *
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if heartbeat was recorded
 */
export function sendHeartbeat(modelId) {
  const procInfo = processes.get(modelId);
  if (!procInfo) {
    return false;
  }

  procInfo.lastHeartbeat = Date.now();
  if (procInfo.status === ProcessStatus.STARTING) {
    procInfo.status = ProcessStatus.RUNNING;
  }

  return true;
}

/**
 * Update process status
 *
 * @param {string} modelId - Model identifier
 * @param {string} status - New status
 * @returns {boolean} True if status was updated
 */
export function updateProcessStatus(modelId, status) {
  const procInfo = processes.get(modelId);
  if (!procInfo) {
    return false;
  }

  if (!Object.values(ProcessStatus).includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }

  procInfo.status = status;
  procInfo.lastHeartbeat = Date.now();

  return true;
}

/**
 * Get process statistics
 *
 * @returns {Object} Statistics about tracked processes
 */
export function getProcessStats() {
  const stats = {
    total: processes.size,
    byStatus: {},
    byExecMode: { server: 0, cli: 0 },
    portsUsed: usedPorts.size
  };

  for (const procInfo of processes.values()) {
    // Count by status
    if (!stats.byStatus[procInfo.status]) {
      stats.byStatus[procInfo.status] = 0;
    }
    stats.byStatus[procInfo.status]++;

    // Count by exec mode
    if (procInfo.execMode === 'server' || procInfo.execMode === 'cli') {
      stats.byExecMode[procInfo.execMode]++;
    }
  }

  return stats;
}

/**
 * Register shutdown handler to clean up processes on exit
 */
function registerShutdownHandler() {
  const shutdownHandler = async (signal) => {
    console.log(`Received ${signal}, shutting down processes...`);
    shutdownProcessTracker();
    process.exit(0);
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);
}

/**
 * Check if a model process is running
 *
 * @param {string} modelId - Model identifier
 * @returns {boolean} True if process is running
 */
export function isProcessRunning(modelId) {
  const procInfo = getProcess(modelId);
  if (!procInfo) {
    return false;
  }
  return (
    procInfo.status === ProcessStatus.RUNNING ||
    procInfo.status === ProcessStatus.STARTING
  );
}

/**
 * Get processes by execution mode
 *
 * @param {string} execMode - Execution mode: 'server' or 'cli'
 * @returns {Array} Array of process info objects
 */
export function getProcessesByExecMode(execMode) {
  const allProcesses = getAllProcesses();
  return allProcesses.filter(p => p.execMode === execMode);
}

/**
 * Get process by port
 *
 * @param {number} port - Port number
 * @returns {Object|null} Process info object or null
 */
export function getProcessByPort(port) {
  const allProcesses = getAllProcesses();
  return allProcesses.find(p => p.port === port) || null;
}

// Auto-initialize on module import
initializeProcessTracker();

// Export a processTracker object for convenience
export const processTracker = {
  registerProcess,
  unregisterProcess,
  getProcess,
  getAllProcesses,
  killProcess,
  cleanupZombies,
  isPortAvailable,
  getAvailablePort,
  sendHeartbeat,
  updateProcessStatus,
  getProcessStats,
  isProcessRunning,
  getProcessesByExecMode,
  getProcessByPort,
  initialize: initializeProcessTracker,
  shutdown: shutdownProcessTracker
};

// Export for testing
export {
  processes as _processes,
  usedPorts as _usedPorts,
  PORT_RANGE_START,
  PORT_RANGE_END,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  ZOMBIE_CHECK_INTERVAL_MS
};
