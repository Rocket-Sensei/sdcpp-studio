/**
 * Process entry for tracking running model processes
 */

import { ModelStatus } from '../services/modelManager.js';

export class ProcessEntry {
  constructor(modelId, process, port, execMode, options = {}) {
    this.modelId = modelId;
    this.process = process;
    this.port = port;
    this.execMode = execMode;
    this.startedAt = options.startedAt || Date.now();
    this.pid = process?.pid || null;
    this.status = options.status || ModelStatus.STARTING;
    this.exitCode = null;
    this.signal = null;
    this.outputBuffer = [];
    this.errorBuffer = [];
    this.command = options.command || '';
    this.args = options.args || [];
    this.autoStopTimeout = null;
    this.autoStopTimeoutMs = null;
  }

  /**
   * Get process uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  /**
   * Get recent output lines
   */
  getRecentOutput(lines = 10) {
    return this.outputBuffer.slice(-lines);
  }

  /**
   * Get recent error lines
   */
  getRecentErrors(lines = 10) {
    return this.errorBuffer.slice(-lines);
  }

  /**
   * Append output to buffer
   */
  appendOutput(data) {
    const text = data.toString().trim();
    if (text) {
      this.outputBuffer.push(`[${new Date().toISOString()}] ${text}`);
      // Keep buffer size manageable
      if (this.outputBuffer.length > 100) {
        this.outputBuffer = this.outputBuffer.slice(-50);
      }
    }
  }

  /**
   * Append error to buffer
   */
  appendError(data) {
    const text = data.toString().trim();
    if (text) {
      this.errorBuffer.push(`[${new Date().toISOString()}] ${text}`);
      // Keep buffer size manageable
      if (this.errorBuffer.length > 100) {
        this.errorBuffer = this.errorBuffer.slice(-50);
      }
    }
  }

  /**
   * Clear auto-stop timeout
   */
  clearAutoStop() {
    if (this.autoStopTimeout !== null) {
      clearTimeout(this.autoStopTimeout);
      this.autoStopTimeout = null;
      this.autoStopTimeoutMs = null;
    }
  }

  /**
   * Get remaining time until auto-stop (in seconds)
   * @returns {number|null} Remaining seconds or null if no auto-stop configured
   */
  getAutoStopRemaining() {
    if (this.autoStopTimeoutMs === null) {
      return null;
    }
    const elapsed = Date.now() - this.startedAt;
    const remaining = Math.max(0, this.autoStopTimeoutMs - elapsed);
    return Math.ceil(remaining / 1000);
  }
}
