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

/**
 * Helper function to extract filename from model args
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
 * Helper function to get file status for a model with HuggingFace config
 * @param {Object} model - The model object
 * @returns {Promise<Object|null>} File status object with { hasHuggingFace, allFilesExist, files[] }
 */
export async function getModelFileStatus(model) {
  if (!model.huggingface || !model.huggingface.files) {
    return {
      hasHuggingFace: false,
      files: []
    };
  }

  const { existsSync } = await import('fs');

  // Get project root path (backend/..)
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

  // Check each file
  const fileStatus = model.huggingface.files.map(file => {
    // Use the dest from config, or fall back to MODELS_DIR env, or ./models
    const destDir = file.dest || process.env.MODELS_DIR || './models';

    // Resolve the path from the project root
    const resolvedDestDir = resolve(projectRoot, destDir);
    const fileName = basename(file.path);
    const filePath = join(resolvedDestDir, fileName);
    const exists = existsSync(filePath);

    return {
      path: file.path,
      dest: file.dest,
      filePath,
      resolvedDestDir,
      exists,
      fileName
    };
  });

  return {
    hasHuggingFace: true,
    allFilesExist: fileStatus.every(f => f.exists),
    files: fileStatus
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

  // Try to find by name match (case-insensitive, partial match)
  const allModels = modelManager.getAllModels();
  const found = allModels.find(m =>
    m.name.toLowerCase() === modelNameOrId.toLowerCase() ||
    m.id.toLowerCase() === modelNameOrId.toLowerCase() ||
    m.name.toLowerCase().includes(modelNameOrId.toLowerCase()) ||
    modelNameOrId.toLowerCase().includes(m.name.toLowerCase())
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
  getModelTypeFromFilename,
  getModelFileStatus,
  findModelIdByName,
  SD_SAMPLERS
};
