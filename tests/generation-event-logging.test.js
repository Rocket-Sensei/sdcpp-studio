/**
 * Tests for Generation Event Logging
 *
 * Tests the generation event logging functionality:
 * - Generation start event contains all required fields
 * - Generation end event contains timing and memory settings
 * - Logs are properly formatted for console output
 * - Logs are skipped when in terminal UI mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Generation Event Logging', () => {
  let consoleLogSpy;
  let originalArgv;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleLogSpy.mockRestore();
  });

  describe('logGenerationStart', () => {
    it('should output generation start event with all required fields', async () => {
      const { logGenerationStart } = await import('../backend/utils/logger.js');

      logGenerationStart({
        modelName: 'Flux.1 Dev',
        prompt: 'a beautiful sunset over the ocean',
        size: '1024x1024',
        seed: 12345,
        sampling_method: 'euler',
        sample_steps: 20,
        cfg_scale: 7.5,
        type: 'generate',
        referenceImages: [],
        upscaleEnabled: false,
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(2);

      const firstLine = consoleLogSpy.mock.calls[0][0];
      expect(firstLine).toContain('[GEN-START]');
      expect(firstLine).toContain('Flux.1 Dev');
      expect(firstLine).toContain('1024x1024');
      expect(firstLine).toContain('seed:12345');
      expect(firstLine).toContain('euler');
      expect(firstLine).toContain('steps:20');
      expect(firstLine).toContain('cfg:7.5');

      const secondLine = consoleLogSpy.mock.calls[1][0];
      expect(secondLine).toContain('prompt:');
      expect(secondLine).toContain('a beautiful sunset over the ocean');
    });

    it('should include reference images for img2img/edit jobs', async () => {
      const { logGenerationStart } = await import('../backend/utils/logger.js');

      logGenerationStart({
        modelName: 'Test Model',
        prompt: 'add sunglasses to the cat',
        size: '512x512',
        seed: 98765,
        sampling_method: 'euler',
        sample_steps: 15,
        cfg_scale: 6.0,
        type: 'edit',
        referenceImages: ['/path/to/input.png', '/path/to/mask.png'],
        upscaleEnabled: false,
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const firstLine = consoleLogSpy.mock.calls[0][0];
      expect(firstLine).toContain('ref-images:2');
      expect(firstLine).toContain('input.png');
      expect(firstLine).toContain('mask.png');
    });

    it('should include upscale info when enabled', async () => {
      const { logGenerationStart } = await import('../backend/utils/logger.js');

      logGenerationStart({
        modelName: 'Upscaler',
        prompt: 'Image upscale',
        size: '2048x2048',
        seed: null,
        sampling_method: 'N/A',
        sample_steps: null,
        cfg_scale: null,
        type: 'upscale',
        referenceImages: ['/path/to/image.png'],
        upscaleEnabled: true,
        upscaleKind: 'RealESRGAN 4x+',
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const firstLine = consoleLogSpy.mock.calls[0][0];
      expect(firstLine).toContain('upscale:RealESRGAN 4x+');
    });

    it('should handle null/undefined values gracefully', async () => {
      const { logGenerationStart } = await import('../backend/utils/logger.js');

      logGenerationStart({
        modelName: 'Test Model',
        prompt: 'test prompt',
        size: '1024x1024',
        seed: null,
        sampling_method: null,
        sample_steps: undefined,
        cfg_scale: undefined,
        type: 'generate',
        referenceImages: [],
        upscaleEnabled: false,
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const firstLine = consoleLogSpy.mock.calls[0][0];
      expect(firstLine).toContain('[GEN-START]');
      expect(firstLine).toContain('seed:');
    });

    it('should not output when terminal UI mode is active', async () => {
      process.argv = ['node', 'server.js', '--terminal-ui'];
      
      const { logGenerationStart } = await import('../backend/utils/logger.js');

      logGenerationStart({
        modelName: 'Test Model',
        prompt: 'test prompt',
        size: '1024x1024',
        seed: 12345,
        sampling_method: 'euler',
        sample_steps: 20,
        cfg_scale: 7.0,
        type: 'generate',
        referenceImages: [],
        upscaleEnabled: false,
      });

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('logGenerationEnd', () => {
    it('should output generation end event with timing', async () => {
      const { logGenerationEnd } = await import('../backend/utils/logger.js');

      logGenerationEnd({
        modelLoadTimeMs: 12500,
        generationTimeMs: 8500,
        memoryFlags: {},
      });

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[GEN-END]');
      expect(output).toContain('model-load:12.5s');
      expect(output).toContain('gen:8.5s');
    });

    it('should output generation end event with memory flags', async () => {
      const { logGenerationEnd } = await import('../backend/utils/logger.js');

      logGenerationEnd({
        modelLoadTimeMs: 10000,
        generationTimeMs: 5000,
        memoryFlags: {
          vae_on_cpu: true,
          offload_to_cpu: true,
          diffusion_fa: true,
        },
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('vae-on-cpu');
      expect(output).toContain('offload-to-cpu');
      expect(output).toContain('diffusion-fa');
    });

    it('should show "none" when no memory flags are active', async () => {
      const { logGenerationEnd } = await import('../backend/utils/logger.js');

      logGenerationEnd({
        modelLoadTimeMs: 10000,
        generationTimeMs: 5000,
        memoryFlags: {
          vae_on_cpu: false,
          offload_to_cpu: false,
          diffusion_fa: false,
        },
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('mem:none');
    });

    it('should handle empty memory flags object', async () => {
      const { logGenerationEnd } = await import('../backend/utils/logger.js');

      logGenerationEnd({
        modelLoadTimeMs: 10000,
        generationTimeMs: 5000,
        memoryFlags: {},
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('[GEN-END]');
      expect(output).toContain('mem:');
    });

    it('should not output when terminal UI mode is active', async () => {
      process.argv = ['node', 'server.js', '--terminal-ui'];
      
      const { logGenerationEnd } = await import('../backend/utils/logger.js');

      logGenerationEnd({
        modelLoadTimeMs: 10000,
        generationTimeMs: 5000,
        memoryFlags: { vae_on_cpu: true },
      });

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should format zero model load time correctly', async () => {
      const { logGenerationEnd } = await import('../backend/utils/logger.js');

      logGenerationEnd({
        modelLoadTimeMs: 0,
        generationTimeMs: 5000,
        memoryFlags: {},
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(output).toContain('model-load:0.0s');
    });
  });

  describe('isTerminalUIMode', () => {
    it('should return true when --terminal-ui flag is present', async () => {
      process.argv = ['node', 'server.js', '--terminal-ui'];
      
      const { isTerminalUIMode } = await import('../backend/utils/logger.js');
      
      expect(isTerminalUIMode()).toBe(true);
    });

    it('should return false when --terminal-ui flag is not present', async () => {
      process.argv = ['node', 'server.js'];
      
      const { isTerminalUIMode } = await import('../backend/utils/logger.js');
      
      expect(isTerminalUIMode()).toBe(false);
    });

    it('should return false with other flags present', async () => {
      process.argv = ['node', 'server.js', '--other-flag'];
      
      const { isTerminalUIMode } = await import('../backend/utils/logger.js');
      
      expect(isTerminalUIMode()).toBe(false);
    });
  });
});
