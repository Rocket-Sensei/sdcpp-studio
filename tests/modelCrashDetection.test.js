/**
 * Tests for Model Crash Detection During Startup
 *
 * This test verifies that when a model process crashes during startup,
 * the system detects the crash immediately instead of waiting for the
 * full timeout period.
 *
 * The issue was that _waitForServerReady only checked process.killed and
 * process.exitCode, but not processEntry.status which is set to ERROR
 * when _handleProcessExit is called.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Model Crash Detection - Startup Timeout Fix', () => {
  let sourceCode;

  beforeAll(() => {
    const modelManagerPath = join(__dirname, '../backend/services/modelManager.js');
    sourceCode = readFileSync(modelManagerPath, 'utf-8');
  });

  describe('_waitForServerReady function checks ERROR status', () => {
    it('should check for ModelStatus.ERROR in the polling loop', () => {
      // The _waitForServerReady function should check for ERROR status
      // This ensures fast detection of crashes during startup
      expect(sourceCode).toContain('processEntry.status === ModelStatus.ERROR');

      // Find the _waitForServerReady function
      const waitForReadyMatch = sourceCode.match(/async _waitForServerReady\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(waitForReadyMatch).toBeTruthy();

      const functionBody = waitForReadyMatch[0];

      // Should check for ERROR status
      expect(functionBody).toContain('processEntry.status === ModelStatus.ERROR');

      // Should reject with a descriptive error when status is ERROR
      expect(functionBody).toMatch(/reject\(new Error\([^)]*\)\)/);
    });

    it('should provide detailed error information when status is ERROR', () => {
      // When processEntry.status is ERROR, the function should include
      // details about the signal or exit code
      const waitForReadyMatch = sourceCode.match(/async _waitForServerReady\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(waitForReadyMatch).toBeTruthy();

      const functionBody = waitForReadyMatch[0];

      // Should check for signal and provide appropriate error message
      expect(functionBody).toContain('processEntry.signal');
      expect(functionBody).toContain('Process crashed');
    });

    it('should check ERROR status before checking timeout', () => {
      // The order matters: check ERROR status before timeout
      // This ensures crashes are detected immediately, not after timeout
      const waitForReadyMatch = sourceCode.match(/async _waitForServerReady\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(waitForReadyMatch).toBeTruthy();

      const functionBody = waitForReadyMatch[0];
      const lines = functionBody.split('\n');

      let errorStatusLine = -1;
      let timeoutLine = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('processEntry.status === ModelStatus.ERROR')) {
          errorStatusLine = i;
        }
        if (lines[i].includes('elapsed >= timeout')) {
          timeoutLine = i;
        }
      }

      expect(errorStatusLine).toBeGreaterThan(-1);
      expect(timeoutLine).toBeGreaterThan(-1);
      expect(errorStatusLine).toBeLessThan(timeoutLine);
    });
  });

  describe('Process exit handler sets ERROR status', () => {
    it('should set status to ERROR when process exits with non-zero code', () => {
      // _handleProcessExit should set status to ERROR for non-zero exit codes
      const handleExitMatch = sourceCode.match(/_handleProcessExit\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(handleExitMatch).toBeTruthy();

      const functionBody = handleExitMatch[0];

      // Should check exit code
      expect(functionBody).toContain('exitCode');
      expect(functionBody).toContain('ModelStatus.ERROR');
    });

    it('should set status to ERROR when process exits with signal', () => {
      // Any process exit with signal (SIGTERM, SIGSEGV, etc.) should set ERROR status
      const handleExitMatch = sourceCode.match(/_handleProcessExit\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(handleExitMatch).toBeTruthy();

      const functionBody = handleExitMatch[0];

      // Should check signal parameter
      expect(functionBody).toContain('signal');

      // Should set newStatus based on exit code (code === 0 ? STOPPED : ERROR)
      expect(functionBody).toMatch(/newStatus\s*=\s*code\s*===\s*0\s*\?\s*ModelStatus\.STOPPED\s*:\s*ModelStatus\.ERROR/);
    });

    it('should update processEntry.status when process exits', () => {
      // _handleProcessExit should update the processEntry status
      const handleExitMatch = sourceCode.match(/_handleProcessExit\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(handleExitMatch).toBeTruthy();

      const functionBody = handleExitMatch[0];

      // Should update processEntry.exitCode
      expect(functionBody).toContain('processEntry.exitCode = code');
      expect(functionBody).toContain('processEntry.signal = signal');
      expect(functionBody).toContain('processEntry.status = newStatus');
    });
  });

  describe('Queue processor handles model crashes', () => {
    let queueProcessorSource;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      queueProcessorSource = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should have handleModelProcessExit callback function', () => {
      expect(queueProcessorSource).toContain('handleModelProcessExit');
      expect(queueProcessorSource).toContain('function handleModelProcessExit');
    });

    it('should reset isProcessing state when model crashes', () => {
      // When model crashes, the queue should be able to continue processing
      // The isProcessing flag is now reset in the finally block, NOT in the callback
      // This prevents race conditions where a new job starts before cleanup completes

      // Check that handleModelProcessExit sets currentJob to null to signal cleanup done
      const handleExitMatch = queueProcessorSource.match(/function handleModelProcessExit\([^)]*\) \{[\s\S]*?\n\}/);
      expect(handleExitMatch).toBeTruthy();

      const functionBody = handleExitMatch[0];

      // Should set currentJob to null to signal that cleanup has been handled
      expect(functionBody).toContain('currentJob = null');

      // Check that the queueProcessor has a finally block that resets isProcessing
      // The finally block ensures cleanup happens even on errors
      expect(queueProcessorSource).toContain('} finally {');
      expect(queueProcessorSource).toContain('isProcessing = false');

      // Verify isProcessing = false comes after the finally block
      const lines = queueProcessorSource.split('\n');
      let foundFinally = false;
      let foundIsProcessingReset = false;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('} finally {')) {
          foundFinally = true;
          // Look for isProcessing = false in the next 10 lines
          for (let j = i + 1; j < i + 11 && j < lines.length; j++) {
            if (lines[j].includes('isProcessing = false')) {
              foundIsProcessingReset = true;
              break;
            }
          }
          break;
        }
      }

      expect(foundFinally).toBe(true);
      expect(foundIsProcessingReset).toBe(true);
    });

    it('should fail the current generation when model crashes', () => {
      const handleExitMatch = queueProcessorSource.match(/function handleModelProcessExit\([^)]*\) \{[\s\S]*?\n\}/);
      expect(handleExitMatch).toBeTruthy();

      const functionBody = handleExitMatch[0];

      // Should update generation status to FAILED
      expect(functionBody).toContain('GenerationStatus.FAILED');
      expect(functionBody).toContain('updateGenerationStatus');

      // Should broadcast the failure
      expect(functionBody).toContain('job_failed');
    });

    it('should register callbacks with modelManager', () => {
      // The queue processor should register its callbacks with modelManager
      expect(queueProcessorSource).toContain('modelManager.onProcessExit = handleModelProcessExit');
      expect(queueProcessorSource).toContain('modelManager.onProcessError = handleModelProcessError');
    });
  });

  describe('Integration - startup crash detection flow', () => {
    it('should detect crash within one polling interval (500ms)', () => {
      // When a process crashes during startup, _waitForServerReady polls
      // every 500ms. The ERROR status check should catch the crash within
      // one polling cycle.

      const waitForReadyMatch = sourceCode.match(/async _waitForServerReady\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(waitForReadyMatch).toBeTruthy();

      const functionBody = waitForReadyMatch[0];

      // Should have a checkInterval variable set to 500ms
      expect(functionBody).toContain('checkInterval');
      expect(functionBody).toContain('500');

      // Should use setTimeout to schedule the next check
      expect(functionBody).toContain('setTimeout(checkReady, checkInterval)');
    });

    it('should not wait for full timeout when process crashes', () => {
      // The fix ensures that when processEntry.status === ERROR,
      // the function rejects immediately without waiting for timeout

      const waitForReadyMatch = sourceCode.match(/async _waitForServerReady\([^)]*\) \{[\s\S]*?\n  \}/);
      expect(waitForReadyMatch).toBeTruthy();

      const functionBody = waitForReadyMatch[0];

      // Extract the checkReady function body
      const checkReadyMatch = functionBody.match(/const checkReady = \(\) => \{[\s\S]*?checkReady\(\);/);
      expect(checkReadyMatch).toBeTruthy();

      const checkReadyBody = checkReadyMatch[0];
      const lines = checkReadyBody.split('\n');

      // Find the ERROR status check and timeout check
      let errorStatusIndex = -1;
      let timeoutIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('processEntry.status === ModelStatus.ERROR')) {
          errorStatusIndex = i;
        }
        if (lines[i].includes('elapsed >= timeout')) {
          timeoutIndex = i;
        }
      }

      expect(errorStatusIndex).toBeGreaterThan(-1);
      expect(timeoutIndex).toBeGreaterThan(-1);

      // ERROR status check should come before timeout check
      expect(errorStatusIndex).toBeLessThan(timeoutIndex);

      // Both should reject the promise
      let rejectCount = 0;
      for (let i = errorStatusIndex; i <= timeoutIndex; i++) {
        if (lines[i].includes('reject(')) {
          rejectCount++;
        }
      }

      // Should have at least 2 reject calls (one for ERROR, one for timeout)
      expect(rejectCount).toBeGreaterThanOrEqual(2);
    });
  });
});
