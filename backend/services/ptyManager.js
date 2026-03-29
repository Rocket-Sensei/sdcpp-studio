/**
 * PTY Manager Service
 *
 * Manages pseudo-terminal (PTY) sessions for real-time terminal output
 * from SD.cpp/llama.cpp/wan processes.
 *
 * Uses node-pty for cross-platform PTY support.
 * Streams output via WebSocket terminal channel.
 */

import { spawn } from 'child_process';
import * as pty from 'node-pty';
import { broadcastTerminalLog } from './websocket.js';
import { createLogger, getSdCppLogger } from '../utils/logger.js';

const logger = createLogger('ptyManager');

const activeSessions = new Map();

/**
 * PTY Session entry
 */
class PtySession {
  constructor(id, ptyProcess, options = {}) {
    this.id = id;
    this.pty = ptyProcess;
    this.modelId = options.modelId || null;
    this.generationId = options.generationId || null;
    this.command = options.command || '';
    this.args = options.args || [];
    this.startedAt = Date.now();
    this.lastOutputAt = Date.now();
    this.outputBuffer = [];
    this.isAlive = true;
  }

  /**
   * Write input to PTY
   */
  write(data) {
    if (this.pty && this.isAlive) {
      try {
        this.pty.write(data);
        return true;
      } catch (error) {
        logger.error({ error, sessionId: this.id }, 'Failed to write to PTY');
        return false;
      }
    }
    return false;
  }

  /**
   * Resize PTY terminal
   */
  resize(cols, rows) {
    if (this.pty && this.isAlive) {
      try {
        this.pty.resize(cols, rows);
        return true;
      } catch (error) {
        logger.error({ error, sessionId: this.id }, 'Failed to resize PTY');
        return false;
      }
    }
    return false;
  }

  /**
   * Kill PTY session
   */
  kill() {
    if (this.pty && this.isAlive) {
      this.isAlive = false;
      try {
        this.pty.kill();
      } catch (error) {
        logger.warn({ error, sessionId: this.id }, 'Error killing PTY');
      }
    }
  }

  /**
   * Get session info
   */
  getInfo() {
    return {
      id: this.id,
      modelId: this.modelId,
      generationId: this.generationId,
      command: this.command,
      args: this.args,
      startedAt: this.startedAt,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      isAlive: this.isAlive,
    };
  }
}

/**
 * Create a new PTY session
 * @param {Object} options - Session options
 * @param {string} options.command - Command to execute
 * @param {string[]} options.args - Command arguments
 * @param {string} options.cwd - Working directory
 * @param {Object} options.env - Environment variables
 * @param {string} options.modelId - Associated model ID
 * @param {string} options.generationId - Associated generation ID
 * @param {Function} options.onOutput - Optional callback for output
 * @returns {PtySession} Created session
 */
export function createPtySession(options) {
  const {
    command,
    args = [],
    cwd = process.cwd(),
    env = process.env,
    modelId = null,
    generationId = null,
    onOutput = null,
  } = options;

  const sessionId = `pty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  logger.info({ sessionId, command, args, cwd, modelId, generationId }, 'Creating PTY session');

  try {
    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd,
      env,
    });

    const session = new PtySession(sessionId, ptyProcess, {
      modelId,
      generationId,
      command,
      args,
    });

    ptyProcess.onData((data) => {
      session.lastOutputAt = Date.now();

      const logData = {
        generationId: generationId,
        content: data,
        raw: data,
        level: 'info',
        timestamp: new Date().toISOString(),
        sessionId,
      };

      if (onOutput) {
        onOutput(logData);
      }

      broadcastTerminalLog(logData);
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      logger.info({ sessionId, exitCode, signal }, 'PTY session exited');
      session.isAlive = false;

      const exitData = {
        generationId: generationId,
        content: `\n[Process exited with code ${exitCode}, signal ${signal}]\n`,
        raw: `[Process exited with code ${exitCode}, signal ${signal}]`,
        level: exitCode === 0 ? 'info' : 'error',
        timestamp: new Date().toISOString(),
        sessionId,
        exitCode,
        signal,
      };

      broadcastTerminalLog(exitData);

      activeSessions.delete(sessionId);

      if (onOutput) {
        onOutput(exitData);
      }
    });

    activeSessions.set(sessionId, session);

    logger.info({ sessionId, pid: ptyProcess.pid }, 'PTY session created');

    return session;

  } catch (error) {
    logger.error({ error, command, args }, 'Failed to create PTY session');
    throw error;
  }
}

/**
 * Get a PTY session by ID
 * @param {string} sessionId - Session ID
 * @returns {PtySession|null}
 */
export function getPtySession(sessionId) {
  return activeSessions.get(sessionId) || null;
}

/**
 * Write to a PTY session
 * @param {string} sessionId - Session ID
 * @param {string} data - Data to write
 * @returns {boolean} Success
 */
export function writeToPty(sessionId, data) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    logger.warn({ sessionId }, 'PTY session not found for write');
    return false;
  }
  return session.write(data);
}

/**
 * Resize a PTY session
 * @param {string} sessionId - Session ID
 * @param {number} cols - Columns
 * @param {number} rows - Rows
 * @returns {boolean} Success
 */
export function resizePty(sessionId, cols, rows) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    logger.warn({ sessionId }, 'PTY session not found for resize');
    return false;
  }
  return session.resize(cols, rows);
}

/**
 * Kill a PTY session
 * @param {string} sessionId - Session ID
 * @returns {boolean} Success
 */
export function killPtySession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (!session) {
    logger.warn({ sessionId }, 'PTY session not found for kill');
    return false;
  }

  session.kill();
  activeSessions.delete(sessionId);
  logger.info({ sessionId }, 'PTY session killed');
  return true;
}

/**
 * Get all active PTY sessions
 * @returns {Array} Array of session info objects
 */
export function getAllPtySessions() {
  return Array.from(activeSessions.values()).map(s => s.getInfo());
}

/**
 * Kill all PTY sessions
 */
export function killAllPtySessions() {
  logger.info({ count: activeSessions.size }, 'Killing all PTY sessions');
  for (const [sessionId, session] of activeSessions) {
    session.kill();
  }
  activeSessions.clear();
}

/**
 * Create a PTY session for a model process (server mode)
 * This wraps modelManager's spawn with PTY support
 * @param {string} modelId - Model ID
 * @param {Object} modelConfig - Model configuration
 * @param {Object} options - Startup options (port, etc.)
 * @returns {PtySession} Created session
 */
export function createModelPtySession(modelId, modelConfig, options = {}) {
  const command = options.command || modelConfig.command;
  const args = options.args || modelConfig.args || [];

  const sessionId = `model-pty-${modelId}-${Date.now()}`;

  logger.info({ sessionId, modelId, command, args }, 'Creating model PTY session');

  const session = createPtySession({
    command,
    args,
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...options.env },
    modelId,
    generationId: options.generationId || null,
  });

  return session;
}

/**
 * Broadcast log to terminal session
 * @param {string} generationId - Generation ID
 * @param {string} content - Log content
 * @param {string} level - Log level
 * @param {Object} extra - Extra data
 */
export function broadcastLog(generationId, content, level = 'info', extra = {}) {
  broadcastTerminalLog({
    generationId,
    content,
    raw: content,
    level,
    timestamp: new Date().toISOString(),
    ...extra,
  });
}

export default {
  createPtySession,
  getPtySession,
  writeToPty,
  resizePty,
  killPtySession,
  getAllPtySessions,
  killAllPtySessions,
  createModelPtySession,
  broadcastLog,
};