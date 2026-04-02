/**
 * CLI Handler Command Auto-Detection Tests
 *
 * Tests that verify CLI handler correctly auto-detects the command
 * from exec_mode when cli_command or command is not explicitly set.
 *
 * This fixes the bug: "Cannot read properties of undefined (reading 'includes')"
 * which occurred when command was undefined after the config cleanup removed
 * the command field from model configs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('CLI Handler Command Auto-Detection', () => {
  describe('buildCommand with missing command field', () => {
    it('should auto-detect sd-cli command when exec_mode is "auto" and no command is set', () => {
      // This simulates models like z-image which have exec_mode: "auto" but no command field
      const modelConfig = {
        id: 'z-image',
        exec_mode: 'auto',
        args: [
          '--diffusion-model', './models/z-image/z-image-Q8_0.gguf',
          '--vae', './models/vae/flux1_f32.safetensors'
        ]
        // Note: no 'command' or 'cli_command' field
      };

      const params = {
        prompt: 'a beautiful landscape',
        size: '1024x1024',
        seed: 12345,
        sample_steps: 9,
        cfg_scale: 7.0,
        sampling_method: 'euler'
      };

      // This should NOT throw "Cannot read properties of undefined (reading 'includes')"
      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Should default to sd-cli for one-shot generation
      expect(command[0]).toBe('./bin/sd-cli');
    });

    it('should auto-detect sd-cli command when exec_mode is "cli" and no command is set', () => {
      const modelConfig = {
        id: 'test-model',
        exec_mode: 'cli',
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

      // Should use sd-cli for CLI mode
      expect(command[0]).toBe('./bin/sd-cli');
    });

    it('should auto-detect sd-cli (not sd-server) when exec_mode is "server" but for CLI generation', () => {
      // When exec_mode is 'server' but we're doing one-shot CLI generation,
      // we should use sd-cli, not sd-server
      const modelConfig = {
        id: 'test-model',
        exec_mode: 'server',
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

      // Should still use sd-cli for CLI mode (one-shot generation)
      expect(command[0]).toBe('./bin/sd-cli');
    });

    it('should use cli_command when explicitly set even with exec_mode: "auto"', () => {
      const modelConfig = {
        id: 'custom-model',
        exec_mode: 'auto',
        cli_command: './custom/bin/sd-cli-custom',
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

      // Should use the explicitly set cli_command
      expect(command[0]).toBe('./custom/bin/sd-cli-custom');
    });

    it('should use command field when cli_command is not set', () => {
      const modelConfig = {
        id: 'legacy-model',
        exec_mode: 'cli',
        command: './bin/sd-cli',
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

      // Should use the command field
      expect(command[0]).toBe('./bin/sd-cli');
    });

    it('should prefer cli_command over command when both are set', () => {
      const modelConfig = {
        id: 'dual-command-model',
        exec_mode: 'cli',
        cli_command: './bin/sd-cli-custom',
        command: './bin/sd-cli',
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

      // Should prefer cli_command over command
      expect(command[0]).toBe('./bin/sd-cli-custom');
    });

    it('should handle model with no exec_mode and no command (defaults to sd-cli)', () => {
      const modelConfig = {
        id: 'minimal-model',
        args: ['--diffusion-model', './models/test.gguf']
        // No exec_mode, no command
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        sample_steps: 15,
        cfg_scale: 7.0,
        sampling_method: 'euler'
      };

      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Should default to sd-cli
      expect(command[0]).toBe('./bin/sd-cli');
    });

    it('should replace sd-server with sd-cli even when auto-detected', () => {
      // This tests the case where model had sd-server in command but it's now
      // auto-detected - the replacement should still work
      const modelConfig = {
        id: 'server-model',
        exec_mode: 'server',
        command: './bin/sd-server',  // Explicitly set to sd-server
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
      expect(command.join(' ')).not.toContain('sd-server');
    });
  });

  describe('Real-world model configs without command field', () => {
    it('should handle z-image model config (exec_mode: auto, no command)', () => {
      // This simulates the actual z-image model configuration
      const modelConfig = {
        id: 'z-image',
        name: 'Z-Image',
        quant: 'Q8_0',
        capabilities: ['text-to-image'],
        supports_negative_prompt: true,
        mode: 'on_demand',
        args: [
          '--diffusion-model', './models/z-image/z-image-Q8_0.gguf',
          '--vae', './models/vae/flux1_f32.safetensors',
          '--llm', './models/qwen3/qwen_3_4b.safetensors',
          '-v',
          '--steps', '40'
        ],
        exec_mode: 'auto',
        model_type: 'text-to-image',
        default_size: '1024x1024',
        generation_params: {
          cfg_scale: 1,
          sample_steps: 40,
          sampling_method: 'euler'
        }
        // Note: no 'command' field
      };

      const params = {
        prompt: 'Alien landscape, bright, retro futuristic. neon colors',
        negative_prompt: '',
        size: '1024x1024',
        seed: 1774886755,
        n: 1,
        quality: 'medium',
        sample_steps: 40,
        cfg_scale: 1,
        sampling_method: 'euler'
      };

      // This should NOT throw the error:
      // "Cannot read properties of undefined (reading 'includes')"
      const command = cliHandlerInstance.buildCommand(modelConfig, params);

      // Verify command is correct
      expect(command[0]).toBe('./bin/sd-cli');
      
      // Verify args are included
      expect(command).toContain('--diffusion-model');
      expect(command).toContain('./models/z-image/z-image-Q8_0.gguf');
      expect(command).toContain('-p');
      expect(command).toContain('Alien landscape, bright, retro futuristic. neon colors');
    });
  });
});
