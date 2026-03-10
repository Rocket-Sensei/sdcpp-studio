import path from 'path';
import { fileURLToPath } from 'url';
import { resolve, dirname, basename, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Derive model type from model name or configuration
 * @param {Object} model - Model configuration object
 * @returns {string} Model type (sdxl, sd15, etc.)
 */
export function deriveModelType(model) {
  if (!model) {
    return 'sd15';
  }

  // Check model name for XL indicators
  const name = (model.name || '').toLowerCase();
  if (name.includes('xl') || name.includes('sdxl')) {
    return 'sdxl';
  }

  // Check model_type in config
  if (model.model_type) {
    const modelType = model.model_type.toLowerCase();
    if (modelType.includes('xl') || modelType.includes('sdxl')) {
      return 'sdxl';
    }
  }

  // Check exec_mode for API models
  if (model.exec_mode === 'api' && model.api) {
    const api = model.api.toLowerCase();
    if (api.includes('xl') || api.includes('sdxl')) {
      return 'sdxl';
    }
  }

  // Default to sd15
  return 'sd15';
}

/**
 * Extract model file path from model args
 * Looks for --diffusion-model, --model, or -m flag values
 * @param {Object} model - Model configuration object
 * @returns {string|null} Model file path or null
 */
export function extractModelPath(model) {
  if (!model || !model.args || !Array.isArray(model.args)) {
    return null;
  }

  return extractFilenameFromArgs(model.args);
}

const FILE_FLAGS = [
  '--diffusion-model',
  '--model',
  '-m',
  '--vae',
  '--llm',
  '--llm_vision',
  '--clip_l',
  '--t5xxl',
  '--clip',
  '--clip_g',
  '--clip_vision',
  '--embeddings',
  '--text_encoder',
  '--tokenizer',
  '--mmdit'
];

/**
 * Extract file paths from model args
 * @param {Array} args - Model arguments array
 * @returns {Array} Array of file objects with { flag, path }
 */
export function extractFilesFromArgs(args) {
  if (!args || !Array.isArray(args)) {
    return [];
  }

  const files = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (FILE_FLAGS.includes(arg) && i + 1 < args.length) {
      const filePath = args[i + 1];
      if (filePath && (filePath.startsWith('./') || filePath.startsWith('/') || filePath.includes('.'))) {
        files.push({
          flag: arg,
          path: filePath
        });
      }
    }
  }

  return files;
}

/**
 * Extract only the main model filename from args (for backward compatibility)
 * Looks for --diffusion-model, --model, or -m flag values
 * @param {Array} args - Model arguments array
 * @returns {string|null} Extracted filename or null
 */
export function extractFilenameFromArgs(args) {
  if (!args || !Array.isArray(args)) {
    return null;
  }

  // Look for --diffusion-model flag
  const diffIndex = args.indexOf('--diffusion-model');
  if (diffIndex !== -1 && diffIndex + 1 < args.length) {
    return args[diffIndex + 1];
  }

  // Look for --model flag (used by some models like sd15-base)
  const modelIndex = args.indexOf('--model');
  if (modelIndex !== -1 && modelIndex + 1 < args.length) {
    return args[modelIndex + 1];
  }

  // Look for -m flag (used by some CLI models)
  const mIndex = args.indexOf('-m');
  if (mIndex !== -1 && mIndex + 1 < args.length) {
    return args[mIndex + 1];
  }

  return null;
}

/**
 * Helper function to determine model type from filename extension
 * @param {string} filename - Model filename
 * @returns {string|null} Model type (safetensors, ckpt, gguf, diffusers, etc.)
 */
export function getModelTypeFromFilename(filename) {
  if (!filename) {
    return null;
  }

  const ext = path.extname(filename).toLowerCase();

  const typeMap = {
    '.safetensors': 'safetensors',
    '.ckpt': 'ckpt',
    '.gguf': 'gguf',
    '.pt': 'pt',
    '.pth': 'pth',
    '.bin': 'diffusers'
  };

  return typeMap[ext] || null;
}

/**
 * Extract quantization from model filename
 * Supports GGUF quant types (Q2_K, Q3_K_S, Q4_K_M, Q5_0, Q5_1, Q6_K, Q8_0, etc.)
 * and safetensors fp8/fp16 variants
 * @param {string} filename - Model filename (e.g., "flux1-schnell-Q8_0.gguf")
 * @returns {string|null} Quant string (e.g., "Q8_0", "fp16", "unknown")
 */
export function extractQuantFromFilename(filename) {
  if (!filename) {
    return 'unknown';
  }

  const name = path.basename(filename).toUpperCase();

  const ggufQuantMatch = name.match(/-([QFP]\d+_[A-Z0-9_]+)\./i);
  if (ggufQuantMatch) {
    return ggufQuantMatch[1].toUpperCase();
  }

  const ggufSimpleMatch = name.match(/-([QFP]\d+)\./i);
  if (ggufSimpleMatch) {
    return ggufSimpleMatch[1].toUpperCase();
  }

  if (name.includes('FP16') || name.includes('F16')) {
    return 'fp16';
  }

  if (name.includes('FP8') || name.includes('F8')) {
    return 'fp8';
  }

  return 'unknown';
}

/**
 * Top-level config fields that point to model files.
 * Matches the ARGUMENT_MAP in backendRegistry.js so we can detect files
 * from model configs that use field-based declarations (e.g. model_file, vae)
 * rather than explicit args arrays.
 */
const CONFIG_FILE_FIELDS = {
  model_file: '--diffusion-model',
  diffusion_model: '--diffusion-model',
  vae: '--vae',
  vae_file: '--vae',
  clip_l: '--clip_l',
  clip_l_file: '--clip_l',
  t5xxl: '--t5xxl',
  t5xxl_file: '--t5xxl',
  qwen2vl: '--qwen2vl',
  qwen2vl_file: '--qwen2vl',
  clip_vision: '--clip_vision',
  clip_vision_file: '--clip_vision',
  mmproj: '--mmproj',
  mmproj_file: '--mmproj',
};

/**
 * Helper function to get file status for a model
 * Priority: 1) model.args file flags  2) top-level config file fields  3) huggingface.files
 * Models with exec_mode=api and no detectable files are treated as present (external).
 * All other models with no detectable files are treated as NOT present.
 * @param {Object} model - The model object
 * @returns {Promise<Object|null>} File status object with { hasHuggingFace, allFilesExist, files[], source }
 */
export async function getModelFileStatus(model) {
  const { existsSync } = await import('fs');

  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

  let fileList = [];
  let source = null;

  // 1) Extract files from model.args (post-resolution, these include merged backend args)
  if (model.args && Array.isArray(model.args)) {
    const argsFiles = extractFilesFromArgs(model.args);
    if (argsFiles.length > 0) {
      fileList = argsFiles;
      source = 'args';
    }
  }

  // 2) Check top-level config file fields (model_file, vae, mmproj, etc.)
  if (fileList.length === 0) {
    for (const [field, flag] of Object.entries(CONFIG_FILE_FIELDS)) {
      if (model[field] && typeof model[field] === 'string') {
        fileList.push({ flag, path: model[field] });
      }
    }
    if (fileList.length > 0) {
      source = 'config';
    }
  }

  // 3) Fall back to huggingface.files
  if (fileList.length === 0 && model.huggingface && model.huggingface.files) {
    fileList = model.huggingface.files.map(f => ({ flag: 'huggingface', path: f.path, dest: f.dest }));
    source = 'huggingface';
  }

  // No files detected
  if (fileList.length === 0) {
    // API/external models with no local files are treated as available
    const isExternal = model.exec_mode === 'api' || !!(model.api && !model.command);
    return {
      hasHuggingFace: false,
      allFilesExist: isExternal,
      files: [],
      source: null
    };
  }

  // Check each file on disk
  const fileStatus = fileList.map(file => {
    let resolvedDestDir;
    let filePath;
    let fileName;

    if (source === 'huggingface') {
      const destDir = file.dest || process.env.MODELS_DIR || './models';
      resolvedDestDir = resolve(projectRoot, destDir);
      fileName = basename(file.path);
      filePath = join(resolvedDestDir, fileName);
    } else {
      // Args/config files - resolve relative to project root
      const fileArg = file.path;
      resolvedDestDir = resolve(projectRoot, dirname(fileArg));
      fileName = basename(fileArg);
      filePath = resolve(projectRoot, fileArg);
    }

    const exists = existsSync(filePath);

    return {
      path: file.path,
      flag: file.flag,
      filePath,
      resolvedDestDir,
      exists,
      fileName
    };
  });

  return {
    hasHuggingFace: source === 'huggingface',
    allFilesExist: fileStatus.every(f => f.exists),
    files: fileStatus,
    source
  };
}

/**
 * Find model ID by name (for SD.next/SillyTavern compatibility)
 * @param {string} modelNameOrId - Model name or ID
 * @param {Object} modelManager - Model manager instance
 * @returns {string|null} Model ID or null
 */
export function findModelIdByName(modelNameOrId, modelManager) {
  if (!modelNameOrId) return null;

  // First try as-is (might already be an ID)
  const model = modelManager.getModel(modelNameOrId);
  if (model) return modelNameOrId;

  // Try to find by exact name match only (case-insensitive)
  // This ensures "Unstable Revolution FLUX.2 Klein 4B" doesn't match "FLUX.2 Klein 4B"
  const allModels = modelManager.getAllModels();
  const found = allModels.find(m =>
    m.name.toLowerCase() === modelNameOrId.toLowerCase() ||
    m.id.toLowerCase() === modelNameOrId.toLowerCase()
  );
  return found?.id || null;
}

/**
 * SD.cpp supported samplers mapped to SD.next-style names
 */
export const SD_SAMPLERS = [
  { name: 'Euler', aliases: ['euler'], options: {} },
  { name: 'Euler a', aliases: ['euler_a', 'Euler Ancestral'], options: {} },
  { name: 'DDIM', aliases: ['ddim'], options: {} },
  { name: 'PLMS', aliases: ['plms'], options: {} },
  { name: 'DPM++ 2M', aliases: ['dpmpp_2m', 'DPM++ 2M Karras'], options: {} },
  { name: 'DPM++ 2S a', aliases: ['dpmpp_2s_a', 'DPM++ 2S Ancestral', 'DPM++ 2S Ancestral Karras'], options: {} },
  { name: 'DPM++ SDE', aliases: ['dpmpp_sde', 'DPM++ SDE Karras'], options: {} },
  { name: 'DPM Fast', aliases: ['dpm_fast'], options: {} },
  { name: 'DPM Adaptive', aliases: ['dpm_adaptive'], options: {} },
  { name: 'LCM', aliases: ['lcm'], options: {} },
  { name: 'TCD', aliases: ['tcd'], options: {} },
  { name: 'Heun', aliases: ['heun'], options: {} },
  { name: 'DPM2', aliases: ['dpm2'], options: {} },
  { name: 'DPM2 a', aliases: ['dpm2_a', 'DPM2 Ancestral'], options: {} },
  { name: 'UniPC', aliases: ['unipc'], options: {} },
  { name: 'LMS', aliases: ['lms'], options: {} },
  { name: 'LMS Karras', aliases: ['lms_karras'], options: {} },
];

export default {
  deriveModelType,
  extractModelPath,
  extractFilenameFromArgs,
  extractFilesFromArgs,
  getModelTypeFromFilename,
  getModelFileStatus,
  findModelIdByName,
  SD_SAMPLERS
};
