/**
 * Memory flag merging utilities for model arguments
 */

// Boolean flag mappings
const FLAG_MAP = {
  offload_to_cpu: '--offload-to-cpu',
  clip_on_cpu: '--clip-on-cpu',
  vae_on_cpu: '--vae-on-cpu',
  vae_tiling: '--vae-tiling',
  diffusion_fa: '--diffusion-fa',
  vae_conv_direct: '--vae-conv-direct',
};

// Value flag mappings
const VALUE_FLAG_MAP = {
  vae_tile_size: '--vae-tile-size',
};

/**
 * Merge memory default flags into model args
 * Priority: per-model memory_overrides > global memory_defaults
 * Only adds flags that aren't already present in args
 * @param {Array} args - Model arguments array
 * @param {Object} memoryDefaults - Global memory defaults
 * @param {Object} memoryOverrides - Per-model memory overrides (optional)
 * @returns {Array} Args with memory flags merged in
 */
export function mergeMemoryFlags(args, memoryDefaults, memoryOverrides = {}) {
  // Merge: per-model overrides take precedence over global defaults
  const effectiveFlags = {
    ...memoryDefaults,
    ...memoryOverrides,
  };

  const mergedArgs = [...args];

  // Add boolean flags
  for (const [key, cliFlag] of Object.entries(FLAG_MAP)) {
    if (effectiveFlags[key] === true && !mergedArgs.includes(cliFlag)) {
      mergedArgs.push(cliFlag);
    }
  }

  // Add value flags
  for (const [key, cliFlag] of Object.entries(VALUE_FLAG_MAP)) {
    if (effectiveFlags[key] !== undefined && effectiveFlags[key] !== false && !mergedArgs.includes(cliFlag)) {
      mergedArgs.push(cliFlag, String(effectiveFlags[key]));
    }
  }

  return mergedArgs;
}

/**
 * Get effective memory flags for a model (merged defaults + overrides)
 * @param {Object} memoryDefaults - Global memory defaults
 * @param {Object} memoryOverrides - Per-model memory overrides (optional)
 * @returns {Object} Effective memory flags
 */
export function getEffectiveMemoryFlags(memoryDefaults, memoryOverrides = {}) {
  return {
    ...memoryDefaults,
    ...memoryOverrides,
  };
}
