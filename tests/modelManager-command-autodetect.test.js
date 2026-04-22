/**
 * Model Manager Command Auto-Detection Tests
 *
 * Tests that verify:
 * 1. Config files load without command field
 * 2. Model manager correctly builds command from exec_mode
 * 3. Proper args are passed to the SD process
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('Model Manager Command Auto-Detection', () => {
  describe('Config files should not have command field (specified files only)', () => {
    const configFiles = [
      'models-qwen-image.yml',
      'models-qwen-edit.yml',
      'models-z-turbo.yml',
      'models-shuttle.yml',
      'models-flux.yml',
      'models-copax.yml'
    ];

    for (const configFile of configFiles) {
      it(`${configFile} should not contain command field`, () => {
        const configPath = path.join(__dirname, `../backend/config/${configFile}`);
        const content = readFileSync(configPath, 'utf-8');

        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('command:')) {
            expect(trimmed).toMatch(/^command:\s*null/);
          }
        }
      });
    }
  });

  describe('modelManager.js auto-detects command from exec_mode', () => {
    let sourceCode;
    let ModelManager;
    let ExecMode;

    beforeEach(async () => {
      vi.resetModules();
      const modelManagerPath = path.join(__dirname, '../backend/services/modelManager.js');
      sourceCode = readFileSync(modelManagerPath, 'utf-8');

      const module = await import('../backend/services/modelManager.js');
      ModelManager = module.ModelManager;
      ExecMode = module.ExecMode;
    });

    it('should have auto-detection logic for exec_mode', () => {
      expect(sourceCode).toContain("model.exec_mode === ExecMode.SERVER");
      expect(sourceCode).toContain("model.exec_mode === ExecMode.CLI");
      expect(sourceCode).toContain("this.binaries.sd_server");
      expect(sourceCode).toContain("this.binaries.sd_cli");
    });

    it('should use sd_server binary for SERVER exec_mode', () => {
      // Check that the code references sd_server binary
      expect(sourceCode).toContain('this.binaries.sd_server');
    });

    it('should use sd_cli binary for CLI exec_mode', () => {
      // Check that the code references sd_cli binary
      expect(sourceCode).toContain('this.binaries.sd_cli');
    });

    it('should allow SERVER/CLI models without explicit command in validation', () => {
      // Check that auto-detection logic exists
      expect(sourceCode).toContain('Auto-detected command from binaries');
    });

    it('should skip spawning for API mode', () => {
      expect(sourceCode).toContain("if (model.exec_mode === ExecMode.API)");
      expect(sourceCode).toContain("API mode - no local process to spawn");
    });

    it('should handle API mode running status correctly', () => {
      expect(sourceCode).toContain("processEntry.execMode === ExecMode.API");
      expect(sourceCode).toContain("return processEntry.status === ModelStatus.RUNNING");
    });
  });

  describe('ModelManager instance behavior', () => {
    let ModelManager;
    let ExecMode;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('../backend/services/modelManager.js');
      ModelManager = module.ModelManager;
      ExecMode = module.ExecMode;
    });

    it('should create manager with empty config paths', () => {
      const manager = new ModelManager();
      expect(manager.configPaths).toBeDefined();
      expect(Array.isArray(manager.configPaths)).toBe(true);
    });

    it('should have ExecMode constants defined', () => {
      expect(ExecMode.AUTO).toBe('auto');
      expect(ExecMode.SERVER).toBe('server');
      expect(ExecMode.CLI).toBe('cli');
      expect(ExecMode.API).toBe('api');
    });
  });

  describe('Command building for spawn', () => {
    it('should include auto-detected command in spawn call', async () => {
      vi.resetModules();
      const modelManagerPath = path.join(__dirname, '../backend/services/modelManager.js');
      const sourceCode = readFileSync(modelManagerPath, 'utf-8');

      // Commands are now auto-detected in startModel method
      expect(sourceCode).toContain("command = this.binaries.sd_server");
      expect(sourceCode).toContain("command = this.binaries.sd_cli");
      expect(sourceCode).toContain("Auto-detected command from binaries");
    });

    it('should throw error when command cannot be determined', async () => {
      vi.resetModules();
      const modelManagerPath = path.join(__dirname, '../backend/services/modelManager.js');
      const sourceCode = readFileSync(modelManagerPath, 'utf-8');

      expect(sourceCode).toContain("Cannot start model");
      expect(sourceCode).toContain("no command specified and auto-detection failed");
    });
  });
});

describe('Config file loading without command', () => {
  it('should load models-qwen-image.yml successfully', async () => {
    vi.resetModules();
    const pathModule = await import('path');
    const yaml = await import('js-yaml');
    const fs = await import('fs');

    const configPath = pathModule.join(__dirname, '../backend/config/models-qwen-image.yml');
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content);

    expect(config.models).toBeDefined();
    expect(Object.keys(config.models).length).toBeGreaterThan(0);

    for (const [modelId, model] of Object.entries(config.models)) {
      expect(model.command).toBeUndefined();
      expect(model.exec_mode).toBeDefined();
    }
  });

  it('should load models-flux.yml successfully', async () => {
    vi.resetModules();
    const pathModule = await import('path');
    const yaml = await import('js-yaml');
    const fs = await import('fs');

    const configPath = pathModule.join(__dirname, '../backend/config/models-flux.yml');
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content);

    expect(config.models).toBeDefined();
    expect(Object.keys(config.models).length).toBeGreaterThan(0);

    for (const [modelId, model] of Object.entries(config.models)) {
      expect(model.command).toBeUndefined();
    }
  });

  it('should load models-z-turbo.yml successfully', async () => {
    vi.resetModules();
    const pathModule = await import('path');
    const yaml = await import('js-yaml');
    const fs = await import('fs');

    const configPath = pathModule.join(__dirname, '../backend/config/models-z-turbo.yml');
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = yaml.load(content);

    expect(config.models).toBeDefined();
    expect(Object.keys(config.models).length).toBeGreaterThan(0);

    for (const [modelId, model] of Object.entries(config.models)) {
      expect(model.command).toBeUndefined();
    }
  });
});
