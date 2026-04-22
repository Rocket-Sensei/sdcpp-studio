/**
 * Timeout parsing utilities
 * Supports formats like "10m", "1h", "30s", "500ms"
 */

const MULTIPLIERS = {
  'ms': 1,
  'millisecond': 1,
  'milliseconds': 1,
  's': 1000,
  'sec': 1000,
  'second': 1000,
  'seconds': 1000,
  'm': 60 * 1000,
  'min': 60 * 1000,
  'minute': 60 * 1000,
  'minutes': 60 * 1000,
  'h': 60 * 60 * 1000,
  'hr': 60 * 60 * 1000,
  'hour': 60 * 60 * 1000,
  'hours': 60 * 60 * 1000,
  'd': 24 * 60 * 60 * 1000,
  'day': 24 * 60 * 60 * 1000,
  'days': 24 * 60 * 60 * 1000,
};

/**
 * Parse timeout string to milliseconds
 * @param {string} timeoutStr - Timeout string
 * @returns {number|null} Milliseconds or null if invalid
 */
export function parseTimeout(timeoutStr) {
  if (!timeoutStr || typeof timeoutStr !== 'string') {
    return null;
  }

  const trimmed = timeoutStr.trim().toLowerCase();

  // Try parsing as a plain number (assume milliseconds)
  const plainNumber = parseInt(trimmed, 10);
  if (!isNaN(plainNumber) && /^\d+$/.test(trimmed)) {
    return plainNumber;
  }

  // Parse with unit suffix
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/);
  if (!match) {
    return null;
  }

  const value = parseFloat(match[1]);
  const unit = match[2] || 'ms';

  if (isNaN(value) || value <= 0) {
    return null;
  }

  const multiplier = MULTIPLIERS[unit];
  if (!multiplier) {
    return null;
  }

  return Math.floor(value * multiplier);
}

/**
 * Format milliseconds to human readable string
 * @param {number} ms - Milliseconds
 * @returns {string} Human readable duration
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
  return `${Math.floor(ms / 86400000)}d`;
}
