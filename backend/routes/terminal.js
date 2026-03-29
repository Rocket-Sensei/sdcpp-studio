/**
 * Terminal Session Routes
 * 
 * Provides WebSocket-based terminal session management for real-time log streaming.
 * Uses the existing WebSocket infrastructure for terminal output.
 * 
 * Also provides PTY (pseudo-terminal) session management for interactive processes.
 */

import { createLogger } from '../utils/logger.js';
import { broadcastTerminalLog } from '../services/websocket.js';
import {
  createPtySession,
  getPtySession,
  writeToPty,
  resizePty,
  killPtySession,
  getAllPtySessions,
} from '../services/ptyManager.js';

const logger = createLogger('routes:terminal');

// Track WebSocket terminal sessions (different from PTY sessions)
const activeSessions = new Map();

/**
 * Parse SD.cpp JSON log line and extract key information
 */
export function parseSdcppLog(rawLine) {
  try {
    const line = rawLine.trim();
    if (!line.startsWith('{') || !line.endsWith('}')) {
      return null;
    }
    const parsed = JSON.parse(line);
    if (parsed.type !== 'sdcpp') {
      return null;
    }
    return {
      type: 'sdcpp',
      generationId: parsed.generation_id,
      module: parsed.module,
      stdout: parsed.stdout,
      stderr: parsed.stderr,
      level: parsed.level,
      time: parsed.time,
      raw: rawLine,
    };
  } catch {
    return null;
  }
}

/**
 * Strip ANSI escape codes from text
 */
export function stripAnsi(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b/g, '');
}

/**
 * Detect log level from SD.cpp log line content
 * @param {string} content - Log content
 * @returns {'error'|'warn'|'info'|'debug'|'trace'|null}
 */
function detectLogLevel(content) {
  if (!content || typeof content !== 'string') return null;
  
  const upperLine = content.toUpperCase();
  
  if (upperLine.includes('[ERROR]') || upperLine.includes('ERROR:')) {
    return 'error';
  }
  if (upperLine.includes('[WARN]') || upperLine.includes('[WARNING]') || upperLine.includes('WARNING:')) {
    return 'warn';
  }
  if (upperLine.includes('[INFO]') || upperLine.includes('[INFO ]')) {
    return 'info';
  }
  if (upperLine.includes('[DEBUG]') || upperLine.includes('[DEBUG ]')) {
    return 'debug';
  }
  if (upperLine.includes('[TRACE]') || upperLine.includes('[TRACE ]')) {
    return 'trace';
  }
  
  return null;
}

/**
 * Broadcast log to all WebSocket subscribers for a generation
 * @param {string} generationId 
 * @param {string|object} logEntry 
 */
export function broadcastLogToSessions(generationId, logEntry) {
  const logLine = typeof logEntry === 'string' 
    ? logEntry 
    : JSON.stringify(logEntry);

  const parsed = parseSdcppLog(logLine);
  if (!parsed) return;

  const content = stripAnsi(parsed.stdout || '');
  const level = detectLogLevel(content) || 'info';

  broadcastTerminalLog({
    generationId: parsed.generationId,
    content,
    raw: logLine,
    level,
    timestamp: parsed.time || new Date().toISOString(),
  });
}

/**
 * Get all active terminal sessions
 * @returns {Map} Map of active sessions
 */
export function getActiveSessions() {
  return activeSessions;
}

/**
 * Register terminal routes on the Express app
 */
export function registerTerminalRoutes(app) {
  // Get active terminal sessions
  app.get('/api/terminal/sessions', (req, res) => {
    const sessions = Array.from(activeSessions.values()).map(s => ({
      id: s.id,
      generationId: s.generationId,
      connectedAt: s.connectedAt,
    }));
    res.json({ sessions });
  });

  // Get terminal session info
  app.get('/api/terminal/sessions/:sessionId', (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      id: session.id,
      generationId: session.generationId,
      connectedAt: session.connectedAt,
    });
  });

  // Create a new terminal session
  app.post('/api/terminal/sessions', (req, res) => {
    const sessionId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { generationId } = req.body;

    const session = {
      id: sessionId,
      generationId: generationId || null,
      connectedAt: new Date().toISOString(),
    };

    activeSessions.set(sessionId, session);
    logger.info({ sessionId, generationId }, 'Terminal session created');

    res.status(201).json({ sessionId, ...session });
  });

  // Delete a terminal session
  app.delete('/api/terminal/sessions/:sessionId', (req, res) => {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    activeSessions.delete(req.params.sessionId);
    logger.info({ sessionId: req.params.sessionId }, 'Terminal session deleted');

    res.json({ success: true });
  });

  // ============================================================================
  // PTY Session Management
  // ============================================================================

  // Get all PTY sessions
  app.get('/api/terminal/pty', (req, res) => {
    const sessions = getAllPtySessions();
    res.json({ sessions });
  });

  // Create a new PTY session
  app.post('/api/terminal/pty', (req, res) => {
    const {
      command,
      args = [],
      cwd = process.cwd(),
      env = {},
      modelId = null,
      generationId = null,
    } = req.body;

    if (!command) {
      return res.status(400).json({ error: 'command is required' });
    }

    try {
      const session = createPtySession({
        command,
        args,
        cwd,
        env: { ...process.env, ...env },
        modelId,
        generationId,
      });

      logger.info({ sessionId: session.id, command, args }, 'PTY session created via API');

      res.status(201).json({
        sessionId: session.id,
        ...session.getInfo(),
      });
    } catch (error) {
      logger.error({ error, command, args }, 'Failed to create PTY session');
      res.status(500).json({ error: error.message });
    }
  });

  // Get a specific PTY session
  app.get('/api/terminal/pty/:sessionId', (req, res) => {
    const session = getPtySession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'PTY session not found' });
    }
    res.json(session.getInfo());
  });

  // Write to a PTY session (send input)
  app.post('/api/terminal/pty/:sessionId/input', (req, res) => {
    const { data } = req.body;
    if (!data) {
      return res.status(400).json({ error: 'data is required' });
    }

    const success = writeToPty(req.params.sessionId, data);
    if (!success) {
      return res.status(404).json({ error: 'PTY session not found or not alive' });
    }
    res.json({ success: true });
  });

  // Resize a PTY session
  app.post('/api/terminal/pty/:sessionId/resize', (req, res) => {
    const { cols, rows } = req.body;
    if (cols === undefined || rows === undefined) {
      return res.status(400).json({ error: 'cols and rows are required' });
    }

    const success = resizePty(req.params.sessionId, cols, rows);
    if (!success) {
      return res.status(404).json({ error: 'PTY session not found or not alive' });
    }
    res.json({ success: true });
  });

  // Kill a PTY session
  app.delete('/api/terminal/pty/:sessionId', (req, res) => {
    const success = killPtySession(req.params.sessionId);
    if (!success) {
      return res.status(404).json({ error: 'PTY session not found' });
    }
    logger.info({ sessionId: req.params.sessionId }, 'PTY session killed via API');
    res.json({ success: true });
  });

  return {
    broadcastLogToSessions,
    getActiveSessions,
  };
}

export default registerTerminalRoutes;
