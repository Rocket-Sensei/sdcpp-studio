/**
 * Model Helpers Unit Tests
 *
 * Tests for modelHelpers.js functions including:
 * - extractFilesFromArgs: Extract file paths from model args
 * - getModelFileStatus: Detect files from args, config fields, and huggingface config
 *
 * IMPORTANT: Tests that need real files on disk use os.tmpdir() to avoid
 * touching the real models/ directory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('modelHelpers', () => {
  // Use a unique temp directory per test run - NEVER touch real project dirs
  let tmpDir = null;

  const createTmpDir = () => {
    tmpDir = path.join(os.tmpdir(), `sdcpp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  };

  const createTestFile = (filePath) => {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, 'test content');
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (tmpDir && existsSync(tmpDir)) {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    tmpDir = null;
  });

  describe('extractFilesFromArgs', () => {
    it('should extract --diffusion-model file', async () => {
      const { extractFilesFromArgs } = await import('../backend/utils/modelHelpers.js');
      
      const args = ['--diffusion-model', './models/model.gguf', '--steps', '4'];
      const files = extractFilesFromArgs(args);
      
      expect(files).toHaveLength(1);
      expect(files[0]).toEqual({
        flag: '--diffusion-model',
        path: './models/model.gguf'
      });
    });

    it('should extract multiple file args', async () => {
      const { extractFilesFromArgs } = await import('../backend/utils/modelHelpers.js');
      
      const args = [
        '--diffusion-model', './models/flux1-schnell-Q8_0.gguf',
        '--vae', './models/ae.safetensors',
        '--clip_l', './models/clip_l.safetensors',
        '--t5xxl', './models/t5xxl_fp16.safetensors',
        '--steps', '4'
      ];
      const files = extractFilesFromArgs(args);
      
      expect(files).toHaveLength(4);
      expect(files[0].flag).toBe('--diffusion-model');
      expect(files[1].flag).toBe('--vae');
      expect(files[2].flag).toBe('--clip_l');
      expect(files[3].flag).toBe('--t5xxl');
    });

    it('should return empty array for empty args', async () => {
      const { extractFilesFromArgs } = await import('../backend/utils/modelHelpers.js');
      
      expect(extractFilesFromArgs(null)).toEqual([]);
      expect(extractFilesFromArgs(undefined)).toEqual([]);
      expect(extractFilesFromArgs([])).toEqual([]);
    });

    it('should return empty array for args without file flags', async () => {
      const { extractFilesFromArgs } = await import('../backend/utils/modelHelpers.js');
      
      const args = ['--steps', '4', '--offload-to-cpu', '-v'];
      const files = extractFilesFromArgs(args);
      
      expect(files).toHaveLength(0);
    });

    it('should handle --clip_vision flag (Wan models)', async () => {
      const { extractFilesFromArgs } = await import('../backend/utils/modelHelpers.js');
      
      const args = [
        '--diffusion-model', './models/wan-model.safetensors',
        '--clip_vision', './models/clip_vision.safetensors',
        '--vae', './models/vae.safetensors'
      ];
      const files = extractFilesFromArgs(args);
      
      expect(files).toHaveLength(3);
      expect(files[1].flag).toBe('--clip_vision');
    });

    it('should handle -m shorthand flag', async () => {
      const { extractFilesFromArgs } = await import('../backend/utils/modelHelpers.js');
      
      const args = ['-m', './models/sd15.ckpt', '-s', '20'];
      const files = extractFilesFromArgs(args);
      
      expect(files).toHaveLength(1);
      expect(files[0].flag).toBe('-m');
    });
  });

  describe('getModelFileStatus', () => {
    it('should detect files from model.args', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'test-model',
        args: ['--diffusion-model', './models/test-model.gguf', '--steps', '4']
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('args');
      expect(status.files).toHaveLength(1);
      expect(status.files[0].flag).toBe('--diffusion-model');
    });

    it('should check file existence using a temp directory', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      // Use a temp dir so we never risk deleting real models/
      const dir = createTmpDir();
      const testFilePath = path.join(dir, 'test-model.gguf');
      createTestFile(testFilePath);
      
      // Use absolute path so getModelFileStatus resolves it correctly
      const model = {
        id: 'test-model',
        args: ['--diffusion-model', testFilePath]
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('args');
      expect(status.files).toHaveLength(1);
      expect(status.files[0].exists).toBe(true);
      expect(status.allFilesExist).toBe(true);
    });

    it('should detect non-existent args files', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'test-model',
        args: ['--diffusion-model', './models/nonexistent.gguf']
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('args');
      expect(status.files[0].exists).toBe(false);
      expect(status.allFilesExist).toBe(false);
    });

    it('should detect files from config fields (model_file, vae, mmproj)', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'llm-test',
        model_file: './models/some-llm.gguf',
        mmproj: './models/mmproj.gguf',
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('config');
      expect(status.files).toHaveLength(2);
      expect(status.files[0].flag).toBe('--diffusion-model');
      expect(status.files[1].flag).toBe('--mmproj');
      expect(status.allFilesExist).toBe(false); // files don't exist
    });

    it('should prefer args over config fields', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'test-model',
        model_file: './models/config-model.gguf',
        args: ['--diffusion-model', './models/args-model.gguf'],
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('args');
      expect(status.files[0].path).toBe('./models/args-model.gguf');
    });

    it('should fall back to huggingface.files when no args or config files', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'test-model',
        huggingface: {
          files: [
            { path: 'model.safetensors', dest: './models' }
          ]
        }
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('huggingface');
      expect(status.hasHuggingFace).toBe(true);
      expect(status.files).toHaveLength(1);
    });

    it('should prefer args over huggingface.files', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'test-model',
        args: ['--diffusion-model', './models/args-model.gguf'],
        huggingface: {
          files: [
            { path: 'hf-model.safetensors', dest: './models' }
          ]
        }
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBe('args');
      expect(status.files[0].path).toBe('./models/args-model.gguf');
    });

    it('should treat API/external models as present', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'api-model',
        exec_mode: 'api',
        api: 'http://external-api.com'
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBeNull();
      expect(status.files).toEqual([]);
      expect(status.allFilesExist).toBe(true);
      expect(status.hasHuggingFace).toBe(false);
    });

    it('should treat non-API models with no files as NOT present', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      // A model with just ini_section and no file fields - should be missing
      const model = {
        id: 'llm-gemma',
        backend: 'llama-server',
        ini_section: 'gemma-3-27b-it',
        capabilities: ['text-generation'],
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBeNull();
      expect(status.allFilesExist).toBe(false);
    });

    it('should handle models with empty args', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'empty-model',
        args: []
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBeNull();
      expect(status.files).toEqual([]);
      // No exec_mode=api, so treated as not present
      expect(status.allFilesExist).toBe(false);
    });
  });
});
