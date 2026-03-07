/**
 * Backend Registry Service
 *
 * Manages backend presets that can be shared across multiple models.
 * Allows defining common command-line arguments once and reusing them.
 *
 * Example backends.yml:
 * backends:
 *   sd-server:
 *     command: "./bin/sd-server"
 *     exec_mode: "server"
 *     base_args:
 *       - "-v"
 *       - "--offload-to-cpu"
 *       - "--clip-on-cpu"
 *     mode: "on_demand"
 *     
 *   llama-server:
 *     command: "./bin/llama-server"
 *     exec_mode: "server"
 *     mode: "on_demand"
 *     config_file: "./config/llm-models.ini"
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('backendRegistry');

/**
 * Maps model file fields to command-line argument flags
 */
const ARGUMENT_MAP = {
  // Model files
  model_file: '--diffusion-model',
  diffusion_model: '--diffusion-model',
  
  // VAE files
  vae: '--vae',
  vae_file: '--vae',
  
  // CLIP files
  clip_l: '--clip_l',
  clip_l_file: '--clip_l',
  
  // T5XXL files
  t5xxl: '--t5xxl',
  t5xxl_file: '--t5xxl',
  
  // Qwen2VL files
  qwen2vl: '--qwen2vl',
  qwen2vl_file: '--qwen2vl',
  
  // CLIP Vision files
  clip_vision: '--clip_vision',
  clip_vision_file: '--clip_vision',
  
  // LLM vision model projector files (for llama-server)
  mmproj: '--mmproj',
  mmproj_file: '--mmproj',
};

/**
 * Backend Registry class
 */
export class BackendRegistry {
  constructor(configPath = null) {
    this.configPath = configPath || this._getDefaultConfigPath();
    this.backends = new Map();
    this.loaded = false;
  }

  /**
   * Get default config path
   * @private
   */
  _getDefaultConfigPath() {
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    return path.join(__dirname, '../config/backends.yml');
  }

  /**
   * Load backend presets from configuration file
   * @returns {boolean} True if loaded successfully
   */
  loadConfig() {
    try {
      if (!fs.existsSync(this.configPath)) {
        logger.info({ configPath: this.configPath }, 'Backend config not found, skipping');
        return false;
      }

      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(fileContent);

      if (!config || !config.backends) {
        logger.warn({ configPath: this.configPath }, 'No backends defined in config');
        return false;
      }

      this.backends.clear();

      for (const [backendId, backendConfig] of Object.entries(config.backends)) {
        // Validate required fields
        if (!backendConfig.command) {
          logger.warn({ backendId }, 'Backend missing command, skipping');
          continue;
        }

        // Normalize base_args to array
        if (!backendConfig.base_args) {
          backendConfig.base_args = [];
        } else if (!Array.isArray(backendConfig.base_args)) {
          logger.warn({ backendId }, 'Backend base_args is not an array, converting');
          backendConfig.base_args = [backendConfig.base_args];
        }

        this.backends.set(backendId, {
          id: backendId,
          ...backendConfig
        });

        logger.debug({ backendId, command: backendConfig.command }, 'Loaded backend preset');
      }

      this.loaded = true;
      logger.info({ count: this.backends.size }, 'Backend presets loaded');
      return true;

    } catch (error) {
      logger.error({ error, configPath: this.configPath }, 'Failed to load backend config');
      return false;
    }
  }

  /**
   * Get a backend preset by ID
   * @param {string} backendId - Backend identifier
   * @returns {Object|null} Backend configuration or null
   */
  getBackend(backendId) {
    if (!this.loaded) {
      this.loadConfig();
    }
    return this.backends.get(backendId) || null;
  }

  /**
   * Get all backend presets
   * @returns {Array} Array of backend configurations
   */
  getAllBackends() {
    if (!this.loaded) {
      this.loadConfig();
    }
    return Array.from(this.backends.values());
  }

  /**
   * Check if a backend exists
   * @param {string} backendId - Backend identifier
   * @returns {boolean}
   */
  hasBackend(backendId) {
    if (!this.loaded) {
      this.loadConfig();
    }
    return this.backends.has(backendId);
  }

  /**
   * Build argument array from model file fields
   * @param {Object} modelConfig - Model configuration with file fields
   * @returns {Array} Array of argument strings
   */
  buildModelArgs(modelConfig) {
    const args = [];

    for (const [field, argName] of Object.entries(ARGUMENT_MAP)) {
      if (modelConfig[field]) {
        args.push(argName, modelConfig[field]);
      }
    }

    return args;
  }

  /**
   * Resolve a model configuration by merging with its backend preset
   * @param {Object} modelConfig - Raw model configuration
   * @returns {Object} Resolved model configuration with merged args
   */
  resolveModelConfig(modelConfig) {
    // If no backend specified, return as-is (backward compatibility)
    if (!modelConfig.backend) {
      return modelConfig;
    }

    const backend = this.getBackend(modelConfig.backend);
    if (!backend) {
      logger.warn({ 
        modelId: modelConfig.id, 
        backend: modelConfig.backend 
      }, 'Backend not found, using model config as-is');
      return modelConfig;
    }

    // Start with backend configuration
    const resolved = {
      ...backend,
      ...modelConfig,
      // Override with model-specific values
      command: modelConfig.command || backend.command,
      exec_mode: modelConfig.exec_mode || backend.exec_mode,
      mode: modelConfig.mode || backend.mode,
    };

    // Build args: backend base_args + model file args + model-specific args
    const modelFileArgs = this.buildModelArgs(modelConfig);
    const backendArgs = backend.base_args || [];
    const modelArgs = modelConfig.args || [];

    // Merge args: backend base first, then model files, then explicit args
    // Model args override backend args for the same flags
    const argsMap = new Map();
    
    // Add backend args
    for (let i = 0; i < backendArgs.length; i++) {
      const arg = backendArgs[i];
      if (arg.startsWith('--')) {
        // Check if next item is a value (not a flag)
        if (i + 1 < backendArgs.length && !backendArgs[i + 1].startsWith('--')) {
          argsMap.set(arg, backendArgs[i + 1]);
          i++; // Skip the value
        } else {
          argsMap.set(arg, true); // Flag without value
        }
      } else if (arg === '-v' || arg === '--verbose') {
        argsMap.set('-v', true);
      }
    }

    // Add model file args (these override backend args)
    for (let i = 0; i < modelFileArgs.length; i += 2) {
      if (i + 1 < modelFileArgs.length) {
        argsMap.set(modelFileArgs[i], modelFileArgs[i + 1]);
      }
    }

    // Add explicit model args (highest priority)
    for (let i = 0; i < modelArgs.length; i++) {
      const arg = modelArgs[i];
      if (arg.startsWith('--')) {
        // Check if next item is a value
        if (i + 1 < modelArgs.length && !modelArgs[i + 1].startsWith('--')) {
          argsMap.set(arg, modelArgs[i + 1]);
          i++; // Skip the value
        } else {
          argsMap.set(arg, true);
        }
      } else if (arg === '-v' || arg === '--verbose') {
        argsMap.set('-v', true);
      }
    }

    // Convert map back to array
    resolved.args = [];
    for (const [key, value] of argsMap) {
      resolved.args.push(key);
      if (value !== true) {
        resolved.args.push(String(value));
      }
    }

    logger.debug({ 
      modelId: modelConfig.id, 
      backend: backend.id,
      argCount: resolved.args.length 
    }, 'Resolved model config with backend');

    return resolved;
  }
}

/**
 * Singleton instance
 */
let singletonInstance = null;

/**
 * Get or create singleton BackendRegistry instance
 * @param {string} configPath - Optional config path
 * @returns {BackendRegistry} Singleton instance
 */
export function getBackendRegistry(configPath = null) {
  if (!singletonInstance) {
    singletonInstance = new BackendRegistry(configPath);
  }
  return singletonInstance;
}

/**
 * Create a new BackendRegistry instance
 * @param {string} configPath - Optional config path
 * @returns {BackendRegistry} New instance
 */
export function createBackendRegistry(configPath = null) {
  return new BackendRegistry(configPath);
}

export default BackendRegistry;
