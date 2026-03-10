/**
 * Model Helpers Unit Tests
 *
 * Tests for modelHelpers.js functions including:
 * - extractFilesFromArgs: Extract file paths from model args
 * - getModelFileStatus: Detect files from args vs huggingface config
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

describe('modelHelpers', () => {
  let testDirs = [];

  const createTestFile = (filePath) => {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(filePath, 'test content');
    testDirs.push(dir);
  };

  const cleanupTestFiles = () => {
    for (const dir of [...new Set(testDirs)]) {
      try {
        if (existsSync(dir)) {
          rmSync(dir, { recursive: true, force: true });
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    testDirs = [];
  };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanupTestFiles();
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

    it('should check file existence for args-based files', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      // Create a test file
      const testFilePath = path.join(PROJECT_ROOT, 'models/test-model.gguf');
      createTestFile(testFilePath);
      
      const model = {
        id: 'test-model',
        args: ['--diffusion-model', './models/test-model.gguf']
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

    it('should fall back to huggingface.files when no args files', async () => {
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

    it('should handle models with no files (API mode)', async () => {
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

    it('should handle models with empty args', async () => {
      const { getModelFileStatus } = await import('../backend/utils/modelHelpers.js');
      
      const model = {
        id: 'empty-model',
        args: []
      };
      
      const status = await getModelFileStatus(model);
      
      expect(status.source).toBeNull();
      expect(status.files).toEqual([]);
    });
  });
});
