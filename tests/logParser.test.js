/**
 * Tests for Log Parser Utilities
 * 
 * Tests:
 * - Log parsing/extraction of stdout field
 * - ANSI color code stripping
 * - Progress bar detection
 * - Terminal session management utilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  stripAnsiCodes,
  isProgressBarLine,
  containsProgressBar,
  normalizeProgressBar,
  parseLogLine,
  parseLogLines,
  extractLogContent,
  extractGenerationId,
  parseSdcppLogLine,
  detectLogLevel,
  formatLogTimestamp,
  batchProcessLogs,
  processLogForDisplay,
} from '../frontend/src/utils/logParser.js';

describe('Log Parser Utilities', () => {
  describe('stripAnsiCodes', () => {
    it('should strip standard ANSI color codes', () => {
      const input = '\x1b[31mRed Text\x1b[0m';
      const result = stripAnsiCodes(input);
      expect(result).toBe('Red Text');
    });

    it('should strip ANSI cursor movement codes', () => {
      const input = '\x1b[2J\x1b[HTotal cleared';
      const result = stripAnsiCodes(input);
      expect(result).toBe('Total cleared');
    });

    it('should handle text without ANSI codes', () => {
      const input = 'Plain text without codes';
      const result = stripAnsiCodes(input);
      expect(result).toBe('Plain text without codes');
    });

    it('should return empty string for null/undefined input', () => {
      expect(stripAnsiCodes(null)).toBe('');
      expect(stripAnsiCodes(undefined)).toBe('');
    });

    it('should strip complex ANSI sequences', () => {
      const input = '\x1b[38;5;196mRed\x1b[0m\x1b[1;32mBold Green\x1b[0m';
      const result = stripAnsiCodes(input);
      expect(result).toBe('RedBold Green');
    });

    it('should strip CSI sequences', () => {
      const input = '\x1b[1A\x1b[2B\x1b[3CUp and cursor';
      const result = stripAnsiCodes(input);
      expect(result).toBe('Up and cursor');
    });
  });

  describe('isProgressBarLine', () => {
    it('should detect carriage return at start', () => {
      const input = '\r[INFO ] Processing...';
      expect(isProgressBarLine(input)).toBe(true);
    });

    it('should detect progress bar with pipe characters', () => {
      const input = '|=====>        | 50%';
      expect(isProgressBarLine(input)).toBe(true);
    });

    it('should detect [K clear line code', () => {
      const input = '[KProcessing step 1/10';
      expect(isProgressBarLine(input)).toBe(true);
    });

    it('should reject normal log lines', () => {
      const input = '[INFO ] Model loaded successfully';
      expect(isProgressBarLine(input)).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isProgressBarLine(null)).toBe(false);
      expect(isProgressBarLine(undefined)).toBe(false);
    });
  });

  describe('containsProgressBar', () => {
    it('should detect progress bar patterns', () => {
      const input = '|=====>        | 50%';
      expect(containsProgressBar(input)).toBe(true);
    });

    it('should detect carriage return', () => {
      const input = 'Processing\rNew output';
      expect(containsProgressBar(input)).toBe(true);
    });

    it('should detect [K code', () => {
      const input = 'Some text[K more text';
      expect(containsProgressBar(input)).toBe(true);
    });

    it('should detect unicode block progress characters', () => {
      const input = 'Progress: ████████░░ 80%';
      expect(containsProgressBar(input)).toBe(true);
    });
  });

  describe('normalizeProgressBar', () => {
    it('should replace carriage returns with newlines', () => {
      const input = 'Line1\rLine2\rLine3';
      const result = normalizeProgressBar(input);
      expect(result).toContain('Line1');
      expect(result).toContain('Line2');
      expect(result).toContain('Line3');
    });

    it('should remove [K codes', () => {
      const input = '[KProcessing[KComplete';
      const result = normalizeProgressBar(input);
      expect(result).not.toContain('[K');
    });

    it('should replace block characters with dots', () => {
      const input = 'Progress: ████████░░';
      const result = normalizeProgressBar(input);
      expect(result).toContain('..........');
    });

    it('should clean up multiple spaces', () => {
      const input = 'Text    with     spaces';
      const result = normalizeProgressBar(input);
      expect(result).not.toContain('     ');
    });
  });

  describe('parseLogLine', () => {
    it('should parse JSON log with stdout field', () => {
      const input = '{"type":"sdcpp","generation_id":"abc123","module":"sdcpp","stdout":"[INFO ] generating image"}';
      const result = parseLogLine(input);
      expect(result.isJson).toBe(true);
      expect(result.content).toBe('[INFO ] generating image');
      expect(result.parsed).toBeDefined();
      expect(result.parsed.generation_id).toBe('abc123');
    });

    it('should parse JSON log with msg field (pino format)', () => {
      const input = '{"level":"info","msg":"Server started","time":"2024-01-01T00:00:00Z"}';
      const result = parseLogLine(input);
      expect(result.isJson).toBe(true);
      expect(result.content).toBe('Server started');
    });

    it('should handle plain text lines', () => {
      const input = 'This is plain text log';
      const result = parseLogLine(input);
      expect(result.isJson).toBe(false);
      expect(result.content).toBe('This is plain text log');
    });

    it('should return empty object for empty lines', () => {
      const result = parseLogLine('');
      expect(result.content).toBe('');
      expect(result.isJson).toBe(false);
    });

    it('should handle invalid JSON gracefully', () => {
      const input = '{ this is not valid json }';
      const result = parseLogLine(input);
      expect(result.isJson).toBe(false);
      expect(result.content).toBe('{ this is not valid json }');
    });
  });

  describe('parseLogLines', () => {
    it('should parse multiple lines', () => {
      const lines = [
        '{"stdout":"Line 1"}',
        '{"stdout":"Line 2"}',
        'Plain line',
      ];
      const results = parseLogLines(lines);
      expect(results).toHaveLength(3);
      expect(results[0].content).toBe('Line 1');
      expect(results[1].content).toBe('Line 2');
      expect(results[2].content).toBe('Plain line');
    });

    it('should handle empty array', () => {
      const results = parseLogLines([]);
      expect(results).toHaveLength(0);
    });

    it('should return empty array for non-array input', () => {
      const results = parseLogLines('not an array');
      expect(results).toHaveLength(0);
    });
  });

  describe('extractLogContent', () => {
    it('should extract stdout from object', () => {
      const logEntry = { stdout: '[INFO ] Test message', level: 'info' };
      const result = extractLogContent(logEntry);
      expect(result).toBe('[INFO ] Test message');
    });

    it('should extract stderr if no stdout', () => {
      const logEntry = { stderr: 'Error message', level: 'error' };
      const result = extractLogContent(logEntry);
      expect(result).toBe('Error message');
    });

    it('should extract msg as fallback', () => {
      const logEntry = { msg: ' Pino message', level: 'info' };
      const result = extractLogContent(logEntry);
      expect(result).toBe(' Pino message');
    });

    it('should handle string input', () => {
      const result = extractLogContent('Raw string log');
      expect(result).toBe('Raw string log');
    });

    it('should JSON stringify unknown objects', () => {
      const logEntry = { custom: 'data', nested: { value: 1 } };
      const result = extractLogContent(logEntry);
      expect(result).toBe(JSON.stringify(logEntry));
    });
  });

  describe('parseSdcppLogLine', () => {
    it('should parse valid SD.cpp JSON log', () => {
      const line = '{"type":"sdcpp","generation_id":"gen-123","module":"sdcpp","stdout":"[INFO ] generating image: 1/1","level":"info"}';
      const result = parseSdcppLogLine(line);
      expect(result).not.toBeNull();
      expect(result.type).toBe('sdcpp');
      expect(result.generationId).toBe('gen-123');
      expect(result.stdout).toBe('[INFO ] generating image: 1/1');
    });

    it('should return null for non-SD.cpp logs', () => {
      const line = '{"type":"http","method":"GET","url":"/api"}';
      const result = parseSdcppLogLine(line);
      expect(result).toBeNull();
    });

    it('should return null for plain text', () => {
      const result = parseSdcppLogLine('Plain text log line');
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const result = parseSdcppLogLine('{ invalid json }');
      expect(result).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(parseSdcppLogLine(null)).toBeNull();
      expect(parseSdcppLogLine(undefined)).toBeNull();
    });
  });

  describe('extractGenerationId', () => {
    it('should extract generation_id from JSON string', () => {
      const line = '{"type":"sdcpp","generation_id":"abc123","stdout":"test"}';
      const result = extractGenerationId(line);
      expect(result).toBe('abc123');
    });

    it('should extract generation_id from object', () => {
      const logEntry = { generation_id: 'xyz-789', stdout: 'test' };
      const result = extractGenerationId(logEntry);
      expect(result).toBe('xyz-789');
    });

    it('should return null when no generation_id', () => {
      const logEntry = { stdout: 'test' };
      const result = extractGenerationId(logEntry);
      expect(result).toBeNull();
    });
  });

  describe('detectLogLevel', () => {
    it('should detect ERROR level', () => {
      expect(detectLogLevel('[ERROR] Something failed')).toBe('error');
      expect(detectLogLevel('ERROR: Database connection failed')).toBe('error');
    });

    it('should detect WARN level', () => {
      expect(detectLogLevel('[WARN] Low memory')).toBe('warn');
      expect(detectLogLevel('WARNING: deprecated feature')).toBe('warn');
    });

    it('should detect INFO level', () => {
      expect(detectLogLevel('[INFO ] Application started')).toBe('info');
    });

    it('should detect DEBUG level', () => {
      expect(detectLogLevel('[DEBUG] Variable value')).toBe('debug');
    });

    it('should detect TRACE level', () => {
      expect(detectLogLevel('[TRACE] Function entry')).toBe('trace');
    });

    it('should return null for unknown levels', () => {
      expect(detectLogLevel('[CUSTOM] Unknown level')).toBeNull();
      expect(detectLogLevel('Plain text')).toBeNull();
    });
  });

  describe('formatLogTimestamp', () => {
    it('should format ISO timestamp', () => {
      const result = formatLogTimestamp('2024-01-15T10:30:45.123Z');
      expect(result).toMatch(/10:30:45/);
    });

    it('should return empty string for null/undefined', () => {
      expect(formatLogTimestamp(null)).toBe('');
      expect(formatLogTimestamp(undefined)).toBe('');
    });

    it('should handle invalid date strings', () => {
      const result = formatLogTimestamp('not a date');
      expect(result).toBe('not a date');
    });
  });

  describe('batchProcessLogs', () => {
    it('should process multiple log entries', () => {
      const logs = [
        '{"type":"sdcpp","generation_id":"g1","stdout":"[INFO ] Test 1"}',
        '{"type":"sdcpp","generation_id":"g2","stdout":"[ERROR] Test 2"}',
      ];
      const results = batchProcessLogs(logs);
      expect(results).toHaveLength(2);
      expect(results[0].id).toBeDefined();
      expect(results[0].generationId).toBe('g1');
      expect(results[0].level).toBe('info');
      expect(results[1].level).toBe('error');
    });

    it('should handle mixed JSON and plain text', () => {
      const logs = [
        '{"stdout":"JSON log"}',
        'Plain text log',
      ];
      const results = batchProcessLogs(logs);
      expect(results).toHaveLength(2);
      expect(results[0].content).toBe('JSON log');
      expect(results[1].content).toBe('Plain text log');
    });

    it('should include original log entry', () => {
      const logs = ['{"stdout":"test"}'];
      const results = batchProcessLogs(logs);
      expect(results[0].original).toBeDefined();
    });
  });

  describe('processLogForDisplay', () => {
    it('should process normal log lines', () => {
      const rawText = '[INFO ] Line 1\n[INFO ] Line 2\n[DEBUG] Line 3';
      const result = processLogForDisplay(rawText);
      expect(result.lines).toContain('Line 1');
      expect(result.lines).toContain('Line 2');
      expect(result.hasProgressBars).toBe(false);
    });

    it('should detect progress bars', () => {
      const rawText = '[INFO ] Line 1\n|====>| 50%\n[INFO ] Line 2';
      const result = processLogForDisplay(rawText);
      expect(result.hasProgressBars).toBe(true);
    });

    it('should strip ANSI codes during processing', () => {
      const rawText = '\x1b[31mRed Text\x1b[0m\n[INFO ] Normal';
      const result = processLogForDisplay(rawText);
      expect(result.lines).toContain('Red Text');
      expect(result.lines).toContain('Normal');
    });

    it('should return empty lines for null/undefined', () => {
      expect(processLogForDisplay(null).lines).toHaveLength(0);
      expect(processLogForDisplay(undefined).lines).toHaveLength(0);
    });
  });
});
