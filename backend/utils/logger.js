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

import pino, { destination, stdSerializers, multistream } from 'pino';
import { build } from 'pino-pretty';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createTerminalUiPinoStream } from '../services/terminalUi.js';

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
  if (isTerminalUIMode()) {
    return false;
  }
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
  return destination({
    dest: filePath,
    sync: false, // Asynchronous for better performance
    minLength: 0, // No buffering - write immediately
    ...options
  });
}

/**
 * Create a pino destination with synchronous file writes
 * Used for critical logs that must be written immediately (e.g., SD.cpp logs)
 */
function createFileSyncDestination(filename, options = {}) {
  const filePath = path.join(logsDir, filename);
  return destination({
    dest: filePath,
    sync: true, // Synchronous for immediate writes
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

  const terminalUiStream = createTerminalUiPinoStream('app');
  if (terminalUiStream) {
    streams.push({ level: 'trace', stream: terminalUiStream });
  }

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
      error: stdSerializers.err,
      req: stdSerializers.req,
      res: stdSerializers.res,
    },
    // Redact sensitive data - array of paths
    redact: [
      'req.headers.authorization',
      'req.headers.cookie',
      'apiKey',
      'api_key',
      'password'
    ]
  }, multistream(streams));
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
      return { module: 'http', time: new Date().toISOString() };
    },
    serializers: {
      req: stdSerializers.req,
      res: stdSerializers.res,
      err: stdSerializers.err,
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
 * Create SD.cpp-specific logger (writes to sdcpp.log and optionally stdout)
 */
function createSdCppLogger() {
  // Create file destination for SD.cpp logs
  // We keep a reference to it for direct flushing
  const sdcppFileDestination = createFileSyncDestination('sdcpp.log');

  const streams = [
    // All SD.cpp logs go to sdcpp.log (sync writes to ensure logs are captured)
    { level: 'trace', stream: sdcppFileDestination },
  ];

  const terminalUiStream = createTerminalUiPinoStream('sdcpp');
  if (terminalUiStream) {
    streams.push({ level: 'trace', stream: terminalUiStream });
  }

  // Also output to console if LOG_TO_STDOUT is enabled (default: true)
  // Use pino-pretty for nice formatting with [SD.cpp] prefix
  if (isStdoutEnabled()) {
    const prettyStream = build({
      destination: process.stdout,
      colorize: true,
      translateTime: 'HH:MM:ss.l',
      ignore: 'pid,hostname,levelNum',
      singleLine: false,
      levelFirst: true,
      messageFormat: '[SD.cpp] {if generation_id}[gen:{generation_id}] {end}{msg}',
      customColors: 'trace:gray,debug:blue,info:green,warn:yellow,error:red,fatal:bgRed',
    });
    streams.push({
      level: LOG_LEVEL,
      stream: prettyStream,
    });
  }

  const logger = pino({
    level: LOG_LEVEL,
    formatters: {
      level: (label, number) => ({ level: label, levelNum: number }),
    },
    mixin() {
      return { module: 'sdcpp', time: new Date().toISOString() };
    },
    base: { type: 'sdcpp' }
  }, multistream(streams));

  // Store the file destination reference on the logger for direct access
  // This allows us to flush the file directly since logger.flush() doesn't
  // properly flush all streams in a multistream
  logger._fileDestination = sdcppFileDestination;

  return logger;
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
 * Flush the SD.cpp logger's file destination
 * This ensures logs are written to disk immediately.
 * Uses flushSync() for synchronous writes to guarantee data is persisted.
 */
export function flushSdCppLogger() {
  if (sdCppLogger._fileDestination && typeof sdCppLogger._fileDestination.flushSync === 'function') {
    sdCppLogger._fileDestination.flushSync();
  }
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
 * Check if data contains image/base64 content that should be excluded from logs
 * @param {any} data - Data to check
 * @returns {boolean} True if data contains image content
 */
function containsImageData(data) {
  if (!data) return false;

  // Check for base64 image data patterns
  if (typeof data === 'string') {
    return data.startsWith('data:image/') ||
           data.includes('"b64_json"') ||
           data.includes('"image"') && data.includes('"base64"');
  }

  if (Array.isArray(data)) {
    return data.some(item => containsImageData(item));
  }

  if (typeof data === 'object') {
    // Check common image response fields
    if (data.b64_json || data.image || data.data) {
      return true;
    }
    // Check for images array
    if (Array.isArray(data.data) && data.data.length > 0 && data.data[0].b64_json) {
      return true;
    }
  }

  return false;
}

/**
 * Sanitize response data for logging by removing/replacing large image data
 * @param {any} data - Response data to sanitize
 * @param {number} maxLength - Maximum string length before truncation
 * @returns {any} Sanitized data safe for logging
 */
function sanitizeResponseData(data, maxLength = 500) {
  if (!data) return data;

  if (typeof data === 'string') {
    // Check if it looks like base64 image data
    if (data.length > maxLength && /^[A-Za-z0-9+/=]+$/.test(data.substring(0, 100))) {
      return `<base64 data length=${data.length}>`;
    }
    return data.length > maxLength ? data.substring(0, maxLength) + '...' : data;
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponseData(item, maxLength));
  }

  if (typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === 'b64_json' || key === 'image') {
        sanitized[key] = `<base64 length=${typeof value === 'string' ? value.length : 'unknown'}>`;
      } else if (key === 'data' && Array.isArray(value)) {
        // Handle images array
        if (value.length > 0 && value[0].b64_json) {
          sanitized[key] = value.map((img, i) => ({
            index: i,
            b64_json: `<base64 length=${img.b64_json?.length || 'unknown'}>`
          }));
        } else {
          sanitized[key] = sanitizeResponseData(value, maxLength);
        }
      } else if (typeof value === 'string' && value.length > maxLength) {
        // Check for base64-like content
        if (/^[A-Za-z0-9+/=]+$/.test(value.substring(0, 50))) {
          sanitized[key] = `<base64 length=${value.length}>`;
        } else {
          sanitized[key] = value.substring(0, maxLength) + '...';
        }
      } else {
        sanitized[key] = sanitizeResponseData(value, maxLength);
      }
    }
    return sanitized;
  }

  return data;
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
    } else {
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
        // Sanitize body - redact sensitive fields and large data
        const sanitizedBody = {};
        for (const [key, value] of Object.entries(body)) {
          if (key.toLowerCase() === 'password' || key.toLowerCase() === 'apikey' || key.toLowerCase() === 'api_key') {
            sanitizedBody[key] = '[REDACTED]';
          } else if (key === 'image' || key === 'init_images' || key === 'mask') {
            // Handle image fields in requests
            if (typeof value === 'string' && value.length > 100) {
              sanitizedBody[key] = `<base64 length=${value.length}>`;
            } else if (Array.isArray(value)) {
              sanitizedBody[key] = value.map(v =>
                typeof v === 'string' && v.length > 100 ? `<base64 length=${v.length}>` : v
              );
            } else {
              sanitizedBody[key] = value;
            }
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

  // Add response data (sanitized to exclude large image data)
  if (data) {
    if (typeof data === 'object') {
      // Sanitize the response to remove base64 image data
      logData.response = sanitizeResponseData(data);
    } else if (typeof data === 'string') {
      // For string responses, truncate if too long or looks like base64
      if (data.length > 500) {
        if (/^[A-Za-z0-9+/=]+$/.test(data.substring(0, 100))) {
          logData.response = `<base64 data length=${data.length}>`;
        } else {
          logData.response = data.substring(0, 500) + '...';
        }
      } else {
        logData.response = data;
      }
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
  flushSdCppLogger();
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
  flushSdCppLogger();
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
    error: stdSerializers.err(error),
    eventType: 'cliError'
  }, `CLI Error: ${error.message}`);

  // Flush immediately to ensure logs are written
  flushSdCppLogger();
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

  let response;
  try {
    response = await fetch(url, options);
  } catch (fetchError) {
    // Enhanced error logging for fetch failures
    const errorInfo = {
      url,
      method,
      error: fetchError.message,
      errorType: fetchError.name,
      errorCode: fetchError.code,
      cause: fetchError.cause?.message || fetchError.cause,
      // Include timeout info if available
      signalReason: options.signal?.reason,
      signalAborted: options.signal?.aborted,
    };
    
    baseLogger.error(errorInfo, 'Fetch request failed');
    
    // Re-throw with enhanced message
    const enhancedError = new Error(`Fetch failed: ${fetchError.message} (URL: ${url}, Method: ${method})`);
    enhancedError.cause = fetchError;
    enhancedError.url = url;
    enhancedError.method = method;
    throw enhancedError;
  }

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
  };
}

// Export default logger for general use
export default createLogger('app');

// Export pino for advanced usage
export { pino };

/**
 * Check if running in terminal UI mode
 * @returns {boolean} True if terminal UI mode is enabled
 */
export function isTerminalUIMode() {
  return process.argv.includes('--terminal-ui');
}

/**
 * Format memory flags for display
 * @param {Object} flags - Memory flags object
 * @returns {string} Formatted string like "vae-on-cpu,offload-to-cpu,flash-attn,diffusion-fa"
 */
function formatMemoryFlags(flags) {
  if (!flags) return 'none';
  const activeFlags = [];
  if (flags.vae_on_cpu) activeFlags.push('vae-on-cpu');
  if (flags.offload_to_cpu) activeFlags.push('offload-to-cpu');
  if (flags.diffusion_fa) activeFlags.push('diffusion-fa');
  if (flags.flash_attention) activeFlags.push('flash-attn');
  return activeFlags.length > 0 ? activeFlags.join(',') : 'none';
}

/**
 * Format time in seconds with tenths
 * @param {number} ms - Time in milliseconds
 * @returns {string} Formatted time like "12.5s"
 */
function formatTime(ms) {
  if (ms === undefined || ms === null) return 'N/A';
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Log generation start event
 * Outputs concise event when NOT in terminal UI mode
 * @param {Object} options - Generation options
 * @param {string} options.modelName - Model display name
 * @param {string} options.prompt - Full prompt
 * @param {string} options.size - Resolution (WxH)
 * @param {number|string} options.seed - Seed value
 * @param {string} options.sampling_method - Sampler name
 * @param {number} options.sample_steps - Number of steps
 * @param {number} options.cfg_scale - CFG scale
 * @param {string} options.type - Generation type (generate/edit/variation/upscale)
 * @param {string[]} [options.referenceImages] - List of reference image paths
 * @param {boolean} [options.upscaleEnabled] - Whether upscaling is enabled
 * @param {string} [options.upscaleKind] - Upscaler kind if enabled
 */
export function logGenerationStart(options) {
  if (isTerminalUIMode()) return;

  const {
    modelName,
    prompt,
    size,
    seed,
    sampling_method,
    sample_steps,
    cfg_scale,
    type,
    referenceImages,
    upscaleEnabled,
    upscaleKind,
  } = options;

  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  let message = `[GEN-START] ${timestamp} | ${modelName} | ${size} | seed:${seed} | ${sampling_method} | steps:${sample_steps} | cfg:${cfg_scale}`;

  if (type === 'edit' || type === 'variation') {
    const images = referenceImages || [];
    message += ` | ref-images:${images.length}`;
    if (images.length > 0) {
      const filenames = images.map(p => p.split('/').pop()).join(',');
      message += `(${filenames})`;
    }
  }

  if (upscaleEnabled) {
    message += ` | upscale:${upscaleKind || 'enabled'}`;
  }

  baseLogger.info({ eventType: 'generation_start' }, message);
  baseLogger.info({ eventType: 'generation_start_prompt', prompt }, `[GEN-START] prompt: ${prompt}`);
}

/**
 * Log generation end event
 * Outputs concise event when NOT in terminal UI mode
 * @param {Object} options - Generation result
 * @param {number} options.modelLoadTimeMs - Model loading time in ms
 * @param {number} options.generationTimeMs - Generation time in ms
 * @param {Object} [options.memoryFlags] - Memory flags used
 * @param {boolean} [options.memoryFlags.vae_on_cpu] - VAE on CPU flag
 * @param {boolean} [options.memoryFlags.offload_to_cpu] - Offload to CPU flag
 * @param {boolean} [options.memoryFlags.diffusion_fa] - Diffusion flash attention flag
 * @param {boolean} [options.memoryFlags.flash_attention] - Flash attention flag
 */
export function logGenerationEnd(options) {
  if (isTerminalUIMode()) return;

  const {
    modelLoadTimeMs,
    generationTimeMs,
    memoryFlags,
  } = options;

  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  const modelLoadStr = formatTime(modelLoadTimeMs);
  const genTimeStr = formatTime(generationTimeMs);
  const memFlagsStr = formatMemoryFlags(memoryFlags);

  baseLogger.info(
    {
      eventType: 'generation_end',
      modelLoadTimeMs,
      generationTimeMs,
      memoryFlags,
    },
    `[GEN-END] ${timestamp} | model-load:${modelLoadStr} | gen:${genTimeStr} | mem:${memFlagsStr}`
  );
}
