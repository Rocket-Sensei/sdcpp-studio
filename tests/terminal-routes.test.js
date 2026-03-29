/**
 * Tests for Terminal Session Routes
 * 
 * Tests the terminal session management utilities and route handlers.
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('Terminal Session Routes - Unit Tests', () => {
  let parseSdcppLog;
  let stripAnsi;

  beforeEach(async () => {
    vi.resetModules();
    
    const terminal = await import('../backend/routes/terminal.js');
    parseSdcppLog = terminal.parseSdcppLog;
    stripAnsi = terminal.stripAnsi;
  });

  describe('parseSdcppLog', () => {
    it('should parse valid SD.cpp JSON log', () => {
      const rawLine = '{"type":"sdcpp","generation_id":"gen-123","module":"sdcpp","stdout":"[INFO ] test message","level":"info"}';
      const result = parseSdcppLog(rawLine);
      
      expect(result).not.toBeNull();
      expect(result.type).toBe('sdcpp');
      expect(result.generationId).toBe('gen-123');
      expect(result.module).toBe('sdcpp');
      expect(result.stdout).toBe('[INFO ] test message');
      expect(result.level).toBe('info');
    });

    it('should return null for non-SD.cpp logs', () => {
      const rawLine = '{"type":"http","method":"GET","url":"/api"}';
      const result = parseSdcppLog(rawLine);
      
      expect(result).toBeNull();
    });

    it('should return null for plain text', () => {
      expect(parseSdcppLog('Plain text log line')).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      expect(parseSdcppLog('{ invalid json }')).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(parseSdcppLog(null)).toBeNull();
      expect(parseSdcppLog(undefined)).toBeNull();
    });

    it('should extract all fields from SD.cpp log', () => {
      const rawLine = '{"type":"sdcpp","generation_id":"g1","module":"sdcpp","stdout":"step 1/10","stderr":"error text","level":"info","time":"2024-01-01T00:00:00Z"}';
      const result = parseSdcppLog(rawLine);
      
      expect(result.type).toBe('sdcpp');
      expect(result.generationId).toBe('g1');
      expect(result.module).toBe('sdcpp');
      expect(result.stdout).toBe('step 1/10');
      expect(result.stderr).toBe('error text');
      expect(result.level).toBe('info');
      expect(result.time).toBe('2024-01-01T00:00:00Z');
    });
  });

  describe('stripAnsi', () => {
    it('should strip ANSI color codes', () => {
      const input = '\x1b[31mRed Text\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Red Text');
    });

    it('should strip ANSI escape sequences', () => {
      const input = '\x1b[2J\x1b[Hcleared';
      const result = stripAnsi(input);
      expect(result).toBe('cleared');
    });

    it('should strip CSI sequences', () => {
      const input = '\x1b[1A\x1b[2BUp and cursor';
      const result = stripAnsi(input);
      expect(result).toBe('Up and cursor');
    });

    it('should handle text without ANSI codes', () => {
      const input = 'Plain text';
      const result = stripAnsi(input);
      expect(result).toBe('Plain text');
    });

    it('should handle empty string', () => {
      expect(stripAnsi('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(stripAnsi(null)).toBe('');
      expect(stripAnsi(undefined)).toBe('');
    });
  });

  describe('registerTerminalRoutes', () => {
    it('should be a function', async () => {
      const terminal = await import('../backend/routes/terminal.js');
      expect(typeof terminal.registerTerminalRoutes).toBe('function');
    });

    it('should return helpers when called', async () => {
      const { registerTerminalRoutes } = await import('../backend/routes/terminal.js');
      const express = (await import('express')).default;
      const app = express();
      
      const result = registerTerminalRoutes(app);
      
      expect(result).toHaveProperty('broadcastLogToSessions');
      expect(result).toHaveProperty('getActiveSessions');
      expect(typeof result.broadcastLogToSessions).toBe('function');
      expect(typeof result.getActiveSessions).toBe('function');
    });

    it('should provide getActiveSessions that returns a Map', async () => {
      const { registerTerminalRoutes, getActiveSessions } = await import('../backend/routes/terminal.js');
      const express = (await import('express')).default;
      const app = express();
      
      registerTerminalRoutes(app);
      const sessions = getActiveSessions();
      
      expect(sessions).toBeInstanceOf(Map);
    });
  });

  describe('Session Management', () => {
    it('should manage sessions via getActiveSessions', async () => {
      const { registerTerminalRoutes, getActiveSessions } = await import('../backend/routes/terminal.js');
      const express = (await import('express')).default;
      const app = express();
      
      registerTerminalRoutes(app);
      
      const sessions = getActiveSessions();
      expect(sessions).toBeInstanceOf(Map);
    });
  });

  describe('broadcastLogToSessions', () => {
    it('should not throw with no sessions', async () => {
      const { registerTerminalRoutes, getActiveSessions, broadcastLogToSessions } = await import('../backend/routes/terminal.js');
      const express = (await import('express')).default;
      const app = express();
      
      registerTerminalRoutes(app);
      getActiveSessions().clear();
      
      const logEntry = '{"type":"sdcpp","generation_id":"gen-1","module":"sdcpp","stdout":"test"}';
      
      expect(() => broadcastLogToSessions('gen-1', logEntry)).not.toThrow();
    });

    it('should not throw with string log entry', async () => {
      const { registerTerminalRoutes, getActiveSessions, broadcastLogToSessions } = await import('../backend/routes/terminal.js');
      const express = (await import('express')).default;
      const app = express();
      
      registerTerminalRoutes(app);
      getActiveSessions().clear();
      
      expect(() => broadcastLogToSessions('gen-1', 'plain string log')).not.toThrow();
    });

    it('should not throw with object log entry', async () => {
      const { registerTerminalRoutes, getActiveSessions, broadcastLogToSessions } = await import('../backend/routes/terminal.js');
      const express = (await import('express')).default;
      const app = express();
      
      registerTerminalRoutes(app);
      getActiveSessions().clear();
      
      const logObj = { type: 'sdcpp', generation_id: 'gen-1', stdout: 'test' };
      expect(() => broadcastLogToSessions('gen-1', logObj)).not.toThrow();
    });
  });
});

describe('Terminal Route Integration Tests', () => {
  it('should export registerTerminalRoutes as named export', async () => {
    const terminal = await import('../backend/routes/terminal.js');
    expect(terminal.registerTerminalRoutes).toBeDefined();
    expect(typeof terminal.registerTerminalRoutes).toBe('function');
  });

  it('should export parseSdcppLog as named export', async () => {
    const terminal = await import('../backend/routes/terminal.js');
    expect(terminal.parseSdcppLog).toBeDefined();
    expect(typeof terminal.parseSdcppLog).toBe('function');
  });

  it('should export stripAnsi as named export', async () => {
    const terminal = await import('../backend/routes/terminal.js');
    expect(terminal.stripAnsi).toBeDefined();
    expect(typeof terminal.stripAnsi).toBe('function');
  });

  it('should export broadcastLogToSessions as named export', async () => {
    const terminal = await import('../backend/routes/terminal.js');
    expect(terminal.broadcastLogToSessions).toBeDefined();
    expect(typeof terminal.broadcastLogToSessions).toBe('function');
  });

  it('should export getActiveSessions as named export', async () => {
    const terminal = await import('../backend/routes/terminal.js');
    expect(terminal.getActiveSessions).toBeDefined();
    expect(typeof terminal.getActiveSessions).toBe('function');
  });

  it('should have default export', async () => {
    const terminal = await import('../backend/routes/terminal.js');
    expect(terminal.default).toBeDefined();
  });
});