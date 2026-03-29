/**
 * Terminal Session Routes
 * 
 * Provides WebSocket-based terminal session management for real-time log streaming.
 * Uses the existing WebSocket infrastructure for terminal output.
 */

import { createLogger } from '../utils/logger.js';

const logger = createLogger('routes:terminal');

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
 * Broadcast log to all terminal sessions for a generation
 * @param {string} generationId 
 * @param {string|object} logEntry 
 */
export function broadcastLogToSessions(generationId, logEntry) {
  const logLine = typeof logEntry === 'string' 
    ? logEntry 
    : JSON.stringify(logEntry);

  const parsed = parseSdcppLog(logLine);
  if (!parsed) return;

  const message = JSON.stringify({
    type: 'log',
    sessionId: parsed.generationId,
    data: {
      ...parsed,
      stdout: stripAnsi(parsed.stdout || ''),
    },
  });

  for (const session of activeSessions.values()) {
    if (session.generationId === parsed.generationId && session.ws?.readyState === 1) {
      session.ws.send(message);
    }
  }
}

/**
 * Get all active sessions
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

  return {
    broadcastLogToSessions,
    getActiveSessions,
  };
}

export default registerTerminalRoutes;
