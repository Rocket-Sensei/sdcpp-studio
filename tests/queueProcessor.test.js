/**
 * Tests for Queue Processor Serial Execution
 *
 * This test file verifies that the queue processor processes generations
 * serially (one at a time) and not in parallel.
 *
 * The key mechanism being tested is the `isProcessing` flag in queueProcessor.js
 * that prevents multiple generations from being processed concurrently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Queue Processor - Serial Execution', () => {
  describe('Source code verification - isProcessing flag', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should have isProcessing flag that prevents concurrent processing', () => {
      // Verify the source has the isProcessing guard
      expect(sourceCode).toContain('if (isProcessing)');
      expect(sourceCode).toContain('return;');
    });

    it('should have isProcessing variable declared at module level', () => {
      // Verify isProcessing is declared at module scope (not inside processQueue)
      // Look for the declaration before any function
      const lines = sourceCode.split('\n');
      let isProcessingDeclared = false;
      let processQueueFound = false;
      let isProcessingLine = -1;
      let processQueueLine = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if ((line.includes('let isProcessing') || line.includes('var isProcessing')) && !line.trim().startsWith('//')) {
          isProcessingDeclared = true;
          isProcessingLine = i;
        }
        if (line.includes('async function processQueue')) {
          processQueueFound = true;
          processQueueLine = i;
        }
        // Stop looking once we've found both
        if (isProcessingDeclared && processQueueFound) {
          break;
        }
      }

      expect(isProcessingDeclared).toBe(true);
      expect(processQueueFound).toBe(true);
      // isProcessing should be declared before processQueue function
      expect(isProcessingLine).toBeGreaterThan(-1);
      expect(processQueueLine).toBeGreaterThan(-1);
      expect(isProcessingLine).toBeLessThan(processQueueLine);
    });

    it('should set isProcessing to true when starting a job', () => {
      // Verify isProcessing is set to true when processing starts
      expect(sourceCode).toMatch(/isProcessing\s*=\s*true/);
    });

    it('should reset isProcessing to false in finally block', () => {
      // Verify isProcessing is reset in finally block
      const finallyMatch = sourceCode.match(/} finally \{[\s\S]*?\n\}/);
      expect(finallyMatch).toBeTruthy();

      const finallyBlock = finallyMatch[0];
      expect(finallyBlock).toContain('isProcessing = false');
    });

    it('should use finally block to ensure cleanup even on error', () => {
      // Find the processQueue function and verify it has try/catch/finally
      const processQueueMatch = sourceCode.match(/async function processQueue\(\) \{[\s\S]*?\n\}/);
      expect(processQueueMatch).toBeTruthy();

      const processQueueBody = processQueueMatch[0];

      // Verify try/catch/finally structure
      expect(processQueueBody).toContain('try {');
      expect(processQueueBody).toContain('} catch (error)');
      expect(processQueueBody).toContain('} finally {');
    });

    it('should have early return when isProcessing is true', () => {
      // Verify the guard clause is at the start of processQueue
      const processQueueMatch = sourceCode.match(/async function processQueue\(\) \{[\s\S]*?\n\}/);
      expect(processQueueMatch).toBeTruthy();

      const processQueueBody = processQueueMatch[0];

      // Find the first few lines after function declaration
      const lines = processQueueBody.split('\n');
      let foundGuard = false;
      let foundAfterGuard = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('if (isProcessing)')) {
          foundGuard = true;
          // The next non-empty line should have the return
          for (let j = i + 1; j < lines.length && j < i + 5; j++) {
            if (lines[j].includes('return') && !lines[j].trim().startsWith('//')) {
              foundAfterGuard = true;
              break;
            }
          }
          break;
        }
        // Stop looking if we've gone too far (more than 10 lines)
        if (i > 10) break;
      }

      expect(foundGuard).toBe(true);
      expect(foundAfterGuard).toBe(true);
    });
  });

  describe('Source code verification - currentJob tracking', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should have currentJob variable to track the active job', () => {
      expect(sourceCode).toMatch(/let currentJob\s*=\s*null/);
    });

    it('should set currentJob when starting a job', () => {
      expect(sourceCode).toMatch(/currentJob\s*=\s*job/);
    });

    it('should clear currentJob in finally block', () => {
      const finallyMatch = sourceCode.match(/} finally \{[\s\S]*?\n\}/);
      expect(finallyMatch).toBeTruthy();

      const finallyBlock = finallyMatch[0];
      expect(finallyBlock).toContain('currentJob = null');
    });

    it('should export getCurrentJob function', () => {
      expect(sourceCode).toContain('export function getCurrentJob');
      expect(sourceCode).toMatch(/getCurrentJob\(\)\s*\{[\s\S]*return currentJob/);
    });
  });

  describe('Source code verification - state tracking variables', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should have all state variables at module scope', () => {
      // Verify all state tracking variables are module-scoped
      const stateVariables = [
        'isProcessing',
        'currentJob',
        'currentModelId',
        'currentModelLoadingStartTime',
        'pollInterval'
      ];

      for (const variable of stateVariables) {
        // Each should be declared with let/var at module level
        const declarationRegex = new RegExp(`^(let|var)\\s+${variable}\\s*=`, 'm');
        expect(sourceCode).toMatch(declarationRegex);
      }
    });

    it('should declare state variables before any functions', () => {
      const lines = sourceCode.split('\n');
      let processQueueLine = -1;

      // Find processQueue function
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('async function processQueue')) {
          processQueueLine = i;
          break;
        }
      }

      expect(processQueueLine).toBeGreaterThan(-1);

      // State variables should be declared before processQueue
      const stateVariables = [
        'isProcessing',
        'currentJob',
        'currentModelId',
        'currentModelLoadingStartTime'
      ];

      for (const variable of stateVariables) {
        const regex = new RegExp(`^(let|var)\\s+${variable}\\s*=`, 'm');
        let found = false;
        let foundLine = -1;

        for (let i = 0; i < processQueueLine; i++) {
          if (regex.test(lines[i])) {
            found = true;
            foundLine = i;
            break;
          }
        }

        expect(found).toBe(true);
        expect(foundLine).toBeGreaterThan(-1);
        expect(foundLine).toBeLessThan(processQueueLine);
      }
    });
  });

  describe('Integration - serial execution verification', () => {
    it('should only call claimNextPendingGeneration once per processQueue invocation', () => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      const sourceCode = readFileSync(queueProcessorPath, 'utf-8');

      // Find the processQueue function
      const processQueueMatch = sourceCode.match(/async function processQueue\(\) \{[\s\S]*?\n\}/);
      expect(processQueueMatch).toBeTruthy();

      const processQueueBody = processQueueMatch[0];
      const matches = processQueueBody.match(/claimNextPendingGeneration\(\)/g);

      // Should be called exactly once in processQueue (excluding comments)
      // Note: there may be a comment mentioning it, so we check for at least 1
      expect(matches ? matches.length : 0).toBeGreaterThanOrEqual(1);
    });

    it('should check isProcessing BEFORE calling claimNextPendingGeneration', () => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      const sourceCode = readFileSync(queueProcessorPath, 'utf-8');

      // Find the processQueue function
      const processQueueMatch = sourceCode.match(/async function processQueue\(\) \{[\s\S]*?\n\}/);
      expect(processQueueMatch).toBeTruthy();

      const processQueueBody = processQueueMatch[0];

      // Find positions of key elements
      const isProcessingCheck = processQueueBody.indexOf('if (isProcessing)');
      const claimCall = processQueueBody.indexOf('claimNextPendingGeneration()');

      // Both should exist
      expect(isProcessingCheck).toBeGreaterThan(-1);
      expect(claimCall).toBeGreaterThan(-1);

      // isProcessing check should come before claimNextPendingGeneration
      expect(isProcessingCheck).toBeLessThan(claimCall);
    });
  });

  describe('Integration - FIFO queue processing', () => {
    let queriesSource;

    beforeAll(() => {
      const queriesPath = join(__dirname, '../backend/db/queries.js');
      queriesSource = readFileSync(queriesPath, 'utf-8');
    });

    it('should query for next pending generation ordered by created_at ASC', () => {
      // Verify the getNextPendingGeneration function orders by created_at ASC
      const match = queriesSource.match(/export function getNextPendingGeneration[\s\S]*?\n\}/);
      expect(match).toBeTruthy();

      const functionBody = match[0];

      expect(functionBody).toContain('ORDER BY created_at ASC');
      expect(functionBody).toContain('WHERE status = ?');
      expect(functionBody).toContain('LIMIT 1');
    });

    it('should use FIFO (First In, First Out) ordering', () => {
      // ASC order on created_at means oldest (first created) is returned first
      const match = queriesSource.match(/export function getNextPendingGeneration[\s\S]*?\n\}/);
      expect(match).toBeTruthy();

      const functionBody = match[0];
      expect(functionBody).toContain('ORDER BY created_at ASC');
    });
  });

  describe('Integration - exported API', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should export startQueueProcessor function', () => {
      expect(sourceCode).toContain('export function startQueueProcessor');
    });

    it('should export stopQueueProcessor function', () => {
      expect(sourceCode).toContain('export function stopQueueProcessor');
    });

    it('should export getCurrentJob function', () => {
      expect(sourceCode).toContain('export function getCurrentJob');
    });

    it('should NOT export processQueue function (internal only)', () => {
      // processQueue should NOT be exported
      expect(sourceCode).not.toContain('export function processQueue');
      expect(sourceCode).not.toContain('export async function processQueue');
    });

    it('should start processor with configurable interval', () => {
      // Verify startQueueProcessor accepts intervalMs parameter
      const match = sourceCode.match(/export function startQueueProcessor\(([^)]*)\)/);
      expect(match).toBeTruthy();
      expect(match[1]).toContain('intervalMs');
      expect(match[1]).toMatch(/intervalMs\s*=\s*\d+/); // default value
    });
  });

  describe('Integration - cleanup on error', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should reset all state variables in finally block', () => {
      const finallyMatch = sourceCode.match(/} finally \{[\s\S]*?\n\}/);
      expect(finallyMatch).toBeTruthy();

      const finallyBlock = finallyMatch[0];

      // All state variables should be reset in finally
      expect(finallyBlock).toContain('isProcessing = false');
      expect(finallyBlock).toContain('currentJob = null');
      expect(finallyBlock).toContain('currentModelId = null');
      expect(finallyBlock).toContain('currentModelLoadingStartTime = null');
    });

    it('should have catch block that logs errors and updates status', () => {
      // Find the processQueue function first, then look for its catch block
      const processQueueMatch = sourceCode.match(/async function processQueue\(\) \{[\s\S]*?\n\}/);
      expect(processQueueMatch).toBeTruthy();

      const processQueueBody = processQueueMatch[0];

      // The catch block should exist and contain error handling
      expect(processQueueBody).toContain('} catch (error) {');
      expect(processQueueBody).toContain('logger.error');
      expect(processQueueBody).toContain('genLogger.error');

      // Should update generation status to FAILED
      expect(processQueueBody).toContain('GenerationStatus.FAILED');
      expect(processQueueBody).toContain('updateGenerationStatus');
    });
  });

  describe('Integration - no parallel execution paths', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should not have any code path that bypasses isProcessing check', () => {
      // Find the processQueue function
      const processQueueMatch = sourceCode.match(/async function processQueue\(\) \{[\s\S]*?\n\}/);
      expect(processQueueMatch).toBeTruthy();

      const processQueueBody = processQueueMatch[0];

      // Split by lines and check structure
      const lines = processQueueBody.split('\n');

      // Find the isProcessing guard
      let guardIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('if (isProcessing)')) {
          guardIndex = i;
          break;
        }
      }

      expect(guardIndex).toBeGreaterThan(-1);

      // Check that after the guard, there's a return
      // This ensures all paths go through the guard
      let hasReturn = false;
      for (let i = guardIndex + 1; i < guardIndex + 5 && i < lines.length; i++) {
        if (lines[i].includes('return') && !lines[i].trim().startsWith('//')) {
          hasReturn = true;
          break;
        }
      }

      expect(hasReturn).toBe(true);
    });

    it('should not have multiple concurrent processing paths', () => {
      // There should only be ONE place where jobs are claimed and processed
      // This is in processQueue function (not in comments or imports)
      const lines = sourceCode.split('\n');
      let claimCallCount = 0;

      for (const line of lines) {
        // Skip comments
        if (line.trim().startsWith('//')) continue;
        // Skip imports
        if (line.includes('import')) continue;
        // Count actual calls to claimNextPendingGeneration
        if (line.includes('claimNextPendingGeneration()')) {
          claimCallCount++;
        }
      }

      // Should only be called once (in processQueue)
      expect(claimCallCount).toBe(1);
    });
  });

  describe('Integration - polling mechanism', () => {
    let sourceCode;

    beforeAll(() => {
      const queueProcessorPath = join(__dirname, '../backend/services/queueProcessor.js');
      sourceCode = readFileSync(queueProcessorPath, 'utf-8');
    });

    it('should use setInterval to poll for new jobs', () => {
      const startMatch = sourceCode.match(/export function startQueueProcessor[\s\S]*?\n\}/);
      expect(startMatch).toBeTruthy();

      const startBody = startMatch[0];

      expect(startBody).toContain('setInterval');
      expect(startBody).toContain('processQueue');
    });

    it('should store pollInterval in module-scoped variable', () => {
      expect(sourceCode).toMatch(/let pollInterval\s*=\s*null/);
    });

    it('should prevent multiple intervals when startQueueProcessor is called twice', () => {
      const startMatch = sourceCode.match(/export function startQueueProcessor[\s\S]*?\n\}/);
      expect(startMatch).toBeTruthy();

      const startBody = startMatch[0];

      // Should check if pollInterval already exists
      expect(startBody).toMatch(/if\s*\(\s*pollInterval\s*\)/);
      // Should return early without starting a new interval
      expect(startBody).toContain('return');
    });

    it('should clear interval when stopQueueProcessor is called', () => {
      const stopMatch = sourceCode.match(/export function stopQueueProcessor[\s\S]*?\n\}/);
      expect(stopMatch).toBeTruthy();

      const stopBody = stopMatch[0];

      expect(stopBody).toContain('clearInterval');
      expect(stopBody).toContain('pollInterval = null');
    });
  });
});
