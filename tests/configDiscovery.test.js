/**
 * Tests for configDiscovery utility
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { discoverConfigFiles, isNonModelConfig } from '../backend/utils/configDiscovery.js';

describe('configDiscovery', () => {
  let tempDir;
  let fallbackPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-test-'));
    fallbackPath = path.join(tempDir, 'fallback.yml');
    fs.writeFileSync(fallbackPath, 'models: {}');
  });

  afterEach(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  describe('discoverConfigFiles', () => {
    it('should return fallback path when directory does not exist', () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');
      const result = discoverConfigFiles(nonExistentDir, fallbackPath);
      
      expect(result).toEqual([fallbackPath]);
    });

    it('should discover YAML files in correct order', () => {
      // Create test files
      fs.writeFileSync(path.join(tempDir, 'models-flux.yml'), 'models: {}');
      fs.writeFileSync(path.join(tempDir, 'models-chroma.yml'), 'models: {}');
      fs.writeFileSync(path.join(tempDir, 'settings.yml'), 'default_model: test');
      fs.writeFileSync(path.join(tempDir, 'upscalers.yml'), 'upscalers: {}');
      
      const result = discoverConfigFiles(tempDir, fallbackPath);
      
      // Filter out fallback path
      const nonFallback = result.filter(f => path.basename(f) !== 'fallback.yml');
      
      // Should have 4 files
      expect(nonFallback.length).toBe(4);
      
      // settings.yml should be first
      expect(path.basename(nonFallback[0])).toBe('settings.yml');
      
      // upscalers.yml should be second
      expect(path.basename(nonFallback[1])).toBe('upscalers.yml');
      
      // Model configs should be alphabetically sorted
      expect(path.basename(nonFallback[2])).toBe('models-chroma.yml');
      expect(path.basename(nonFallback[3])).toBe('models-flux.yml');
    });

    it('should ignore non-YAML files', () => {
      fs.writeFileSync(path.join(tempDir, 'readme.md'), '# Readme');
      fs.writeFileSync(path.join(tempDir, 'models.yml'), 'models: {}');
      fs.writeFileSync(path.join(tempDir, 'config.yaml'), 'models: {}');
      
      const result = discoverConfigFiles(tempDir, fallbackPath);
      
      // Should only include YAML files (filter out fallback)
      const yamlFiles = result.filter(f => 
        (f.endsWith('.yml') || f.endsWith('.yaml')) && path.basename(f) !== 'fallback.yml'
      );
      expect(yamlFiles.length).toBe(2);
      expect(path.basename(yamlFiles[0])).toBe('config.yaml');
      expect(path.basename(yamlFiles[1])).toBe('models.yml');
    });

    it('should handle empty directory', () => {
      const result = discoverConfigFiles(tempDir, fallbackPath);
      
      // Empty directory should still return array (just fallback)
      expect(Array.isArray(result)).toBe(true);
    });

    it('should place settings.local.yml after settings.yml', () => {
      fs.writeFileSync(path.join(tempDir, 'settings.yml'), 'default_model: test');
      fs.writeFileSync(path.join(tempDir, 'settings.local.yml'), 'default_model: local');
      fs.writeFileSync(path.join(tempDir, 'models.yml'), 'models: {}');
      
      const result = discoverConfigFiles(tempDir, fallbackPath);
      
      // Filter out the fallback path if present
      const nonFallback = result.filter(f => path.basename(f) !== 'fallback.yml');
      
      expect(path.basename(nonFallback[0])).toBe('settings.yml');
      expect(path.basename(nonFallback[1])).toBe('settings.local.yml');
      expect(path.basename(nonFallback[2])).toBe('models.yml');
    });
  });

  describe('isNonModelConfig', () => {
    it('should identify non-model configs', () => {
      expect(isNonModelConfig('settings.yml')).toBe(true);
      expect(isNonModelConfig('settings.local.yml')).toBe(true);
      expect(isNonModelConfig('upscalers.yml')).toBe(true);
    });

    it('should identify model configs', () => {
      expect(isNonModelConfig('models-flux.yml')).toBe(false);
      expect(isNonModelConfig('models-chroma.yml')).toBe(false);
      expect(isNonModelConfig('custom-model.yml')).toBe(false);
    });
  });
});
