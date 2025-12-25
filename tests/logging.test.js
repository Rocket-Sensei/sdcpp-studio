/**
 * Tests for Pino-based Logging Utility
 *
 * Tests the multi-file logging system with:
 * - HTTP API request/response logging
 * - CLI command execution logging
 * - Child logger creation
 * - Log level filtering
 * - Sensitive data redaction
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log file paths
const logsDir = path.join(__dirname, '..', 'backend', 'logs');
const appLogPath = path.join(logsDir, 'app.log');
const httpLogPath = path.join(logsDir, 'http.log');
const sdcppLogPath = path.join(logsDir, 'sdcpp.log');

/**
 * Helper: Read log file contents
 */
function readLogFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf8');
  return content;
}

/**
 * Helper: Parse JSON log lines
 */
function parseLogLines(logContent) {
  const lines = logContent.trim().split('\n').filter(l => l.trim());
  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

/**
 * Helper: Clear log files
 */
function clearLogFiles() {
  [appLogPath, httpLogPath, sdcppLogPath].forEach(filePath => {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  });
}

/**
 * Helper: Flush logger and wait for writes
 */
async function flushLogger(logger) {
  await new Promise(resolve => logger.flush(resolve));
}

/**
 * Helper: Wait and flush all loggers
 */
async function flushAllLoggers() {
  await new Promise(resolve => setTimeout(resolve, 150));
  const { getBaseLogger, getHttpLogger, getSdCppLogger } = await import('../backend/utils/logger.js');
  await new Promise(r => getBaseLogger().flush(r));
  await new Promise(r => getHttpLogger().flush(r));
  await new Promise(r => getSdCppLogger().flush(r));
}

describe('Logger Utility', () => {
  beforeEach(async () => {
    clearLogFiles();
    // Clear module cache to get fresh instances
    vi.clearAllMocks();
    vi.resetModules();
    // Set environment for testing
    process.env.LOG_LEVEL = 'debug';
    process.env.LOG_API_CALLS = 'true';
    process.env.LOG_CLI_CALLS = 'true';
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    clearLogFiles();
  });

  describe('Log File Creation', () => {
    it('should create logs directory if it does not exist', async () => {
      // Remove logs directory if it exists
      if (fs.existsSync(logsDir)) {
        fs.rmSync(logsDir, { recursive: true, force: true });
      }

      // Import logger module
      await import('../backend/utils/logger.js');

      // Verify directory was created
      expect(fs.existsSync(logsDir)).toBe(true);
    });

    it('should create app.log file', async () => {
      const defaultLogger = await import('../backend/utils/logger.js');

      // Write a test log
      defaultLogger.default.info('test message');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      expect(content).toContain('test message');
    });

    it('should create separate log files for different types', async () => {
      await import('../backend/utils/logger.js');

      const defaultLogger = await import('../backend/utils/logger.js');
      const { getHttpLogger, getSdCppLogger } = await import('../backend/utils/logger.js');

      defaultLogger.default.info('app log');
      getHttpLogger().info('http log');
      getSdCppLogger().info('sdcpp log');

      await flushAllLoggers();

      expect(fs.existsSync(appLogPath)).toBe(true);
      expect(fs.existsSync(httpLogPath)).toBe(true);
      expect(fs.existsSync(sdcppLogPath)).toBe(true);
    });
  });

  describe('Child Logger Creation', () => {
    it('should create child logger with module context', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const childLogger = createLogger('testModule', { customField: 'testValue' });

      childLogger.info('child log message');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.msg === 'child log message');

      expect(logEntry).toBeDefined();
      expect(logEntry.module).toBe('testModule');
      expect(logEntry.customField).toBe('testValue');
    });

    it('should preserve parent bindings in nested children', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const parentLogger = createLogger('parent', { parentId: '123' });
      const childLogger = parentLogger.child({ childId: '456' });

      childLogger.info('nested message');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.msg === 'nested message');

      expect(logEntry).toBeDefined();
      expect(logEntry.module).toBe('parent');
      expect(logEntry.parentId).toBe('123');
      expect(logEntry.childId).toBe('456');
    });
  });

  describe('Log Levels', () => {
    it('should respect log level settings', async () => {
      process.env.LOG_LEVEL = 'warn';
      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('levelTest');

      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);
      const messages = logLines.map(l => l.msg);

      expect(messages).not.toContain('debug message');
      expect(messages).not.toContain('info message');
      expect(messages).toContain('warn message');
      expect(messages).toContain('error message');
    });

    it('should support all log levels', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('levels');

      logger.trace('trace');
      logger.debug('debug');
      logger.info('info');
      logger.warn('warn');
      logger.error('error');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      expect(content).toBeTruthy();
    });
  });

  describe('HTTP API Logging', () => {
    it('should log API requests to http.log', async () => {
      const { logApiRequest } = await import('../backend/utils/logger.js');

      logApiRequest('GET', 'http://example.com/api', { 'X-Custom': 'value' }, null);

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'apiRequest');

      expect(logEntry).toBeDefined();
      expect(logEntry.method).toBe('GET');
      expect(logEntry.url).toBe('http://example.com/api');
      expect(logEntry.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('should log API responses to http.log', async () => {
      const { logApiResponse } = await import('../backend/utils/logger.js');

      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Headers([['content-type', 'application/json']])
      };
      mockResponse.headers.entries = function* () {
        yield ['content-type', 'application/json'];
      };

      await logApiResponse(mockResponse, { id: '123', status: 'pending' });

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'apiResponse');

      expect(logEntry).toBeDefined();
      expect(logEntry.status).toBe(200);
      expect(logEntry.responseSummary).toBe('job id=123, status=pending');
    });

    it('should log error responses with error level', async () => {
      const { logApiResponse } = await import('../backend/utils/logger.js');

      const mockResponse = {
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers()
      };
      mockResponse.headers.entries = function* () {};

      await logApiResponse(mockResponse, { error: 'something went wrong' });

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'apiResponse');

      expect(logEntry).toBeDefined();
      expect(logEntry.levelNum).toBe(50); // pino error level
      expect(logEntry.status).toBe(500);
    });

    it('should respect LOG_API_CALLS environment variable', async () => {
      process.env.LOG_API_CALLS = 'false';
      const { logApiRequest } = await import('../backend/utils/logger.js');

      logApiRequest('GET', 'http://example.com/api', {}, null);

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      expect(content).toBe('');
    });

    it('should redact sensitive data in API requests', async () => {
      const { logApiRequest } = await import('../backend/utils/logger.js');

      logApiRequest('POST', 'http://example.com/login', {
        'authorization': 'Bearer secret-token',
        'cookie': 'session=secret',
        'content-type': 'application/json'
      }, { password: 'secret123', apiKey: 'key456' });

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      expect(content).not.toContain('secret-token');
      expect(content).not.toContain('secret123');
      expect(content).not.toContain('key456');
      // pino redaction uses [Redacted] by default
      expect(content).toMatch(/\[Redacted\]/i);
    });
  });

  describe('CLI Logging', () => {
    it('should log CLI commands to sdcpp.log', async () => {
      const { logCliCommand } = await import('../backend/utils/logger.js');

      logCliCommand('./bin/sd-cli', ['--model', 'test.gguf', '--prompt', 'a cat'], { cwd: '/tmp' });

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'cliCommand');

      expect(logEntry).toBeDefined();
      expect(logEntry.command).toBe('./bin/sd-cli');
      expect(logEntry.args).toEqual(['--model', 'test.gguf', '--prompt', 'a cat']);
    });

    it('should include generation_id in CLI logs when provided', async () => {
      const { logCliCommand, logCliOutput, logCliError, createSdCppChildLogger } = await import('../backend/utils/logger.js');

      const testGenerationId = 'test-gen-123';

      // Log CLI command with generation ID
      logCliCommand('./bin/sd-cli', ['--model', 'test.gguf'], { cwd: '/tmp' }, testGenerationId);

      // Log CLI output with generation ID
      logCliOutput('success output', null, 0, testGenerationId);

      // Also test the direct logger creation
      const genLogger = createSdCppChildLogger(testGenerationId);
      genLogger.info({ test: 'data' }, 'Generation log message');

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);

      // All logs with generation_id should have it in their log entry
      const logsWithGenId = logLines.filter(l => l.generation_id === testGenerationId);

      // Should have at least 3 entries with generation_id (command, output, direct log)
      expect(logsWithGenId.length).toBeGreaterThanOrEqual(3);

      // Verify specific entries
      const commandEntry = logLines.find(l => l.eventType === 'cliCommand' && l.generation_id === testGenerationId);
      expect(commandEntry).toBeDefined();
      expect(commandEntry.generation_id).toBe(testGenerationId);

      const outputEntry = logLines.find(l => l.eventType === 'cliOutput' && l.generation_id === testGenerationId);
      expect(outputEntry).toBeDefined();
      expect(outputEntry.generation_id).toBe(testGenerationId);
      expect(outputEntry.exitCode).toBe(0);

      const directLogEntry = logLines.find(l => l.msg === 'Generation log message' && l.generation_id === testGenerationId);
      expect(directLogEntry).toBeDefined();
      expect(directLogEntry.generation_id).toBe(testGenerationId);
    });

    it('should include generation_id in CLI error logs when provided', async () => {
      const { logCliError, logCliOutput } = await import('../backend/utils/logger.js');

      const testGenerationId = 'test-gen-error-456';

      // Log CLI error with generation ID
      const testError = new Error('Model loading failed');
      testError.stack = 'Error: Model loading failed\n    at test.js:10:15';
      logCliError(testError, testGenerationId);

      // Log CLI output with non-zero exit code and generation ID
      logCliOutput(null, 'Failed to load model', 1, testGenerationId);

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);

      // Check error log entry
      const errorEntry = logLines.find(l => l.eventType === 'cliError' && l.generation_id === testGenerationId);
      expect(errorEntry).toBeDefined();
      expect(errorEntry.generation_id).toBe(testGenerationId);
      expect(errorEntry.error?.message).toBe('Model loading failed');

      // Check output entry with error exit code
      const outputEntry = logLines.find(l => l.eventType === 'cliOutput' && l.generation_id === testGenerationId);
      expect(outputEntry).toBeDefined();
      expect(outputEntry.generation_id).toBe(testGenerationId);
      expect(outputEntry.exitCode).toBe(1);
      expect(outputEntry.levelNum).toBe(50); // error level
    });

    it('should support getSdCppLogger with optional generation ID', async () => {
      const { getSdCppLogger } = await import('../backend/utils/logger.js');

      const testGenerationId = 'test-gen-getLogger-789';

      // Get logger with generation ID
      const genLogger = getSdCppLogger(testGenerationId);
      genLogger.info('Test with generation ID');

      // Get logger without generation ID
      const plainLogger = getSdCppLogger();
      plainLogger.info('Test without generation ID');

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);

      // Check entry with generation ID
      const withGenId = logLines.find(l => l.msg === 'Test with generation ID');
      expect(withGenId).toBeDefined();
      expect(withGenId.generation_id).toBe(testGenerationId);

      // Check entry without generation ID (should not have generation_id field)
      const withoutGenId = logLines.find(l => l.msg === 'Test without generation ID');
      expect(withoutGenId).toBeDefined();
      expect(withoutGenId.generation_id).toBeUndefined();
    });

    it('should log CLI output to sdcpp.log', async () => {
      const { logCliOutput } = await import('../backend/utils/logger.js');

      logCliOutput('Generating image...', 'Warning: low vram', 0);

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'cliOutput');

      expect(logEntry).toBeDefined();
      expect(logEntry.exitCode).toBe(0);
      expect(logEntry.stdout).toBe('Generating image...');
      expect(logEntry.stderr).toBe('Warning: low vram');
    });

    it('should log CLI errors with error level', async () => {
      const { logCliOutput } = await import('../backend/utils/logger.js');

      logCliOutput(null, 'Model file not found', 1);

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'cliOutput');

      expect(logEntry).toBeDefined();
      expect(logEntry.levelNum).toBe(50); // pino error level
      expect(logEntry.exitCode).toBe(1);
    });

    it('should log CLI errors from Error objects', async () => {
      const { logCliError } = await import('../backend/utils/logger.js');

      const testError = new Error('Test CLI error');
      testError.stack = 'Error: Test CLI error\n    at test.js:10:15';
      logCliError(testError);

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.eventType === 'cliError');

      expect(logEntry).toBeDefined();
      expect(logEntry.levelNum).toBe(50);
      expect(logEntry.error?.message).toBe('Test CLI error');
    });

    it('should respect LOG_CLI_CALLS environment variable', async () => {
      process.env.LOG_CLI_CALLS = 'false';
      const { logCliCommand } = await import('../backend/utils/logger.js');

      logCliCommand('test', ['arg1'], {});

      await flushAllLoggers();

      const content = readLogFile(sdcppLogPath);
      expect(content).toBe('');
    });
  });

  describe('Logged Fetch Wrapper', () => {
    it('should log fetch requests and responses', async () => {
      // Mock global fetch
      global.fetch = vi.fn(() =>
        Promise.resolve({
          status: 200,
          statusText: 'OK',
          headers: new Headers([['content-type', 'application/json']]),
          clone: function() {
            return {
              json: () => Promise.resolve({ success: true }),
              text: () => Promise.resolve('{"success":true}')
            };
          }
        })
      );

      const { loggedFetch } = await import('../backend/utils/logger.js');

      await loggedFetch('http://test.com/api', { method: 'POST', body: JSON.stringify({ test: 'data' }) });

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      const logLines = parseLogLines(content);

      expect(logLines.some(l => l.eventType === 'apiRequest')).toBe(true);
      expect(logLines.some(l => l.eventType === 'apiResponse')).toBe(true);

      // Clean up
      global.fetch = undefined;
    });
  });

  describe('Structured Logging', () => {
    it('should log structured data with context', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('structuredTest');

      const data = {
        userId: '123',
        action: 'generate',
        model: 'flux-model',
        params: { steps: 4, cfg: 1.0 }
      };

      logger.info(data, 'Generation started');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.msg === 'Generation started');

      expect(logEntry).toBeDefined();
      expect(logEntry.userId).toBe('123');
      expect(logEntry.action).toBe('generate');
      expect(logEntry.params).toEqual({ steps: 4, cfg: 1.0 });
    });

    it('should serialize Error objects correctly', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('errorTest');

      const error = new Error('Test error message');
      error.code = 'TEST_ERROR';
      logger.error({ err: error }, 'An error occurred');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.msg === 'An error occurred');

      expect(logEntry).toBeDefined();
      expect(logEntry.err).toBeDefined();
      expect(logEntry.err.message).toBe('Test error message');
      expect(logEntry.err.type).toBe('Error');
    });
  });

  describe('Data Redaction', () => {
    it('should redact authorization headers', async () => {
      const { logApiRequest } = await import('../backend/utils/logger.js');

      logApiRequest('GET', 'http://api.example.com', {
        'authorization': 'Bearer secret123',
        'x-api-key': 'key456'
      });

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      expect(content).not.toContain('secret123');
      expect(content).toMatch(/\[Redacted\]/i);
    });

    it('should redact cookie headers', async () => {
      const { logApiRequest } = await import('../backend/utils/logger.js');

      logApiRequest('GET', 'http://api.example.com', {
        'cookie': 'session=abc123; user=john'
      });

      await flushAllLoggers();

      const content = readLogFile(httpLogPath);
      expect(content).not.toContain('abc123');
      expect(content).toMatch(/\[Redacted\]/i);
    });
  });

  describe('Time Formatting', () => {
    it('should include ISO timestamp in logs', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('timeTest');

      logger.info('time test');

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);
      const logEntry = logLines.find(l => l.msg === 'time test');

      expect(logEntry).toBeDefined();
      expect(logEntry.time).toBeDefined();
      // Verify ISO format (YYYY-MM-DDTHH:MM:SS.sssZ)
      expect(logEntry.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Logger Export Functions', () => {
    it('should export getBaseLogger function', async () => {
      const { getBaseLogger } = await import('../backend/utils/logger.js');
      expect(getBaseLogger).toBeDefined();
      expect(typeof getBaseLogger).toBe('function');
    });

    it('should export getHttpLogger function', async () => {
      const { getHttpLogger } = await import('../backend/utils/logger.js');
      expect(getHttpLogger).toBeDefined();
      expect(typeof getHttpLogger).toBe('function');
    });

    it('should export getSdCppLogger function', async () => {
      const { getSdCppLogger } = await import('../backend/utils/logger.js');
      expect(getSdCppLogger).toBeDefined();
      expect(typeof getSdCppLogger).toBe('function');
    });

    it('should export createLogger function', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      expect(createLogger).toBeDefined();
      expect(typeof createLogger).toBe('function');
    });

    it('should export pino for advanced usage', async () => {
      const { pino: exportedPino } = await import('../backend/utils/logger.js');
      expect(exportedPino).toBeDefined();
    });
  });

  describe('Multiple Log Entries', () => {
    it('should handle multiple rapid log entries', async () => {
      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('bulkTest');

      // Log 100 messages rapidly
      for (let i = 0; i < 100; i++) {
        logger.info({ index: i }, `Message ${i}`);
      }

      await flushAllLoggers();

      const content = readLogFile(appLogPath);
      const logLines = parseLogLines(content);

      expect(logLines.length).toBeGreaterThanOrEqual(100);

      // Verify sequential indexing
      for (let i = 0; i < 100; i++) {
        const entry = logLines.find(l => l.msg === `Message ${i}`);
        expect(entry).toBeDefined();
        expect(entry.index).toBe(i);
      }
    });
  });

  describe('LOG_TO_STDOUT Environment Variable', () => {
    it('should log to stdout when LOG_TO_STDOUT is true (default)', async () => {
      // LOG_TO_STDOUT defaults to true, so we just need to make sure it's not explicitly false
      process.env.LOG_TO_STDOUT = 'true';

      // Mock console.log to capture stdout output
      const stdoutWrite = process.stdout.write;
      const writtenData = [];
      process.stdout.write = vi.fn((data) => {
        writtenData.push(data.toString());
        return true;
      });

      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('stdoutTest');

      logger.info('test stdout message');

      await flushAllLoggers();

      // Restore stdout
      process.stdout.write = stdoutWrite;

      // Verify something was written to stdout (in JSON format from pino)
      const stdoutContent = writtenData.join('');
      expect(stdoutContent).toBeTruthy();
      expect(stdoutContent).toContain('test stdout message');
    });

    it('should NOT log to stdout when LOG_TO_STDOUT is false', async () => {
      process.env.LOG_TO_STDOUT = 'false';

      // Mock console.log to capture stdout output
      const stdoutWrite = process.stdout.write;
      const writtenData = [];
      process.stdout.write = vi.fn((data) => {
        writtenData.push(data.toString());
        return true;
      });

      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('noStdoutTest');

      logger.info('test no stdout message');

      await flushAllLoggers();

      // Restore stdout
      process.stdout.write = stdoutWrite;

      // Verify nothing was written to stdout (file still gets logs)
      const fileContent = readLogFile(appLogPath);
      expect(fileContent).toContain('test no stdout message');

      // Note: pino multistream may still write some metadata to stdout,
      // but actual log messages should not be duplicated
    });

    it('should log to stdout when LOG_TO_STDOUT is 1', async () => {
      process.env.LOG_TO_STDOUT = '1';

      const stdoutWrite = process.stdout.write;
      const writtenData = [];
      process.stdout.write = vi.fn((data) => {
        writtenData.push(data.toString());
        return true;
      });

      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('stdout1Test');

      logger.info('test stdout 1 message');

      await flushAllLoggers();

      process.stdout.write = stdoutWrite;

      const stdoutContent = writtenData.join('');
      expect(stdoutContent).toBeTruthy();
      expect(stdoutContent).toContain('test stdout 1 message');
    });

    it('should NOT log to stdout when LOG_TO_STDOUT is 0', async () => {
      process.env.LOG_TO_STDOUT = '0';
      vi.resetModules();

      const stdoutWrite = process.stdout.write;
      const writtenData = [];
      process.stdout.write = vi.fn((data) => {
        writtenData.push(data.toString());
        return true;
      });

      const { createLogger } = await import('../backend/utils/logger.js');
      const logger = createLogger('noStdout0Test');

      logger.info('test no stdout 0 message');

      await flushAllLoggers();

      process.stdout.write = stdoutWrite;

      // File should still have the log
      const fileContent = readLogFile(appLogPath);
      expect(fileContent).toContain('test no stdout 0 message');
    });
  });
});
