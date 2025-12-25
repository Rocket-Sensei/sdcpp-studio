/**
 * Tests for Z-Image-Turbo model-specific settings
 *
 * This test file verifies that:
 * 1. Model-specific generation_params are loaded from models.yml
 * 2. Z-Image-Turbo gets cfg_scale=0.0 and sample_steps=9 by default
 * 3. The fallback mechanism works correctly when job params are provided
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the models.yml source file for static analysis
const getModelsYmlSource = () => {
  const modelsPath = join(__dirname, '../backend/config/models.yml');
  return readFileSync(modelsPath, 'utf-8');
};

// Read the models-z-turbo.yml source file for z-image-turbo specific tests
const getModelsZTurboYmlSource = () => {
  const modelsPath = join(__dirname, '../backend/config/models-z-turbo.yml');
  return readFileSync(modelsPath, 'utf-8');
};

// Read the modelManager source file for static analysis
const getModelManagerSource = () => {
  const sourcePath = join(__dirname, '../backend/services/modelManager.js');
  return readFileSync(sourcePath, 'utf-8');
};

// Read the queueProcessor source file for static analysis
const getQueueProcessorSource = () => {
  const sourcePath = join(__dirname, '../backend/services/queueProcessor.js');
  return readFileSync(sourcePath, 'utf-8');
};

describe('Z-Image-Turbo Model Configuration', () => {
  it('should have generation_params defined in models-z-turbo.yml', () => {
    const source = getModelsZTurboYmlSource();

    // Verify z-image-turbo has generation_params section
    expect(source).toContain('z-image-turbo:');
    expect(source).toContain('generation_params:');
    expect(source).toContain('cfg_scale: 0.0');
    expect(source).toContain('sample_steps: 9');
    expect(source).toContain('sampling_method: "euler"');
  });

  it('should document the correct settings for Z-Image-Turbo', () => {
    const source = getModelsZTurboYmlSource();

    // Verify the comment explains the recommended settings
    expect(source).toContain('Z-Image-Turbo is a distilled model');
    expect(source).toContain('does not rely on classifier-free guidance');
    expect(source).toContain('cfg_scale=0.0-1.0');
    expect(source).toContain('steps=4-9');
  });

  it('should remove hardcoded --cfg-scale from args', () => {
    const source = getModelsZTurboYmlSource();

    // Extract z-image-turbo section only
    const turboSection = source.substring(
      source.indexOf('z-image-turbo:')
    );

    // Verify that the old hardcoded --cfg-scale is not in args
    expect(turboSection).not.toMatch(/--cfg-scale/);
    // Should not have --cfg-scale in the args at all for z-image-turbo
    expect(turboSection).not.toMatch(/^\s*-\s*"--cfg-scale"/m);
  });
});

describe('ModelManager - getModelGenerationParams', () => {
  it('should have getModelGenerationParams method', () => {
    const source = getModelManagerSource();

    // Verify the method exists
    expect(source).toContain('getModelGenerationParams');
    expect(source).toContain('generation_params');
  });

  it('should return null when model has no generation_params', () => {
    const source = getModelManagerSource();

    // Verify the null check
    expect(source).toContain('!model.generation_params');
    expect(source).toContain('return null');
  });

  it('should return generation_params when model has them', () => {
    const source = getModelManagerSource();

    // Verify the return statement
    expect(source).toContain('return model.generation_params');
  });
});

describe('QueueProcessor - Model-specific defaults', () => {
  it('should call getModelGenerationParams in processGenerateJob', () => {
    const source = getQueueProcessorSource();

    // Verify the function is called
    expect(source).toContain('modelManager.getModelGenerationParams(modelId)');
  });

  it('should use model defaults as fallback when job params are undefined', () => {
    const source = getQueueProcessorSource();

    // Verify the nullish coalescing pattern
    expect(source).toContain('job.cfg_scale ?? modelParams?.cfg_scale');
    expect(source).toContain('job.sample_steps ?? modelParams?.sample_steps');
    expect(source).toContain('job.sampling_method ?? modelParams?.sampling_method');
    expect(source).toContain('job.clip_skip ?? modelParams?.clip_skip');
  });

  it('should apply model defaults in processGenerateJob', () => {
    const source = getQueueProcessorSource();

    // Find processGenerateJob function
    const generateJobStart = source.indexOf('async function processGenerateJob');
    expect(generateJobStart).toBeGreaterThan(-1);

    // Verify modelParams is retrieved
    const getParamsCall = source.substring(generateJobStart).indexOf('getModelGenerationParams');
    expect(getParamsCall).toBeGreaterThan(-1);
  });

  it('should apply model defaults in processEditJob', () => {
    const source = getQueueProcessorSource();

    // Find processEditJob function
    const editJobStart = source.indexOf('async function processEditJob');
    expect(editJobStart).toBeGreaterThan(-1);

    // Verify modelParams is retrieved
    const editJobSection = source.substring(editJobStart, editJobStart + 1000);
    expect(editJobSection).toContain('getModelGenerationParams');
  });

  it('should apply model defaults in processVariationJob', () => {
    const source = getQueueProcessorSource();

    // Find processVariationJob function
    const variationJobStart = source.indexOf('async function processVariationJob');
    expect(variationJobStart).toBeGreaterThan(-1);

    // Verify modelParams is retrieved
    const variationJobSection = source.substring(variationJobStart, variationJobStart + 1000);
    expect(variationJobSection).toContain('getModelGenerationParams');
  });
});

describe('Z-Image-Turbo Settings Values', () => {
  it('should set cfg_scale to 0.0 for z-image-turbo', () => {
    const source = getModelsZTurboYmlSource();

    // Extract z-image-turbo section
    const turboSection = source.substring(
      source.indexOf('z-image-turbo:')
    );

    // Verify cfg_scale is set to 0.0
    expect(turboSection).toContain('cfg_scale: 0.0');

    // Verify the comment explains why
    expect(turboSection).toContain("doesn't rely on classifier-free guidance");
  });

  it('should set sample_steps to 9 for z-image-turbo', () => {
    const source = getModelsZTurboYmlSource();

    // Extract z-image-turbo section
    const turboSection = source.substring(
      source.indexOf('z-image-turbo:')
    );

    // Verify sample_steps is set to 9
    expect(turboSection).toContain('sample_steps: 9');

    // Verify the comment explains why
    expect(turboSection).toContain('Ultra-fast distilled model');
  });

  it('should set sampling_method to euler for z-image-turbo', () => {
    const source = getModelsZTurboYmlSource();

    // Extract z-image-turbo section
    const turboSection = source.substring(
      source.indexOf('z-image-turbo:')
    );

    // Verify sampling_method is set to euler
    expect(turboSection).toContain('sampling_method: "euler"');
  });
});

describe('CLI Handler Integration', () => {
  it('should pass cfg_scale and sample_steps to CLI command', () => {
    const source = getQueueProcessorSource();

    // Verify params are passed to CLI handler (updated signature includes genLogger)
    expect(source).toContain('processCLIGeneration(job, modelConfig, params, genLogger)');
  });

  it('should build CLI command with cfg-scale and steps flags', () => {
    const cliHandlerPath = join(__dirname, '../backend/services/cliHandler.js');
    const cliSource = readFileSync(cliHandlerPath, 'utf-8');

    // Verify cfg-scale is added
    expect(cliSource).toContain('--cfg-scale');
    expect(cliSource).toContain("cmd.push('--cfg-scale', cfgScale.toString())");

    // Verify steps is added
    expect(cliSource).toContain('--steps');
    expect(cliSource).toContain("cmd.push('--steps', steps.toString())");
  });
});

describe('HTTP API Integration', () => {
  it('should pass cfg_scale and sample_steps in HTTP extraArgs', () => {
    const source = getQueueProcessorSource();

    // Verify extraArgs includes cfg_scale and sample_steps
    expect(source).toContain('extraArgs.cfg_scale = params.cfg_scale');
    expect(source).toContain('extraArgs.sample_steps = params.sample_steps');
  });

  it('should include extraArgs in prompt for HTTP API', () => {
    const source = getQueueProcessorSource();

    // Verify extraArgs is added to prompt
    expect(source).toContain('<sd_cpp_extra_args>');
    expect(source).toContain('JSON.stringify(extraArgs)');
  });
});
