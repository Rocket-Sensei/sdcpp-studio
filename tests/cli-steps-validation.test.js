/**
 * CLI Steps Parameter Validation Tests
 *
 * Tests that verify the steps value is correctly passed through to the CLI command.
 * This validates the flow from params through buildCommand.
 *
 * Key scenarios tested:
 * 1. User-provided sample_steps in job params takes precedence
 * 2. Model generation_params.sample_steps is used as fallback
 * 3. No --steps is added when neither is provided (CLI default)
 * 4. Server mode --steps in model args is NOT used for CLI mode
 * 5. Memory flags are correctly merged without duplicating --steps
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import CLIHandler class directly - buildCommand is a method on the class
// We test buildCommand which doesn't require spawning an actual process
let CLIHandler;
let cliHandlerInstance;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  
  // Import fresh instance of CLIHandler
  const module = await import('../backend/services/cliHandler.js');
  CLIHandler = module.default;
  cliHandlerInstance = new CLIHandler();
});

describe('CLI Steps Parameter Validation', () => {
  describe('buildCommand with steps parameter', () => {
    it('should use user-provided sample_steps over model default', () => {
      const modelConfig = {
        id: 'test-model',
        command: './bin/sd-cli',
        args: [
          '--diffusion-model', './models/test.gguf',
          '--vae', './models/vae.safetensors'
        ]
      };

      const params = {
        prompt: 'a beautiful landscape',
        negative_prompt: 'blurry, low quality',
        size: '1024x1024',
        seed: 12345,
        n: 1,
        sample_steps: 9,  // User explicitly set 9 steps
        cfg_scale: 7.0,
        sampling_method: 'euler'
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Verify --steps is present with correct value
      const stepsIndex = command.indexOf('--steps');
      expect(stepsIndex).toBeGreaterThanOrEqual(0);
      expect(command[stepsIndex + 1]).toBe('9');

      // Verify only one --steps
      const stepsCount = command.filter(arg => arg === '--steps').length;
      expect(stepsCount).toBe(1);
    });

    it('should use quality-based steps when sample_steps not provided', () => {
      const modelConfig = {
        id: 'test-model',
        command: './bin/sd-cli',
        args: []
      };

      const params = {
        prompt: 'a beautiful landscape',
        size: '1024x1024',
        quality: 'medium',  // Maps to 20 steps
        cfg_scale: 7.0,
        sampling_method: 'euler'
        // NO sample_steps
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      const stepsIndex = command.indexOf('--steps');
      expect(stepsIndex).toBeGreaterThanOrEqual(0);
      expect(command[stepsIndex + 1]).toBe('20');
    });

    it('should NOT add --steps when neither sample_steps nor quality provided', () => {
      const modelConfig = {
        id: 'test-model',
        command: './bin/sd-cli',
        args: []
      };

      const params = {
        prompt: 'a beautiful landscape',
        size: '1024x1024',
        cfg_scale: 7.0,
        sampling_method: 'euler'
        // NO sample_steps, NO quality
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Should have NO --steps
      const stepsCount = command.filter(arg => arg === '--steps').length;
      expect(stepsCount).toBe(0);
    });

    it('should skip --steps from model config args (CLI mode uses params)', () => {
      // This is critical: CLI mode should NOT use --steps from model config args
      // because buildCommand filters those out (lines 209-213 in cliHandler.js)
      const modelConfig = {
        id: 'test-model',
        command: './bin/sd-cli',
        args: [
          '--diffusion-model', './models/test.gguf',
          '--steps', '999',  // This should be SKIPPED for CLI mode
          '--vae', './models/vae.safetensors'
        ]
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        sample_steps: 25,  // This should be used instead
        cfg_scale: 1.0,
        sampling_method: 'euler'
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Should use 25 from params, NOT 999 from model args
      const stepsIndex = command.indexOf('--steps');
      expect(stepsIndex).toBeGreaterThanOrEqual(0);
      expect(command[stepsIndex + 1]).toBe('25');

      // Make sure 999 is NOT in the command
      expect(command).not.toContain('999');
    });

    it('should replace sd-server with sd-cli in command', () => {
      const modelConfig = {
        id: 'test-model',
        command: './bin/sd-server',  // Server command
        args: ['--diffusion-model', './models/test.gguf']
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        sample_steps: 15,
        cfg_scale: 7.0,
        sampling_method: 'euler'
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Should replace sd-server with sd-cli
      expect(command[0]).toBe('./bin/sd-cli');
      // Should NOT contain sd-server
      expect(command.join(' ')).not.toContain('sd-server');
    });
  });

  describe('Integration: queueProcessor params -> CLI command', () => {
    it('should correctly map job.sample_steps -> CLI command --steps', () => {
      // This test simulates the flow from queueProcessor.processGenerateJob
      // where params.sample_steps is set from job.sample_steps ?? modelParams?.sample_steps

      // Scenario 1: User provides sample_steps
      const job1 = { sample_steps: 15 };
      const modelParams1 = { sample_steps: 9 };
      const actualSteps1 = job1.sample_steps ?? modelParams1?.sample_steps ?? undefined;
      expect(actualSteps1).toBe(15);

      // Scenario 2: User does NOT provide, use model default
      const job2 = { sample_steps: undefined };
      const modelParams2 = { sample_steps: 9 };
      const actualSteps2 = job2.sample_steps ?? modelParams2?.sample_steps ?? undefined;
      expect(actualSteps2).toBe(9);

      // Scenario 3: Neither provides sample_steps
      const job3 = { sample_steps: undefined };
      const modelParams3 = { sample_steps: undefined };
      const actualSteps3 = job3.sample_steps ?? modelParams3?.sample_steps ?? undefined;
      expect(actualSteps3).toBeUndefined();

      // Now build command with these params
      const modelConfig = {
        command: './bin/sd-cli',
        args: []
      };

      // Test with user override
      const params1 = { prompt: 'test', size: '512x512', sample_steps: actualSteps1, cfg_scale: 7.0 };
      const cmd1 = cliHandlerInstance.buildCommand(modelConfig, params1);
      expect(cmd1).toContain('--steps');
      expect(cmd1[cmd1.indexOf('--steps') + 1]).toBe('15');

      // Test with model default
      const params2 = { prompt: 'test', size: '512x512', sample_steps: actualSteps2, cfg_scale: 7.0 };
      const cmd2 = cliHandlerInstance.buildCommand(modelConfig, params2);
      expect(cmd2[cmd2.indexOf('--steps') + 1]).toBe('9');

      // Test with no steps
      const params3 = { prompt: 'test', size: '512x512', sample_steps: actualSteps3, cfg_scale: 7.0 };
      const cmd3 = cliHandlerInstance.buildCommand(modelConfig, params3);
      expect(cmd3.filter(a => a === '--steps').length).toBe(0);
    });

    it('should respect server mode --steps in model args for HTTP but not CLI', () => {
      // For SERVER mode, steps come from model args (line 550-556 in queueProcessor.js)
      // For CLI mode, steps come from params (which can be user override or model default)

      const serverModelConfig = {
        id: 'flux1-schnell-fp8',
        exec_mode: 'server',
        command: './bin/sd-server',
        args: ['--steps', '4']  // Server mode sets steps at startup
      };

      // CLI model config - should NOT use --steps from args
      const cliModelConfig = {
        id: 'flux1-schnell-fp8-cli',
        exec_mode: 'cli',
        command: './bin/sd-cli',
        args: ['--steps', '4']  // This should be filtered out
      };

      const userParams = { prompt: 'test', size: '512x512', sample_steps: 20, cfg_scale: 7.0 };

      // Server mode buildCommand (with exec_mode=server, --steps would NOT be filtered)
      // But for CLI mode, --steps IS filtered from args
      const serverCmd = cliHandlerInstance.buildCommand(serverModelConfig, userParams);
      const cliCmd = cliHandlerInstance.buildCommand(cliModelConfig, userParams);

      // Both should use 20 from user params
      expect(serverCmd[serverCmd.indexOf('--steps') + 1]).toBe('20');
      expect(cliCmd[cliCmd.indexOf('--steps') + 1]).toBe('20');
    });
  });

  describe('Memory flags merging does not affect steps', () => {
    it('should preserve steps value when merging memory flags', () => {
      // This tests that _mergeMemoryFlags doesn't interfere with --steps
      // _mergeMemoryFlags is called in queueProcessor.processCLIGeneration

      const originalArgs = [
        '--diffusion-model', './models/test.gguf',
        '--vae', './models/vae.safetensors',
        '--clip_l', './models/clip.safetensors',
        '--t5xxl', './models/t5xxl.safetensors'
      ];

      const modelConfig = {
        id: 'test-model',
        memory_overrides: {
          offload_to_cpu: true,
          clip_on_cpu: true
        }
      };

      // Simulate _mergeMemoryFlags (from modelManager._mergeMemoryFlags)
      const FLAG_MAP = {
        offload_to_cpu: '--offload-to-cpu',
        clip_on_cpu: '--clip-on-cpu',
        vae_on_cpu: '--vae-on-cpu',
        vae_tiling: '--vae-tiling',
        diffusion_fa: '--diffusion-fa',
        vae_conv_direct: '--vae-conv-direct',
      };

      const mergedArgs = [...originalArgs];
      for (const [key, cliFlag] of Object.entries(FLAG_MAP)) {
        if (modelConfig.memory_overrides[key] === true && !mergedArgs.includes(cliFlag)) {
          mergedArgs.push(cliFlag);
        }
      }

      // Verify --steps is not in the original args
      expect(mergedArgs).not.toContain('--steps');

      // Verify memory flags were added
      expect(mergedArgs).toContain('--offload-to-cpu');
      expect(mergedArgs).toContain('--clip-on-cpu');

      // Now build CLI command with params that have sample_steps
      const params = {
        prompt: 'test',
        size: '512x512',
        sample_steps: 9,
        cfg_scale: 7.0,
        sampling_method: 'euler'
      };

      const finalModelConfig = { ...modelConfig, args: mergedArgs, command: './bin/sd-cli' };
      const command = cliHandlerInstance.buildCommand(finalModelConfig, params);

      // Verify steps is correctly set to 9
      const stepsIdx = command.indexOf('--steps');
      expect(stepsIdx).toBeGreaterThanOrEqual(0);
      expect(command[stepsIdx + 1]).toBe('9');
    });
  });
});

describe('CLI Steps Priority Tests', () => {
  let cliHandlerInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const module = await import('../backend/services/cliHandler.js');
    cliHandlerInstance = new module.default();
  });

  it('should prioritize user sample_steps over quality', () => {
    const modelConfig = { command: './bin/sd-cli', args: [] };
    const params = {
      prompt: 'test',
      size: '512x512',
      sample_steps: 5,
      quality: 'ultra',  // Would map to 50 steps
      cfg_scale: 7.0
    };

    const command = cliHandlerInstance.buildCommand(modelConfig, params);
    const stepsIdx = command.indexOf('--steps');
    expect(command[stepsIdx + 1]).toBe('5');  // User value wins
  });

  it('should use quality when no sample_steps provided', () => {
    const modelConfig = { command: './bin/sd-cli', args: [] };
    const params = {
      prompt: 'test',
      size: '512x512',
      quality: 'high',  // Maps to 30 steps
      cfg_scale: 7.0
    };

    const command = cliHandlerInstance.buildCommand(modelConfig, params);
    const stepsIdx = command.indexOf('--steps');
    expect(command[stepsIdx + 1]).toBe('30');
  });

  it('should handle different quality levels correctly', () => {
    const modelConfig = { command: './bin/sd-cli', args: [] };
    const qualityMap = {
      low: '10',
      medium: '20',
      high: '30',
      ultra: '50',
      standard: '20'
    };

    for (const [quality, expectedSteps] of Object.entries(qualityMap)) {
      const params = {
        prompt: 'test',
        size: '512x512',
        quality,
        cfg_scale: 7.0
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);
      const stepsIdx = command.indexOf('--steps');
      expect(command[stepsIdx + 1]).toBe(expectedSteps, `Quality ${quality} should map to ${expectedSteps} steps`);
    }
  });
});