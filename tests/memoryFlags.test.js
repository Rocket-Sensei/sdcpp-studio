/**
 * Tests for memoryFlags utility
 */

import { describe, it, expect } from 'vitest';
import { mergeMemoryFlags, getEffectiveMemoryFlags } from '../backend/utils/memoryFlags.js';

describe('memoryFlags', () => {
  describe('mergeMemoryFlags', () => {
    it('should return empty args when no flags are set', () => {
      const args = ['--model', 'test.gguf'];
      const defaults = {};
      
      const result = mergeMemoryFlags(args, defaults);
      
      expect(result).toEqual(['--model', 'test.gguf']);
    });

    it('should add boolean flags from defaults', () => {
      const args = ['--model', 'test.gguf'];
      const defaults = {
        offload_to_cpu: true,
        clip_on_cpu: true,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      expect(result).toContain('--offload-to-cpu');
      expect(result).toContain('--clip-on-cpu');
      expect(result).toHaveLength(4); // original 2 + 2 new flags
    });

    it('should not duplicate existing flags', () => {
      const args = ['--model', 'test.gguf', '--offload-to-cpu'];
      const defaults = {
        offload_to_cpu: true,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      const offloadFlags = result.filter(arg => arg === '--offload-to-cpu');
      expect(offloadFlags).toHaveLength(1);
    });

    it('should add value flags from defaults', () => {
      const args = ['--model', 'test.gguf'];
      const defaults = {
        vae_tile_size: 128,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      const tileSizeIndex = result.indexOf('--vae-tile-size');
      expect(tileSizeIndex).toBeGreaterThan(-1);
      expect(result[tileSizeIndex + 1]).toBe('128');
    });

    it('should not add value flags when set to false', () => {
      const args = ['--model', 'test.gguf'];
      const defaults = {
        vae_tile_size: false,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      expect(result).not.toContain('--vae-tile-size');
    });

    it('should apply per-model overrides over defaults', () => {
      const args = ['--model', 'test.gguf'];
      const defaults = {
        offload_to_cpu: true,
        clip_on_cpu: true,
      };
      const overrides = {
        clip_on_cpu: false, // Override to disable
        vae_on_cpu: true,   // Add new flag
      };
      
      const result = mergeMemoryFlags(args, defaults, overrides);
      
      expect(result).toContain('--offload-to-cpu');
      expect(result).not.toContain('--clip-on-cpu');
      expect(result).toContain('--vae-on-cpu');
    });

    it('should handle all supported boolean flags', () => {
      const args = [];
      const defaults = {
        offload_to_cpu: true,
        clip_on_cpu: true,
        vae_on_cpu: true,
        vae_tiling: true,
        diffusion_fa: true,
        vae_conv_direct: true,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      expect(result).toContain('--offload-to-cpu');
      expect(result).toContain('--clip-on-cpu');
      expect(result).toContain('--vae-on-cpu');
      expect(result).toContain('--vae-tiling');
      expect(result).toContain('--diffusion-fa');
      expect(result).toContain('--vae-conv-direct');
    });

    it('should not add boolean flags when set to false', () => {
      const args = [];
      const defaults = {
        offload_to_cpu: false,
        clip_on_cpu: false,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      expect(result).not.toContain('--offload-to-cpu');
      expect(result).not.toContain('--clip-on-cpu');
      expect(result).toHaveLength(0);
    });

    it('should handle undefined overrides', () => {
      const args = ['--model', 'test.gguf'];
      const defaults = {
        offload_to_cpu: true,
      };
      
      const result = mergeMemoryFlags(args, defaults, undefined);
      
      expect(result).toContain('--offload-to-cpu');
    });

    it('should preserve original args order', () => {
      const args = ['--model', 'test.gguf', '--steps', '20'];
      const defaults = {
        offload_to_cpu: true,
      };
      
      const result = mergeMemoryFlags(args, defaults);
      
      expect(result[0]).toBe('--model');
      expect(result[1]).toBe('test.gguf');
      expect(result[2]).toBe('--steps');
      expect(result[3]).toBe('20');
      expect(result[4]).toBe('--offload-to-cpu');
    });
  });

  describe('getEffectiveMemoryFlags', () => {
    it('should return defaults when no overrides', () => {
      const defaults = {
        offload_to_cpu: true,
        clip_on_cpu: false,
      };
      
      const result = getEffectiveMemoryFlags(defaults);
      
      expect(result).toEqual(defaults);
    });

    it('should merge overrides with defaults', () => {
      const defaults = {
        offload_to_cpu: true,
        clip_on_cpu: true,
        vae_on_cpu: false,
      };
      const overrides = {
        clip_on_cpu: false,
        vae_on_cpu: true,
      };
      
      const result = getEffectiveMemoryFlags(defaults, overrides);
      
      expect(result.offload_to_cpu).toBe(true);
      expect(result.clip_on_cpu).toBe(false);
      expect(result.vae_on_cpu).toBe(true);
    });

    it('should handle empty defaults and overrides', () => {
      const result = getEffectiveMemoryFlags({}, {});
      
      expect(result).toEqual({});
    });
  });
});
