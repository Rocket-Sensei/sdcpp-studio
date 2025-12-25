/**
 * Pino-based Logging Utility
 *
 * Provides structured logging with multiple file outputs:
 * - logs/http.log: HTTP API request/response logs
 * - logs/sdcpp.log: sd-cli/sd-server logs
 * - logs/app.log: General application logs
 *
 * Environment variables:
 * - LOG_LEVEL: Minimum log level (default: 'info')
 * - LOG_TO_STDOUT: Copy all logs to stdout (default: 'true')
 * - LOG_API_CALLS: Enable HTTP API request/response logging (default: 'true')
 * - LOG_CLI_CALLS: Enable CLI command execution logging (default: 'true')
 * - NODE_ENV: 'development' enables pretty printing to console
 */

import pino from 'pino';
import { build } from 'pino-pretty';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../..');

// Ensure logs directory exists
const logsDir = path.join(PROJECT_ROOT, 'backend', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log levels
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true';

/**
 * Check if logging to stdout is enabled
 */
function isStdoutEnabled() {
  return process.env.LOG_TO_STDOUT !== 'false' && process.env.LOG_TO_STDOUT !== '0';
}

/**
 * Check if API logging is enabled
 */
function isApiLoggingEnabled() {
  return process.env.LOG_API_CALLS !== 'false' && process.env.LOG_API_CALLS !== '0';
}

/**
 * Check if CLI logging is enabled
 */
function isCliLoggingEnabled() {
  return process.env.LOG_CLI_CALLS !== 'false' && process.env.LOG_CLI_CALLS !== '0';
}

/**
 * Create a pino destination with file rotation support
 */
function createFileDestination(filename, options = {}) {
  const filePath = path.join(logsDir, filename);
  return pino.destination({
    dest: filePath,
    sync: false, // Asynchronous for better performance
    minLength: 0, // No buffering - write immediately
    ...options
  });
}

/**
 * Create multi-stream logger for different log types
 */
function createBaseLogger() {
  const streams = [
    // All logs go to app.log
    { level: 'trace', stream: createFileDestination('app.log') },
  ];

  // Also output to console if LOG_TO_STDOUT is enabled (default: true)
  // Use pino-pretty for nice formatting
  if (isStdoutEnabled()) {
    const prettyStream = build({
      destination: process.stdout,
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname,levelNum',
      singleLine: false,
      levelFirst: true,
      messageFormat: '{if module}[{module}] {end}{msg}',
      customColors: 'trace:gray,debug:blue,info:green,warn:yellow,error:red,fatal:bgRed',
    });
    streams.push({
      level: LOG_LEVEL,
      stream: prettyStream,
    });
  }

  return pino({
    level: LOG_LEVEL,
    formatters: {
      level: (label, number) => {
        return { level: label, levelNum: number };
      },
    },
    // Use mixin to add custom time field
    mixin() {
      return { time: new Date().toISOString() };
    },
    serializers: {
      error: pino.stdSerializers.err,
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
    },
    // Redact sensitive data - array of paths
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'apiKey',
      'api_key',
      'password'
    ]
  }, pino.multistream(streams));
}

/**
 * Create HTTP-specific logger (writes to http.log)
 */
function createHttpLogger() {
  return pino({
    level: LOG_LEVEL,
    formatters: {
      level: (label, number) => ({ level: label, levelNum: number }),
    },
    mixin() {
      return { time: new Date().toISOString() };
    },
    serializers: {
      req: pino.stdSerializers.req,
      res: pino.stdSerializers.res,
      err: pino.stdSerializers.err,
    },
    // Redact sensitive data - array of paths
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'body.password',
      'body.apiKey',
      'password',
      'apiKey'
    ]
  }, createFileDestination('http.log'));
}

/**
 * Create SD.cpp-specific logger (writes to sdcpp.log)
 */
function createSdCppLogger() {
  return pino({
    level: LOG_LEVEL,
    formatters: {
      level: (label, number) => ({ level: label, levelNum: number }),
    },
    mixin() {
      return { time: new Date().toISOString() };
    },
    base: { type: 'sdcpp' }
  }, createFileDestination('sdcpp.log'));
}

// Base logger instance
const baseLogger = createBaseLogger();
const httpLogger = createHttpLogger();
const sdCppLogger = createSdCppLogger();

/**
 * Create a child logger with module context
 * @param {string} module - Module name
 * @param {Object} bindings - Additional bindings
 * @returns {pino.Logger} Child logger
 */
export function createLogger(module, bindings = {}) {
  return baseLogger.child({
    module,
    ...bindings
  });
}

/**
 * Create a logger with generation context for tracking generation-specific logs
 * @param {string} generationId - Generation ID to tag logs with
 * @param {string} module - Module name (optional)
 * @returns {pino.Logger} Child logger with generation_id
 */
export function createGenerationLogger(generationId, module = 'generation') {
  return baseLogger.child({
    module,
    generation_id: generationId
  });
}

/**
 * Get the HTTP logger
 * @returns {pino.Logger} HTTP logger
 */
export function getHttpLogger() {
  return httpLogger;
}

/**
 * Get the SD.cpp logger with optional generation context
 * @param {string} generationId - Optional generation ID to tag logs with
 * @returns {pino.Logger} SD.cpp logger with or without generation context
 */
export function getSdCppLogger(generationId = null) {
  if (generationId) {
    return sdCppLogger.child({ generation_id: generationId });
  }
  return sdCppLogger;
}

/**
 * Create an SD.cpp child logger with generation context
 * @param {string} generationId - Generation ID to tag logs with
 * @returns {pino.Logger} Child logger with generation_id for sdcpp.log
 */
export function createSdCppChildLogger(generationId) {
  return sdCppLogger.child({ generation_id: generationId });
}

/**
 * Get the base logger
 * @returns {pino.Logger} Base logger
 */
export function getBaseLogger() {
  return baseLogger;
}

/**
 * Log HTTP API request
 * @param {string} method - HTTP method
 * @param {string} url - Full URL
 * @param {Object} headers - Request headers
 * @param {Object|string|FormData} body - Request body
 */
export function logApiRequest(method, url, headers = {}, body = null) {
  if (!isApiLoggingEnabled()) return;

  // Sanitize headers before logging
  const sanitizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'authorization') {
      sanitizedHeaders[key] = '[REDACTED]';
    } else if (key.toLowerCase() === 'cookie') {
      sanitizedHeaders[key] = '[REDACTED]';
    } else if (key.toLowerCase() !== 'content-type') {
      sanitizedHeaders[key] = value;
    }
  }

  const logData = {
    method,
    url,
    headers: sanitizedHeaders,
  };

  // Add body info without sensitive data
  if (body) {
    if (body instanceof FormData) {
      logData.contentType = 'multipart/form-data';
      const formDataInfo = {};
      try {
        for (const [key, value] of body.entries()) {
          if (value instanceof Blob) {
            formDataInfo[key] = `<Blob size=${value.size} type=${value.type}>`;
          } else {
            formDataInfo[key] = value;
          }
        }
        logData.formData = formDataInfo;
      } catch (e) {
        logData.formData = '<Unable to enumerate>';
      }
    } else if (typeof body === 'string') {
      logData.contentType = headers['Content-Type'] || 'application/json';
      logData.body = body;
    } else if (typeof body === 'object') {
      const isEmpty = !body || Object.keys(body).length === 0;
      if (!isEmpty) {
        logData.contentType = headers['Content-Type'] || 'application/json';
        logData.bodyKeys = Object.keys(body);
        // Sanitize body - redact sensitive fields
        const sanitizedBody = {};
        for (const [key, value] of Object.entries(body)) {
          if (key.toLowerCase() === 'password' || key.toLowerCase() === 'apikey' || key.toLowerCase() === 'api_key') {
            sanitizedBody[key] = '[REDACTED]';
          } else if (typeof value === 'string' && value.length > 1000) {
            sanitizedBody[key] = `<data length=${value.length}>`;
          } else {
            sanitizedBody[key] = value;
          }
        }
        logData.body = sanitizedBody;
      }
    }
  }

  httpLogger.info({ ...logData, eventType: 'apiRequest' }, `API ${method} ${url}`);
}

/**
 * Log HTTP API response
 * @param {Response} response - Fetch response object
 * @param {Object|string} data - Parsed response data
 */
export async function logApiResponse(response, data = null) {
  if (!isApiLoggingEnabled()) return;

  const logData = {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
  };

  // Add response summary
  if (data) {
    if (data.data && Array.isArray(data.data)) {
      logData.responseSummary = `${data.data.length} image(s)`;
    } else if (data.id) {
      logData.responseSummary = `job id=${data.id}, status=${data.status}`;
    } else if (data.created) {
      logData.responseSummary = `created=${data.created}`;
    } else {
      logData.responseSummary = '<data received>';
    }
  }

  const level = response.status >= 400 ? 'error' : 'info';
  httpLogger[level]({ ...logData, eventType: 'apiResponse' }, `API Response: ${response.status}`);
}

/**
 * Log CLI command execution
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {Object} options - Spawn options
 * @param {string} generationId - Optional generation ID to tag logs with
 */
export function logCliCommand(command, args = [], options = {}, generationId = null) {
  if (!isCliLoggingEnabled()) return;

  const shellCmd = [command, ...args.map(arg => arg.includes(' ') ? `'${arg}'` : arg)].join(' ');
  const logger = getSdCppLogger(generationId);

  logger.info({
    command,
    args,
    options,
    shellCmd,
    eventType: 'cliCommand'
  }, `CLI: ${command}`);

  // Flush immediately to ensure logs are written
  logger.flush();
}

/**
 * Log CLI command output
 * @param {string} stdout - Standard output
 * @param {string} stderr - Standard error
 * @param {number} exitCode - Process exit code
 * @param {string} generationId - Optional generation ID to tag logs with
 */
export function logCliOutput(stdout, stderr, exitCode, generationId = null) {
  if (!isCliLoggingEnabled()) return;

  const level = exitCode !== 0 ? 'error' : 'info';
  const logger = getSdCppLogger(generationId);

  logger[level]({
    exitCode,
    stdout: stdout || undefined,
    stderr: stderr || undefined,
    eventType: 'cliOutput'
  }, `CLI exit code: ${exitCode}`);

  // Flush immediately to ensure logs are written
  logger.flush();
}

/**
 * Log CLI command error
 * @param {Error} error - Error object
 * @param {string} generationId - Optional generation ID to tag logs with
 */
export function logCliError(error, generationId = null) {
  if (!isCliLoggingEnabled()) return;

  const logger = getSdCppLogger(generationId);

  logger.error({
    error: pino.stdSerializers.err(error),
    eventType: 'cliError'
  }, `CLI Error: ${error.message}`);

  // Flush immediately to ensure logs are written
  logger.flush();
}

/**
 * Wrapper for fetch that logs request and response
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function loggedFetch(url, options = {}) {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const body = options.body;

  logApiRequest(method, url, headers, body);

  const response = await fetch(url, options);

  // Try to parse response for logging
  try {
    const clonedResponse = response.clone();
    const data = await clonedResponse.json();
    await logApiResponse(response, data);
  } catch {
    // Not JSON, log as text
    try {
      const clonedResponse = response.clone();
      const text = await clonedResponse.text();
      await logApiResponse(response, text.substring(0, 1000));
    } catch {
      await logApiResponse(response, null);
    }
  }

  return response;
}

/**
 * Read logs from a file and optionally filter by generation_id
 * @param {string} filename - Log file name (e.g., 'app.log', 'sdcpp.log')
 * @param {string} generationId - Optional generation ID to filter by
 * @param {number} limit - Maximum number of log entries to return (default: 100)
 * @returns {Promise<Array>} Array of parsed log entries
 */
export async function readLogs(filename, generationId = null, limit = 100) {
  const filePath = path.join(logsDir, filename);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const logs = [];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  // Process in reverse order to get most recent logs first
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const logEntry = JSON.parse(lines[i]);

      // Filter by generation_id if specified
      if (generationId) {
        if (logEntry.generation_id === generationId) {
          logs.push(logEntry);
        }
      } else {
        logs.push(logEntry);
      }

      if (logs.length >= limit) break;
    } catch (e) {
      // Skip invalid JSON lines
      continue;
    }
  }

  // Reverse to get chronological order
  return logs.reverse();
}

/**
 * Get all logs for a specific generation across all log files
 * @param {string} generationId - Generation ID to fetch logs for
 * @param {number} limit - Maximum number of log entries per file (default: 50)
 * @returns {Promise<Object>} Object with logs from different files
 */
export async function getGenerationLogs(generationId, limit = 50) {
  const [appLogs, sdcppLogs, httpLogs] = await Promise.all([
    readLogs('app.log', generationId, limit),
    readLogs('sdcpp.log', generationId, limit),
    readLogs('http.log', generationId, limit),
  ]);

  return {
    app: appLogs,
    sdcpp: sdcppLogs,
    http: httpLogs,
    all: [...appLogs, ...sdcppLogs, ...httpLogs].sort((a, b) => {
      // Sort by time if available, otherwise by levelNum
      const timeA = a.time || 0;
      const timeB = b.time || 0;
      return timeA.localeCompare(timeB);
    })
  };
}

// Export default logger for general use
export default createLogger('app');

// Export pino for advanced usage
export { pino };
