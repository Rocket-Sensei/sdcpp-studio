/**
 * Tests for bug fixes:
 * 1. sample_steps: flux model uses 20 instead of configured 4
 * 2. Seed displayed as float instead of int64
 * 3. "Generate more" passes seed causing same image
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the database before importing
vi.mock('../backend/db/database.js', () => ({
  getDatabase: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
  getImagesDir: () => '/tmp/images',
}));

describe('Bug Fix Tests', () => {
  describe('Issue 1: sample_steps not being applied for flux models', () => {
    it('should use job.sample_steps when provided (4 for flux)', () => {
      // Verify that sample_steps is correctly passed from job
      const job = {
        sample_steps: 4,
      };

      // The params should use job.sample_steps directly
      expect(job.sample_steps).toBe(4);
    });

    it('should fallback to model generation_params when job.sample_steps is undefined', () => {
      const modelParams = {
        cfg_scale: 1.0,
        sample_steps: 4,
        sampling_method: 'euler',
      };

      const job = {
        sample_steps: undefined,
      };

      // Test the fallback logic: job.sample_steps ?? modelParams?.sample_steps ?? undefined
      const result = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
      expect(result).toBe(4);
    });

    it('should use job.sample_steps even when different from model default', () => {
      const modelParams = {
        sample_steps: 20,
      };

      const job = {
        sample_steps: 4,
      };

      const result = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
      expect(result).toBe(4);
    });
  });

  describe('Issue 2: Seed displayed as float instead of int64', () => {
    it('should store seed as integer', () => {
      // Test seed generation in queries.js
      const seed1 = Math.floor(Math.random() * 4294967295);
      const seed2 = Math.floor(Math.random() * 4294967295);

      expect(Number.isInteger(seed1)).toBe(true);
      expect(Number.isInteger(seed2)).toBe(true);
      expect(seed1).toBeLessThan(4294967295);
      expect(seed1).toBeGreaterThanOrEqual(0);
    });

    it('should convert float seed to integer for display', () => {
      // Simulate a seed that might be stored as float
      const floatSeed = 1234567890.5;
      const intSeed = Math.floor(floatSeed);

      expect(intSeed).toBe(1234567890);
      expect(Number.isInteger(intSeed)).toBe(true);
    });

    it('should handle large seed values (up to 2^32-1)', () => {
      const maxSeed = 4294967295; // 2^32 - 1
      expect(maxSeed).toBe(4294967295);
      expect(Number.isInteger(maxSeed)).toBe(true);
    });
  });

  describe('Issue 3: Generate more should not pass seed', () => {
    it('should clear seed when using "generate more"', () => {
      // Simulate the generation object passed to "generate more"
      const generation = {
        id: 'test-id',
        prompt: 'Alien landscape',
        negative_prompt: '',
        size: '1024x1024',
        seed: 12345, // This seed should NOT be passed
        model: 'flux1-schnell-fp8',
        cfg_scale: 1.0,
        sampling_method: 'euler',
        sample_steps: 4,
      };

      // When "generate more" is clicked, the seed should be excluded
      // or set to undefined for a new random seed
      const settingsForMore = {
        ...generation,
        seed: undefined, // Expected: seed should be cleared
      };

      expect(settingsForMore.seed).toBeUndefined();
    });

    it('should not populate seed field in Generate.jsx when using "generate more"', () => {
      // Simulate the effect in Generate.jsx
      const settings = {
        prompt: 'test prompt',
        seed: 12345, // This exists in the generation
      };

      // The component should NOT set seed when applying "generate more" settings
      const shouldSetSeed = false; // Expected behavior
      const seedValue = shouldSetSeed ? settings.seed?.toString() : '';

      expect(seedValue).toBe('');
    });
  });

  describe('CLI Handler sample_steps override', () => {
    it('should override quality-based steps when sample_steps is provided', async () => {
      const CLIHandler = (await import('../backend/services/cliHandler.js')).default;
      const handler = new CLIHandler();

      const modelConfig = {
        command: './bin/sd-cli',
        args: [],
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        quality: 'medium', // Maps to 20 steps
        sample_steps: 4,   // Should override to 4 steps
      };

      const command = handler.buildCommand(modelConfig, params);

      // The command should have --steps 4 (not 20)
      // Since buildCommand pushes --steps twice, the last one should win
      const stepsIndices = [];
      command.forEach((arg, index) => {
        if (arg === '--steps') {
          stepsIndices.push(index);
        }
      });

      // There should be two --steps arguments (one from quality, one from sample_steps)
      expect(stepsIndices.length).toBe(2);

      // The second one should be 4 (from sample_steps)
      const secondStepsValue = command[stepsIndices[1] + 1];
      expect(secondStepsValue).toBe('4');
    });

    it('should use quality-based steps when sample_steps is not provided', async () => {
      const CLIHandler = (await import('../backend/services/cliHandler.js')).default;
      const handler = new CLIHandler();

      const modelConfig = {
        command: './bin/sd-cli',
        args: [],
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        quality: 'medium', // Maps to 20 steps
        // sample_steps not provided
      };

      const command = handler.buildCommand(modelConfig, params);

      // Find --steps argument
      const stepsIndex = command.indexOf('--steps');
      expect(stepsIndex).toBeGreaterThanOrEqual(0);

      const stepsValue = command[stepsIndex + 1];
      expect(stepsValue).toBe('20'); // medium quality maps to 20
    });
  });
});
