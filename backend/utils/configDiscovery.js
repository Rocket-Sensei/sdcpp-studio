/**
 * Configuration file discovery utilities
 */

import fs from 'fs';
import path from 'path';

// Files that are NOT model configs (loaded in specific order)
const NON_MODEL_CONFIGS = ['settings.yml', 'settings.local.yml', 'upscalers.yml'];

/**
 * Auto-discover all YAML config files in a directory
 * @param {string} configDir - Configuration directory path
 * @param {string} defaultConfigPath - Fallback config path if directory doesn't exist
 * @returns {Array<string>} Array of config file paths in load order
 */
export function discoverConfigFiles(configDir, defaultConfigPath) {
  // Fall back to single config if directory doesn't exist
  if (!fs.existsSync(configDir)) {
    return [defaultConfigPath];
  }

  const files = fs.readdirSync(configDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

  // Separate into special configs and model configs
  const specialConfigs = [];
  const modelConfigs = [];

  for (const file of files) {
    if (NON_MODEL_CONFIGS.includes(file)) {
      specialConfigs.push(file);
    } else {
      modelConfigs.push(file);
    }
  }

  // Sort: settings.yml first, upscalers.yml second, then model configs alphabetically
  specialConfigs.sort((a, b) => {
    if (a === 'settings.yml') return -1;
    if (b === 'settings.yml') return 1;
    if (a === 'upscalers.yml') return -1;
    if (b === 'upscalers.yml') return 1;
    return a.localeCompare(b);
  });

  modelConfigs.sort();

  const allConfigs = [...specialConfigs, ...modelConfigs];
  return allConfigs.map(f => path.join(configDir, f));
}

/**
 * Check if a file is a non-model config (settings, upscalers, etc.)
 * @param {string} filename - Filename to check
 * @returns {boolean} True if it's a non-model config
 */
export function isNonModelConfig(filename) {
  return NON_MODEL_CONFIGS.includes(filename);
}
