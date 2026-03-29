/**
 * Memory usage calculator for stable-diffusion.cpp
 *
 * Estimates VRAM/RAM requirements for a given model configuration,
 * image size, and CLI flags.
 */

import { extractQuantFromFilename } from '../utils/modelHelpers.js';


/**
 * GGUF quantization type metadata
 * @type {Object.<string, {typeSize: number, blockSize: number, bpw: number}>}
 */
export const GGUF_QUANT_TYPES = {
  'F32':      { typeSize: 4,   blockSize: 1,   bpw: 32.0 },
  'F16':      { typeSize: 2,   blockSize: 1,   bpw: 16.0 },
  'BF16':     { typeSize: 2,   blockSize: 1,   bpw: 16.0 },
  'Q8_0':     { typeSize: 34,  blockSize: 32,  bpw: 8.5 },
  'Q8_K':     { typeSize: 292, blockSize: 256, bpw: 9.125 },
  'Q6_K':     { typeSize: 210, blockSize: 256, bpw: 6.5625 },
  'Q5_K':     { typeSize: 176, blockSize: 256, bpw: 5.5 },
  'Q5_0':     { typeSize: 22,  blockSize: 32,  bpw: 5.5 },
  'Q4_K':     { typeSize: 144, blockSize: 256, bpw: 4.5 },
  'Q4_0':     { typeSize: 18,  blockSize: 32,  bpw: 4.5 },
  'IQ4_XS':   { typeSize: 136, blockSize: 256, bpw: 4.25 },
  'IQ4_NL':   { typeSize: 18,  blockSize: 32,  bpw: 4.5 },
  'Q3_K':     { typeSize: 110, blockSize: 256, bpw: 3.4375 },
  'IQ3_S':    { typeSize: 110, blockSize: 256, bpw: 3.4375 },
  'IQ3_XXS':  { typeSize: 98,  blockSize: 256, bpw: 3.0625 },
  'Q2_K':     { typeSize: 84,  blockSize: 256, bpw: 2.625 },
  'IQ2_S':    { typeSize: 82,  blockSize: 256, bpw: 2.5625 },
  'IQ2_XS':   { typeSize: 74,  blockSize: 256, bpw: 2.3125 },
  'IQ2_XXS':  { typeSize: 66,  blockSize: 256, bpw: 2.0625 },
  'IQ1_M':    { typeSize: 56,  blockSize: 256, bpw: 1.75 },
  'IQ1_S':    { typeSize: 50,  blockSize: 256, bpw: 1.5625 },
};


/**
 * Aliases for mixed-quant naming convention (e.g., Q4_K_M -> Q4_K base)
 * @type {Object.<string, string>}
 */
export const QUANT_ALIASES = {
  'Q2_K':   'Q2_K',
  'Q3_K_S': 'Q3_K',
  'Q3_K_M': 'Q3_K',
  'Q3_K_L': 'Q3_K',
  'Q4_K_S': 'Q4_K',
  'Q4_K_M': 'Q4_K',
  'Q5_K_S': 'Q5_K',
  'Q5_K_M': 'Q5_K',
  'Q5_0':   'Q5_0',
  'Q5_1':   'Q5_0',  // approximate
  'Q6_K':   'Q6_K',
  'Q8_0':   'Q8_0',
  'F16':    'F16',
  'FP16':   'F16',
  'BF16':   'BF16',
  'F32':    'F32',
  'FP32':   'F32',
};


/**
 * Known model architectures with their key parameters.
 *
 * Fields:
 *   params          - approximate total parameter count of diffusion model
 *   textEncoders    - array of { name, params } for each text encoder
 *   vaeParams       - approximate VAE parameter count
 *   vaeScaleFactor  - spatial downscale factor of the VAE
 *   patchSize       - patch embedding size for DiT models (1 for UNet)
 *   vaeChMult       - channel multipliers in the VAE decoder
 *   vaeCh           - base channel count in VAE decoder
 *   defaultWidth    - typical generation width
 *   defaultHeight   - typical generation height
 *
 * @type {Object.<string, {params: number, textEncoders: Array<{name: string, params: number}>, vaeParams: number, vaeScaleFactor: number, patchSize: number, vaeCh: number, vaeChMult: number[], defaultWidth: number, defaultHeight: number}>}
 */
export const ARCHITECTURES = {
  // ---- Stable Diffusion 1.5 ----
  'sd1.5': {
    params: 860_000_000,
    textEncoders: [
      { name: 'CLIP-L', params: 123_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 8,
    patchSize: 1,    // UNet (no patch embedding)
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 512,
    defaultHeight: 512,
  },

  // ---- SDXL ----
  'sdxl': {
    params: 2_600_000_000,
    textEncoders: [
      { name: 'CLIP-L', params: 123_000_000 },
      { name: 'CLIP-G', params: 695_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 8,
    patchSize: 1,
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 1024,
    defaultHeight: 1024,
  },

  // ---- SD3 (MMDiT) ----
  'sd3': {
    params: 2_000_000_000,
    textEncoders: [
      { name: 'CLIP-L', params: 123_000_000 },
      { name: 'CLIP-G', params: 695_000_000 },
      { name: 'T5-XXL', params: 4_760_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 8,
    patchSize: 2,
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 1024,
    defaultHeight: 1024,
  },

  // ---- Flux.1 (Dev / Schnell) ----
  'flux1': {
    params: 12_000_000_000,
    textEncoders: [
      { name: 'CLIP-L', params: 123_000_000 },
      { name: 'T5-XXL', params: 4_760_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 8,
    patchSize: 2,
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 1024,
    defaultHeight: 1024,
  },

  // ---- Flux2 / Flux2 Klein ----
  'flux2': {
    params: 12_000_000_000,
    textEncoders: [
      { name: 'CLIP-L', params: 123_000_000 },
      { name: 'T5-XXL', params: 4_760_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 16,
    patchSize: 1,
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 1024,
    defaultHeight: 1024,
  },

  'flux2-klein': {
    params: 4_000_000_000,
    textEncoders: [
      { name: 'CLIP-L', params: 123_000_000 },
      { name: 'T5-XXL', params: 4_760_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 16,
    patchSize: 1,
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 1024,
    defaultHeight: 1024,
  },

  // ---- Z-Image ----
  'z-image': {
    params: 8_000_000_000,
    textEncoders: [
      { name: 'Qwen3-4B', params: 4_020_000_000 },
    ],
    vaeParams: 83_000_000,
    vaeScaleFactor: 16,
    patchSize: 2,
    vaeCh: 128,
    vaeChMult: [1, 2, 4, 4],
    defaultWidth: 1024,
    defaultHeight: 1024,
  },
};


/**
 * Get bits-per-weight for a quantization type string.
 * Handles aliases like "Q4_K_M" -> Q4_K -> 4.5 bpw.
 *
 * @param {string} quantType - GGUF quantization type (e.g., "Q4_K_M")
 * @returns {number} Bits per weight
 * @throws {Error} If quant type is unknown
 */
export function getBitsPerWeight(quantType) {
  const upperQuantType = quantType.toUpperCase();
  const normalized = QUANT_ALIASES[upperQuantType] || upperQuantType;
  const info = GGUF_QUANT_TYPES[normalized];
  if (!info) throw new Error(`Unknown quant type: ${quantType}`);
  return info.bpw;
}


/**
 * Estimate model file size given parameter count and quantization.
 *
 * @param {number} params - Total parameter count
 * @param {string} quantType - GGUF quantization type (e.g., "Q4_K_M")
 * @returns {number} Size in bytes
 */
export function estimateModelSize(params, quantType) {
  const bpw = getBitsPerWeight(quantType);
  return params * bpw / 8;
}


/**
 * Estimate VAE decode compute buffer size for a given output image size.
 *
 * The VAE decoder has 4 upsampling stages. The compute buffer is dominated by
 * conv2d intermediate tensors at each resolution. We model this empirically
 * with a per-architecture constant K calibrated from observed values.
 *
 * The key insight: compute buffer scales linearly with total output pixels.
 * This is because the largest tensors are at the highest resolution stage
 * (channels * width * height * sizeof(float)), and they dominate the budget.
 *
 * @param {number} width - Output image width in pixels
 * @param {number} height - Output image height in pixels
 * @param {number} vaeScaleFactor - VAE spatial downscale factor (8 or 16)
 * @param {object} [options]
 * @param {boolean} [options.tiling=false] - Whether --vae-tiling is enabled
 * @param {number} [options.tileSize=32] - Tile size in latent pixels
 * @param {boolean} [options.convDirect=false] - Whether --vae-conv-direct is used
 * @returns {number} Estimated compute buffer size in bytes
 */
export function estimateVAEComputeBuffer(width, height, vaeScaleFactor, options = {}) {
  const { tiling = false, tileSize = 32, convDirect = false } = options;

  let K;
  if (vaeScaleFactor >= 16) {
    // Flux2 / Z-Image class (z_channels=32, vae_scale=16)
    K = 6656;  // bytes per output pixel (calibrated at 1024x1024)
  } else {
    // SD1.5 / SDXL / SD3 / Flux1 class (z_channels=4-16, vae_scale=8)
    K = 2560;  // bytes per output pixel (calibrated at 1024x1024)
  }

  if (convDirect) {
    // --vae-conv-direct reduces the im2col temporary buffer overhead.
    // Empirically saves ~20-30% on the compute buffer.
    K *= 0.75;
  }

  const outputPixels = width * height;

  if (tiling) {
    // With tiling, compute buffer is based on one tile, not the full image.
    // Tile output pixels = (tileSize * vaeScaleFactor)^2
    const tileOutputPixels = (tileSize * vaeScaleFactor) ** 2;
    return K * Math.min(tileOutputPixels, outputPixels);
  }

  return K * outputPixels;
}


/**
 * Estimate diffusion model compute buffer for one forward pass.
 *
 * DiT-based models: memory is dominated by attention and MLP intermediates
 * that scale with the number of tokens (latent patches).
 *
 * UNet-based models: memory is dominated by the conv layers at each
 * resolution level.
 *
 * @param {string} archKey - Key into ARCHITECTURES
 * @param {number} width - Output image width
 * @param {number} height - Output image height
 * @param {object} [options]
 * @param {boolean} [options.flashAttn=false] - Whether --diffusion-fa is used
 * @returns {number} Estimated compute buffer in bytes
 */
export function estimateDiffusionComputeBuffer(archKey, width, height, options = {}) {
  const { flashAttn = false } = options;
  const arch = ARCHITECTURES[archKey];
  if (!arch) throw new Error(`Unknown architecture: ${archKey}`);

  const latentW = width / arch.vaeScaleFactor;
  const latentH = height / arch.vaeScaleFactor;

  const isUNet = arch.patchSize === 1 && (archKey === 'sd1.5' || archKey === 'sdxl');

  if (isUNet) {
    // UNet compute buffer scales roughly with latent spatial size.
    // Conv layers at each resolution dominate.
    // Empirical: ~80 bytes per latent pixel for SD1.5 at 512x512
    const latentPixels = latentW * latentH;
    const K = archKey === 'sdxl' ? 100 : 80;
    return K * latentPixels * 4;  // 4 bytes per float
  }

  // DiT / Transformer architectures
  const tokens = (latentW / arch.patchSize) * (latentH / arch.patchSize);

  if (flashAttn) {
    // Flash attention: O(tokens) memory for attention, no full QK^T matrix.
    // Empirical: ~530 MB for Z-Image at 1024x1024 (1024 tokens, flash attn)
    //   -> ~530 * 1024^2 / 1024 = ~540672 bytes per token
    // This is rough; it includes MLP intermediates too.
    const bytesPerToken = 540_000;
    return tokens * bytesPerToken;
  } else {
    // Standard attention: O(tokens^2) for the attention matrix.
    // The attention matrix per head = tokens * tokens * sizeof(float)
    // Plus MLP intermediates ≈ O(tokens * hidden_size)
    // Empirical approximation:
    const bytesPerTokenLinear = 300_000;
    const bytesPerTokenPairQuadratic = 4;  // per-head attention entry
    const numHeads = 24;  // approximate
    return tokens * bytesPerTokenLinear +
           tokens * tokens * numHeads * bytesPerTokenPairQuadratic;
  }
}


/**
 * Calculate estimated VRAM and RAM usage for image generation.
 *
 * @param {object} config
 * @param {string} config.arch - Architecture key (e.g., 'flux1', 'z-image')
 * @param {string} config.diffusionQuant - Quant type for diffusion model
 * @param {string} [config.textEncoderQuant='F16'] - Quant type for text encoders
 * @param {string} [config.vaeQuant='F32'] - Quant type for VAE (usually F32 or F16)
 * @param {number} config.width - Output image width
 * @param {number} config.height - Output image height
 * @param {object} [config.flags] - CLI flags
 * @param {boolean} [config.flags.offloadToCpu=false]
 * @param {boolean} [config.flags.clipOnCpu=false]
 * @param {boolean} [config.flags.vaeOnCpu=false]
 * @param {boolean} [config.flags.vaeTiling=false]
 * @param {number} [config.flags.vaeTileSize=32]
 * @param {boolean} [config.flags.vaeConvDirect=false]
 * @param {boolean} [config.flags.diffusionFlashAttn=false]
 *
 * @returns {object} Memory estimation breakdown
 */
export function calculateMemoryUsage(config) {
  const {
    arch: archKey,
    diffusionQuant,
    textEncoderQuant = 'F16',
    vaeQuant = 'F32',
    width,
    height,
    flags = {},
  } = config;

  const {
    offloadToCpu = false,
    clipOnCpu = false,
    vaeOnCpu = false,
    vaeTiling = false,
    vaeTileSize = 32,
    vaeConvDirect = false,
    diffusionFlashAttn = false,
  } = flags;

  const arch = ARCHITECTURES[archKey];
  if (!arch) throw new Error(`Unknown architecture: ${archKey}`);

  const MB = 1024 * 1024;

  // --- Model weight sizes ---

  const diffusionParamsBytes = estimateModelSize(arch.params, diffusionQuant);
  const textEncoderParamsBytes = arch.textEncoders.reduce(
    (sum, enc) => sum + estimateModelSize(enc.params, textEncoderQuant),
    0
  );
  const vaeParamsBytes = estimateModelSize(arch.vaeParams, vaeQuant);

  // --- Compute buffer sizes ---

  const diffusionComputeBytes = estimateDiffusionComputeBuffer(
    archKey, width, height,
    { flashAttn: diffusionFlashAttn }
  );

  const vaeComputeBytes = estimateVAEComputeBuffer(
    width, height, arch.vaeScaleFactor,
    { tiling: vaeTiling, tileSize: vaeTileSize, convDirect: vaeConvDirect }
  );

  // Text encoder compute buffer is small relative to others (~1-10 MB).
  const textEncoderComputeBytes = 10 * MB;

  // --- Phase VRAM calculation ---

  // Phase 1: Text encoding
  let phase1Vram = 0;
  let phase1Ram = 0;
  if (clipOnCpu) {
    phase1Ram = textEncoderParamsBytes + textEncoderComputeBytes;
    phase1Vram = 0;
  } else if (offloadToCpu) {
    // Weights copied temporarily to GPU
    phase1Vram = textEncoderParamsBytes + textEncoderComputeBytes;
    phase1Ram = textEncoderParamsBytes;  // original stays in RAM
  } else {
    phase1Vram = textEncoderParamsBytes + textEncoderComputeBytes;
  }

  // Phase 2: Diffusion sampling
  let phase2Vram = 0;
  let phase2Ram = 0;
  if (offloadToCpu) {
    phase2Vram = diffusionParamsBytes + diffusionComputeBytes;
    phase2Ram = diffusionParamsBytes;
  } else {
    phase2Vram = diffusionParamsBytes + diffusionComputeBytes;
  }

  // Phase 3: VAE decode
  let phase3Vram = 0;
  let phase3Ram = 0;
  if (vaeOnCpu) {
    phase3Ram = vaeParamsBytes + vaeComputeBytes;
    phase3Vram = 0;
  } else if (offloadToCpu) {
    phase3Vram = vaeParamsBytes + vaeComputeBytes;
    phase3Ram = vaeParamsBytes;
  } else {
    phase3Vram = vaeParamsBytes + vaeComputeBytes;
  }

  // --- Total VRAM ---
  // With offloading: peak is max of phases (sequential, freed between phases)
  // Without offloading: weights accumulate (server mode behavior)

  let peakVram;
  let isServerMode = !offloadToCpu;  // server keeps weights resident

  if (offloadToCpu) {
    peakVram = Math.max(phase1Vram, phase2Vram, phase3Vram);
  } else {
    // Without offloading, weights from earlier phases may remain on GPU.
    // In CLI mode (free_params_immediately=true), weights ARE freed between
    // phases, so it behaves like offloading for weight lifetime.
    // In server mode (free_params_immediately=false), weights accumulate.
    // We model the worst case (server mode) here.
    peakVram = Math.max(
      phase1Vram,
      // Phase 2 may still have text encoder weights on GPU
      (isServerMode ? textEncoderParamsBytes : 0) + phase2Vram,
      // Phase 3 may still have text encoder + diffusion weights on GPU
      (isServerMode ? textEncoderParamsBytes + diffusionParamsBytes : 0) + phase3Vram
    );
  }

  // Total RAM = all model weights (always loaded in RAM) + overhead
  const totalRam = textEncoderParamsBytes + diffusionParamsBytes + vaeParamsBytes;

  return {
    arch: archKey,
    imageSize: `${width}x${height}`,
    quantization: {
      diffusion: diffusionQuant,
      textEncoder: textEncoderQuant,
      vae: vaeQuant,
    },
    flags: { offloadToCpu, clipOnCpu, vaeOnCpu, vaeTiling, diffusionFlashAttn },

    // Weight sizes
    weights: {
      diffusionMB:    Math.round(diffusionParamsBytes / MB),
      textEncoderMB:  Math.round(textEncoderParamsBytes / MB),
      vaeMB:          Math.round(vaeParamsBytes / MB),
      totalMB:        Math.round((diffusionParamsBytes + textEncoderParamsBytes + vaeParamsBytes) / MB),
    },

    // Compute buffer sizes
    computeBuffers: {
      diffusionMB:    Math.round(diffusionComputeBytes / MB),
      vaeMB:          Math.round(vaeComputeBytes / MB),
    },

    // Per-phase VRAM
    phases: {
      phase1_textEncode_MB: Math.round(phase1Vram / MB),
      phase2_diffusion_MB:  Math.round(phase2Vram / MB),
      phase3_vaeDecode_MB:  Math.round(phase3Vram / MB),
    },

    // Final results
    peakVramMB: Math.round(peakVram / MB),
    totalRamMB: Math.round(totalRam / MB),
  };
}


/**
 * Binary search for the maximum square image size that fits in a VRAM budget.
 *
 * @param {object} config - Same as calculateMemoryUsage but without width/height
 * @param {number} vramBudgetMB - Available VRAM in MB
 * @param {number} [minSize=256] - Minimum image dimension
 * @param {number} [maxSize=4096] - Maximum image dimension to try
 * @param {number} [step=64] - Step size for search (must align to spatial_multiple)
 * @returns {object} { maxWidth, maxHeight, usage }
 */
export function findMaxImageSize(config, vramBudgetMB, minSize = 256, maxSize = 4096, step = 64) {
  let bestSize = minSize;
  let bestUsage = null;

  for (let size = minSize; size <= maxSize; size += step) {
    const usage = calculateMemoryUsage({ ...config, width: size, height: size });
    if (usage.peakVramMB <= vramBudgetMB) {
      bestSize = size;
      bestUsage = usage;
    } else {
      break;
    }
  }

  return {
    maxWidth: bestSize,
    maxHeight: bestSize,
    usage: bestUsage || calculateMemoryUsage({ ...config, width: bestSize, height: bestSize }),
  };
}


/**
 * Detect architecture from a model config object.
 *
 * @param {Object} modelConfig - Model config object from modelManager
 * @returns {string|null} Architecture key (e.g., 'flux1', 'sdxl') or null if unknown
 */
function detectArchitecture(modelConfig) {
  const name = (modelConfig.name || '').toLowerCase();
  const id = (modelConfig.id || '').toLowerCase();
  const combined = name + ' ' + id;
  
  if (combined.includes('z-image') || combined.includes('z_image')) return 'z-image';
  if (combined.includes('flux2') || combined.includes('flux-2')) return 'flux2';
  if (combined.includes('flux') && combined.includes('klein')) return 'flux2-klein';
  if (combined.includes('flux')) return 'flux1';
  if (combined.includes('sd3') || combined.includes('sd-3')) return 'sd3';
  if (combined.includes('sdxl') || combined.includes('xl')) return 'sdxl';
  if (combined.includes('copax')) return 'sdxl';
  if (combined.includes('pony')) return 'sdxl';
  if (combined.includes('shuttle')) return 'sdxl';
  if (combined.includes('qwen')) return 'z-image';
  if (combined.includes('sd1') || combined.includes('sd-1') || combined.includes('sd15')) return 'sd1.5';
  if (combined.includes('chroma')) return 'sd3';
  return null;
}


/**
 * Extract model path from model config args.
 *
 * @param {Object} modelConfig - Model config object from modelManager
 * @returns {string|null} Model file path
 */
function extractModelPath(modelConfig) {
  const args = modelConfig.args || [];
  for (const arg of args) {
    if (arg && typeof arg === 'string' && (arg.endsWith('.gguf') || arg.endsWith('.safetensors'))) {
      return arg;
    }
  }
  return null;
}


/**
 * Calculate memory usage for a model configuration.
 *
 * This convenience function takes a model config object (from modelManager)
 * and automatically detects architecture and quantization to calculate
 * both CLI and server mode memory estimates.
 *
 * @param {Object} modelConfig - Model config object from modelManager
 * @param {number} width - Output image width
 * @param {number} height - Output image height
 * @param {Object} [flags={}] - CLI flags (offloadToCpu, vaeTiling, etc.)
 * @param {number} [gpuVramMB] - Available GPU VRAM for CLI mode calculation
 * @returns {Object|null} Memory estimation or null if architecture cannot be determined
 */
export function calculateMemoryForModel(modelConfig, width, height, flags = {}, gpuVramMB = null) {
  const arch = detectArchitecture(modelConfig);
  if (!arch) {
    return null;
  }

  const archInfo = ARCHITECTURES[arch];
  if (!archInfo) {
    return null;
  }

  const modelPath = extractModelPath(modelConfig);
  let quantType = 'Q4_K';  // default
  if (modelPath) {
    const extracted = extractQuantFromFilename(modelPath);
    if (extracted && extracted !== 'unknown') {
      quantType = extracted;
    }
  }

  const defaultQuant = quantType;

  const cliFlags = {
    offloadToCpu: true,
    clipOnCpu: flags.clipOnCpu ?? true,
    vaeOnCpu: flags.vaeOnCpu ?? false,
    vaeTiling: flags.vaeTiling ?? false,
    vaeTileSize: flags.vaeTileSize ?? 32,
    vaeConvDirect: flags.vaeConvDirect ?? false,
    diffusionFlashAttn: flags.diffusionFlashAttn ?? true,
  };

  const serverFlags = {
    offloadToCpu: false,
    clipOnCpu: false,
    vaeOnCpu: false,
    vaeTiling: flags.vaeTiling ?? false,
    vaeTileSize: flags.vaeTileSize ?? 32,
    vaeConvDirect: flags.vaeConvDirect ?? false,
    diffusionFlashAttn: flags.diffusionFlashAttn ?? true,
  };

  const cliResult = calculateMemoryUsage({
    arch,
    diffusionQuant: defaultQuant,
    textEncoderQuant: 'Q8_0',
    vaeQuant: 'F32',
    width,
    height,
    flags: cliFlags,
  });

  const serverResult = calculateMemoryUsage({
    arch,
    diffusionQuant: defaultQuant,
    textEncoderQuant: 'F16',
    vaeQuant: 'F16',
    width,
    height,
    flags: serverFlags,
  });

  let cliFit = null;
  if (gpuVramMB !== null) {
    cliFit = {
      fits: cliResult.peakVramMB <= gpuVramMB,
      peakVramMB: cliResult.peakVramMB,
      availableMB: gpuVramMB,
      usedPercent: Math.round((cliResult.peakVramMB / gpuVramMB) * 100),
    };
  }

  let serverFit = null;
  if (gpuVramMB !== null) {
    serverFit = {
      fits: serverResult.peakVramMB <= gpuVramMB,
      peakVramMB: serverResult.peakVramMB,
      availableMB: gpuVramMB,
      usedPercent: Math.round((serverResult.peakVramMB / gpuVramMB) * 100),
    };
  }

  return {
    architecture: arch,
    detectedQuant: defaultQuant,
    modelPath,
    width,
    height,
    flags,
    cli: {
      flags: cliFlags,
      usage: cliResult,
      fits: cliFit,
    },
    server: {
      flags: serverFlags,
      usage: serverResult,
      fits: serverFit,
    },
  };
}
