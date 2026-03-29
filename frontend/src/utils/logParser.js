/**
 * Log Parsing Utilities for SD.cpp Studio Terminal UI
 * 
 * Handles:
 * - Extraction of stdout field from JSON log entries
 * - ANSI color code stripping
 * - Progress bar detection and normalization
 */

/**
 * ANSI escape code patterns
 */
const ANSI_PATTERNS = {
  // Standard ANSI escape sequence
  escape: /\x1b[\[\d]*[A-Za-z]/g,
  // CSI (Control Sequence Introducer) sequences
  csi: /\x1b\[[0-9;]*[A-Za-z]/g,
  // OSC (Operating System Command) sequences  
  osc: /\x1b\][^\x07]*\x07/g,
  // Various ANSI codes
  all: /[\x1b\x9b][^\x07]*\x07|\x1b\[[0-9;]*[A-Za-z]|\x1b[>=]/g,
  // Specific color codes
  color: /\x1b\[[0-9;]*m/g,
};

/**
 * Progress bar patterns
 */
const PROGRESS_PATTERNS = {
  // |===>|    | 50% style bars (and variants like |====>| 50%)
  bar: /\|[=>-]+\|?\s*\|?\s*\d+%/,
  // \r (carriage return) at start - progress update on same line
  crUpdate: /\r[^\n]*/,
  // [K (clear line) character
  clearLine: /\[K/g,
  // Unicode block elements for progress
  blockProgress: /[█░▒▓▌▐]/g,
};

/**
 * JSON log entry patterns
 */
const LOG_PATTERNS = {
  // Match JSON lines that contain stdout field
  jsonLog: /^\s*\{.*"stdout"\s*:.*\}\s*$/,
  // Extract the stdout value from JSON
  stdoutExtract: /"stdout"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/,
};

/**
 * Check if a line appears to be a progress bar update
 * Progress bars typically have \r at start and [K for line clearing
 * @param {string} line 
 * @returns {boolean}
 */
export function isProgressBarLine(line) {
  if (!line || typeof line !== 'string') return false;
  
  // Has carriage return at start (updating same line)
  if (line.startsWith('\r')) {
    return true;
  }
  
  // Has progress bar characters
  if (PROGRESS_PATTERNS.bar.test(line)) {
    return true;
  }
  
  // Has [K clear line code
  if (line.includes('[K')) {
    return true;
  }
  
  return false;
}

/**
 * Detect if text contains progress bar elements
 * @param {string} text 
 * @returns {boolean}
 */
export function containsProgressBar(text) {
  if (!text || typeof text !== 'string') return false;
  return PROGRESS_PATTERNS.bar.test(text) || 
         text.includes('\r') || 
         text.includes('[K') ||
         PROGRESS_PATTERNS.blockProgress.test(text);
}

/**
 * Strip ANSI escape codes from text
 * @param {string} text 
 * @returns {string}
 */
export function stripAnsiCodes(text) {
  if (!text || typeof text !== 'string') return '';
  
  let result = text;
  
  // Remove all ANSI escape sequences
  result = result.replace(ANSI_PATTERNS.all, '');
  
  // Also remove remaining escape characters
  result = result.replace(/\x1b/g, '');
  
  return result;
}

/**
 * Normalize progress bar by removing carriage returns and consolidating
 * @param {string} text 
 * @returns {string}
 */
export function normalizeProgressBar(text) {
  if (!text || typeof text !== 'string') return '';
  
  let result = text;
  
  // Replace \r\n with just \n
  result = result.replace(/\r\n/g, '\n');
  
  // Replace standalone \r with newline
  result = result.replace(/\r/g, '\n');
  
  // Remove [K codes
  result = result.replace(/\[K/g, '');
  
  // Remove progress bar graphics for display (keep percentage if present)
  result = result.replace(/[█░▒▓]/g, '.');
  result = result.replace(/[▌▐]/g, '');
  
  // Clean up multiple spaces
  result = result.replace(/\s+/g, ' ');
  
  // Trim each line
  result = result.split('\n').map(line => line.trim()).join('\n');
  
  return result;
}

/**
 * Parse a single log line and extract the stdout field if it's JSON
 * @param {string} line 
 * @returns {{ content: string, isJson: boolean, raw: string }}
 */
export function parseLogLine(line) {
  if (!line || typeof line !== 'string') {
    return { content: '', isJson: false, raw: '' };
  }
  
  const trimmed = line.trim();
  
  if (!trimmed) {
    return { content: '', isJson: false, raw: line };
  }
  
  // Try to parse as JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      
      // Check if it has a stdout field
      if (parsed.stdout !== undefined) {
        return {
          content: parsed.stdout,
          isJson: true,
          raw: line,
          parsed,
        };
      }
      
      // Check if it has a msg field (pino log format)
      if (parsed.msg !== undefined) {
        return {
          content: parsed.msg,
          isJson: true,
          raw: line,
          parsed,
        };
      }
      
      // It's JSON but no stdout/msg - return full JSON as string
      return {
        content: trimmed,
        isJson: true,
        raw: line,
        parsed,
      };
    } catch {
      // Not valid JSON, treat as plain text
      return { content: trimmed, isJson: false, raw: line };
    }
  }
  
  // Plain text line
  return { content: trimmed, isJson: false, raw: line };
}

/**
 * Parse multiple log lines
 * @param {string[]} lines 
 * @returns {Array<{ content: string, isJson: boolean, raw: string, parsed?: object }>}
 */
export function parseLogLines(lines) {
  if (!Array.isArray(lines)) {
    return [];
  }
  return lines.map(line => parseLogLine(line));
}

/**
 * Extract displayable content from log entry
 * Prioritizes: stdout > stderr > msg > raw
 * @param {object|string} logEntry 
 * @returns {string}
 */
export function extractLogContent(logEntry) {
  if (typeof logEntry === 'string') {
    const parsed = parseLogLine(logEntry);
    return parsed.content;
  }
  
  if (logEntry && typeof logEntry === 'object') {
    // Try stdout first (SD.cpp format)
    if (logEntry.stdout !== undefined) {
      return String(logEntry.stdout);
    }
    
    // Try stderr
    if (logEntry.stderr !== undefined) {
      return String(logEntry.stderr);
    }
    
    // Try msg (pino format)
    if (logEntry.msg !== undefined) {
      return String(logEntry.msg);
    }
    
    // Fall back to raw JSON
    return JSON.stringify(logEntry);
  }
  
  return String(logEntry || '');
}

/**
 * Strip log level prefix from line content
 * Matches patterns like [INFO ], [INFO], [DEBUG], [ERROR], [WARN], [TRACE], etc.
 * @param {string} content 
 * @returns {string}
 */
function stripLogLevelPrefix(content) {
  return content.replace(/^\[(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\](\s*)/i, '').replace(/^\[(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)\s\]/i, '').trim();
}

/**
 * Process raw log text for display
 * - Extracts stdout from JSON logs
 * - Strips ANSI codes
 * - Normalizes progress bars
 * @param {string} rawText 
 * @returns {{ lines: string[], hasProgressBars: boolean }}
 */
export function processLogForDisplay(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { lines: [], hasProgressBars: false };
  }
  
  // Split into lines
  const rawLines = rawText.split('\n');
  const processedLines = [];
  let hasProgressBars = false;
  
  for (const line of rawLines) {
    if (!line.trim()) continue;
    
    // Check for progress bar
    if (containsProgressBar(line)) {
      hasProgressBars = true;
      const normalized = normalizeProgressBar(stripAnsiCodes(line));
      if (normalized) {
        processedLines.push(normalized);
      }
      continue;
    }
    
    // Parse the line (extract stdout if JSON)
    const parsed = parseLogLine(line);
    
    // Strip ANSI codes
    let content = stripAnsiCodes(parsed.content);
    
    // Strip log level prefix
    content = stripLogLevelPrefix(content);
    
    // Skip empty lines
    if (content.trim()) {
      processedLines.push(content);
    }
  }
  
  return { lines: processedLines, hasProgressBars };
}

/**
 * Parse SD.cpp JSON log format
 * Expected format: {"type":"sdcpp","generation_id":"...","module":"sdcpp","stdout":"[INFO ] message"}
 * @param {string} line 
 * @returns {{ type: string, generation_id?: string, module?: string, stdout?: string, level?: string, time?: string } | null}
 */
export function parseSdcppLogLine(line) {
  if (!line || typeof line !== 'string') return null;
  
  const trimmed = line.trim();
  
  // Must be JSON
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return null;
  }
  
  try {
    const parsed = JSON.parse(trimmed);
    
    // Validate it's an SD.cpp log (has type field with value 'sdcpp')
    if (parsed.type !== 'sdcpp') {
      return null;
    }
    
    return {
      type: parsed.type,
      generationId: parsed.generation_id,
      module: parsed.module,
      stdout: parsed.stdout,
      stderr: parsed.stderr,
      level: parsed.level,
      time: parsed.time,
    };
  } catch {
    return null;
  }
}

/**
 * Extract generation ID from log entry or line
 * @param {string|object} logEntry 
 * @returns {string|null}
 */
export function extractGenerationId(logEntry) {
  if (typeof logEntry === 'string') {
    const parsed = parseSdcppLogLine(logEntry);
    return parsed?.generationId || parsed?.generation_id || null;
  }
  
  if (logEntry && typeof logEntry === 'object') {
    return logEntry.generationId || logEntry.generation_id || null;
  }
  
  return null;
}

/**
 * Format log timestamp for display
 * @param {string} isoTime 
 * @returns {string}
 */
export function formatLogTimestamp(isoTime) {
  if (!isoTime) return '';
  
  try {
    const date = new Date(isoTime);
    if (isNaN(date.getTime())) {
      return isoTime;
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${String(date.getUTCMilliseconds()).padStart(3, '0')}`;
  } catch {
    return isoTime;
  }
}

/**
 * Detect log level from SD.cpp log line
 * @param {string} line 
 * @returns {'error'|'warn'|'info'|'debug'|'trace'|null}
 */
export function detectLogLevel(line) {
  if (!line || typeof line !== 'string') return null;
  
  const upperLine = line.toUpperCase();
  
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
 * Batch process logs for efficient rendering
 * @param {Array<string|object>} logs 
 * @returns {Array<{ id: string, content: string, level: string|null, timestamp: string, generationId: string|null }>}
 */
export function batchProcessLogs(logs) {
  return logs.map((log, index) => {
    const content = extractLogContent(log);
    const stripped = stripAnsiCodes(content);
    const generationId = extractGenerationId(log);
    const timestamp = typeof log === 'object' ? log.time : null;
    const level = detectLogLevel(content);
    
    return {
      id: `log-${index}-${Date.now()}`,
      content: stripped,
      level,
      timestamp: formatLogTimestamp(timestamp),
      generationId,
      original: log,
    };
  });
}
