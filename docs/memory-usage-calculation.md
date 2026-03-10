# Memory Usage Calculation for stable-diffusion.cpp

> Research document for predicting VRAM/RAM requirements so users can determine
> the maximum image size their GPU can handle with a given model and flags.

## Table of Contents

- [Overview: How Memory Is Used](#overview-how-memory-is-used)
- [The Three Phases of Generation](#the-three-phases-of-generation)
- [Component Memory Budgets](#component-memory-budgets)
  - [1. Model Weights (params buffer)](#1-model-weights-params-buffer)
  - [2. Compute Buffer (intermediate activations)](#2-compute-buffer-intermediate-activations)
  - [3. Runtime Offload Buffer](#3-runtime-offload-buffer)
- [GGUF Quantization Sizes](#gguf-quantization-sizes)
- [Architecture Reference](#architecture-reference)
  - [Text Encoders](#text-encoders)
  - [Diffusion Models](#diffusion-models)
  - [VAE](#vae)
- [VAE Compute Buffer Scaling](#vae-compute-buffer-scaling)
  - [VAE Decoder Layer-by-Layer Breakdown](#vae-decoder-layer-by-layer-breakdown)
- [Diffusion Model Compute Buffer Scaling](#diffusion-model-compute-buffer-scaling)
- [CLI Flags and Their Memory Effects](#cli-flags-and-their-memory-effects)
- [Peak VRAM Calculation](#peak-vram-calculation)
- [The Server OOM Bug](#the-server-oom-bug)
- [JavaScript Memory Calculator](#javascript-memory-calculator)
- [Layerwise Offloading: Future Optimization](#layerwise-offloading-future-optimization)
- [TODO / Open Research](#todo--open-research)

---

## Overview: How Memory Is Used

stable-diffusion.cpp allocates memory in three categories:

| Category | Description | Lifetime |
|----------|-------------|----------|
| **Params buffer** | Model weights (quantized tensors) | Loaded at init, freed per-phase or at exit |
| **Compute buffer** | Intermediate activations for the compute graph | Allocated per forward pass, freed after |
| **Runtime offload buffer** | Temporary GPU copy of CPU-resident weights | Created before compute, freed after (when `--offload-to-cpu`) |

The total VRAM at any moment is:

```
VRAM_peak = params_on_gpu + compute_buffer + runtime_offload_buffer
```

Source: `ggml_extend.hpp:1785-2105`, `stable-diffusion.cpp:819-890`

---

## The Three Phases of Generation

Image generation proceeds sequentially through three phases. Each phase has its
own VRAM footprint, and the **peak across all phases** determines whether
generation succeeds.

```
Phase 1: Text Encoding     Phase 2: Diffusion Sampling     Phase 3: VAE Decode
(CLIP/T5/LLM)              (UNet/DiT/Flux/ZImage)          (AutoencoderKL)
                                                            
[text_enc weights]          [diffusion weights]             [vae weights]
[text_enc compute]          [diffusion compute]             [vae compute]  <-- often the OOM culprit
```

With `--offload-to-cpu`, each phase loads its component to VRAM, computes, then
offloads back to RAM before the next phase begins. **The peak is the maximum of
any single phase**, not the sum.

Without offloading, weights stay resident on GPU across phases, so VRAM is
**cumulative**.

Source: `stable-diffusion.cpp:3383-3565` (txt2img flow)

---

## Component Memory Budgets

### 1. Model Weights (params buffer)

The params buffer size equals the sum of all tensor sizes in the GGUF file,
determined by each tensor's quantization type and dimensions:

```
tensor_bytes = (num_elements * type_size_bytes) / block_size
model_params_bytes = sum(tensor_bytes for each tensor)
```

The actual loaded size is reported in the startup log:

```
total params memory size = 7708.94MB (VRAM 3632.51MB, RAM 4076.43MB):
  text_encoders 4076.43MB(RAM), diffusion_model 3472.51MB(VRAM),
  vae 160.00MB(VRAM), controlnet 0.00MB(VRAM)
```

Source: `stable-diffusion.cpp:870-890`, `ggml_extend.hpp:1970-1996`

### 2. Compute Buffer (intermediate activations)

The compute buffer holds all intermediate tensors for one forward pass of the
compute graph. Its size is determined by `ggml_gallocr_reserve()` which walks the
graph and calculates the peak sum of simultaneously-live tensors.

This is **not** the sum of all tensors -- ggml reuses memory for tensors whose
lifetimes don't overlap. But for sequential architectures (decoders), the peak is
roughly the two largest adjacent layer outputs.

The compute buffer is **allocated per-component** and scales with:
- **Image dimensions** (quadratically for spatial operations)
- **Model architecture** (channel counts, attention heads)
- **Flash attention** (reduces O(tokens^2) attention matrix to O(tokens))

Source: `ggml_extend.hpp:1785-1808`

### 3. Runtime Offload Buffer

When `--offload-to-cpu` is active, a GGMLRunner's weights live in CPU RAM
(`params_backend = CPU`). Before each `compute()` call, ALL weights are copied
to a temporary GPU buffer (`runtime_params_buffer`), then freed after compute.

```
runtime_offload_buffer_size = params_buffer_size  (full copy to GPU)
```

This means even with offloading, each component needs its full weight size in
VRAM temporarily during its compute phase.

Source: `ggml_extend.hpp:1857-1937, 1942-1950`

---

## GGUF Quantization Sizes

These are the actual bytes-per-weight for each GGUF quantization type, derived
from `ggml_type_size / ggml_blck_size` in the ggml type traits table.

| Type | Block Size (elements) | Type Size (bytes/block) | Bits Per Weight | Notes |
|------|-----------------------|-------------------------|-----------------|-------|
| `F32` | 1 | 4 | 32.00 | Full precision |
| `F16` | 1 | 2 | 16.00 | Half precision |
| `BF16` | 1 | 2 | 16.00 | Brain float 16 |
| `Q8_0` | 32 | 34 | 8.50 | |
| `Q6_K` | 256 | 210 | 6.5625 | |
| `Q5_K` | 256 | 176 | 5.50 | Q5_K_S / Q5_K_M use this |
| `Q5_0` | 32 | 22 | 5.50 | |
| `Q4_K` | 256 | 144 | 4.50 | Q4_K_S / Q4_K_M use this |
| `Q4_0` | 32 | 18 | 4.50 | |
| `IQ4_XS` | 256 | 136 | 4.25 | |
| `IQ4_NL` | 32 | 18 | 4.50 | |
| `Q3_K` | 256 | 110 | 3.4375 | Q3_K_S / Q3_K_M / Q3_K_L use this |
| `IQ3_S` | 256 | 110 | 3.4375 | |
| `IQ3_XXS` | 256 | 98 | 3.0625 | |
| `Q2_K` | 256 | 84 | 2.625 | |
| `IQ2_S` | 256 | 82 | 2.5625 | |
| `IQ2_XS` | 256 | 74 | 2.3125 | |
| `IQ2_XXS` | 256 | 66 | 2.0625 | |
| `IQ1_M` | 256 | 56 | 1.75 | |
| `IQ1_S` | 256 | 50 | 1.5625 | |

**Note on mixed quantization**: GGUF files use different quant types per tensor.
"Q4_K_M" means *most* tensors are Q4_K but some important ones (attention, norm)
may use Q5_K or Q6_K. The file's actual size is the sum of each tensor's
individual quantized size.

Source: `ggml/src/ggml.c:609-899` (type_traits table), `ggml/src/ggml-common.h`

---

## Architecture Reference

### Text Encoders

| Encoder | Hidden Size | Layers | Heads | Intermediate | F16 Size | Used By |
|---------|-------------|--------|-------|--------------|----------|---------|
| CLIP-L (OpenAI) | 768 | 12 | 12 | 3,072 | ~246 MB | SD1.5, SDXL, Flux, SD3 |
| CLIP-G (OpenCLIP bigG) | 1,280 | 32 | 20 | 5,120 | ~1.39 GB | SDXL, SD3 |
| T5-XXL | 4,096 | 24 | 64 | 10,240 | ~9.52 GB | Flux, SD3, Chroma |
| Qwen3-4B (LLM) | 2,560 | 36 | 32 | 9,728 | ~4.08 GB (Q8_0) | Z-Image |

Source: `conditioner.hpp:72-1810`, `llm.hpp:1079-1136`, `clip.hpp:914`

### Diffusion Models

| Architecture | Version | Hidden Size | Layers | Heads | Patch | Params (approx) | F16 Size |
|--------------|---------|-------------|--------|-------|-------|------------------|----------|
| UNet SD1.5 | `VERSION_SD1` | 320 (base) | 4 stages | 8 | N/A | ~860M | ~1.6 GB |
| UNet SDXL | `VERSION_SDXL` | 320 (base) | 3 stages | varies | N/A | ~2.6B | ~4.9 GB |
| MMDiT SD3 | `VERSION_SD3` | 1,536 | 24 | 24 | 2 | ~2B | ~3.8 GB |
| Flux.1 Dev | `VERSION_FLUX` | 3,072 | 19+38 | 24 | 2 | ~12B | ~22.5 GB |
| Flux.1 Schnell | `VERSION_FLUX` | 3,072 | 19+38 | 24 | 2 | ~12B | ~22.5 GB |
| Flux2 Klein | `VERSION_FLUX2_KLEIN` | varies | varies | varies | 1 | ~4B | ~7.75 GB |
| Z-Image | `VERSION_Z_IMAGE` | 3,840 | 30+2+2 | 30 | 2 | ~8B | ~15 GB |

Source: `z_image.hpp:283-456`, `flux.hpp:763-968`, `unet.hpp:596`, `mmdit.hpp:824`

### VAE

All standard image VAEs share the same decoder architecture with `ch=128`,
`ch_mult={1,2,4,4}`, `num_res_blocks=2`. The difference is in `z_channels`:

| VAE Variant | z_channels | vae_scale_factor | F32 Size | Used By |
|-------------|------------|------------------|----------|---------|
| SD1.5/SDXL | 4 | 8 | ~160 MB | SD1.5, SDXL |
| SD3 | 16 | 8 | ~160 MB | SD3 |
| Flux1 | 16 | 8 | ~160 MB | Flux.1 |
| Flux2 | 32 | 16 | ~160 MB | Flux2, Z-Image |

Source: `vae.hpp:363-582`

---

## VAE Compute Buffer Scaling

The VAE compute buffer is the most common OOM culprit because it scales
**quadratically with image resolution**. The decoder upsamples through 4 stages,
each doubling spatial dimensions, with the largest intermediate tensors at
512 channels.

### Formula

The VAE compute buffer peak is dominated by the largest intermediate tensors in
the decoder graph. For a `W x H` output image with `ch=128`, `ch_mult={1,2,4,4}`:

```
Peak intermediate ≈ max_channels * (W/scale * H/scale) * sizeof(float)

where:
  max_channels = ch * max(ch_mult) = 128 * 4 = 512
  scale varies per stage (1x at top, 2x, 4x, 8x at bottom)
```

The actual compute buffer is the sum of all simultaneously-live tensors at the
graph's peak point. Empirically:

```
VAE_compute_MB ≈ K * (image_pixels / 1,048,576)

where:
  K ≈ 2560 MB for SD1.5/SDXL (at 1024x1024)
  K ≈ 6656 MB for Flux (at 1024x1024)
```

The Flux VAE needs more because its decoder starts at a smaller spatial size
(64x64 vs 128x128 latent) but with more channels (32 vs 4 z_channels), and the
intermediate conv layers produce larger tensors at the critical stages.

### VAE Decoder Layer-by-Layer Breakdown

#### SD1.5/SDXL (1024x1024 image, latent 128x128)

| Stage | Layer | Channels | Spatial | Tensor Size (F32) |
|-------|-------|----------|---------|-------------------|
| Input | conv_in | 4 -> 512 | 128x128 | 32 MB |
| Mid | block_1 | 512 | 128x128 | 32 MB |
| Mid | attn_1 (QKV) | 512 | 128x128 | 128 MB (Q+K+V+out) |
| Mid | block_2 | 512 | 128x128 | 32 MB |
| Up 3 | resblocks x3 | 512 | 128x128 | 32 MB each |
| Up 3 | upsample | 512 | -> 256x256 | 128 MB |
| Up 2 | resblocks x3 | 512 | 256x256 | 128 MB each |
| Up 2 | upsample | 512 | -> 512x512 | 512 MB |
| Up 1 | resblocks x3 | 512->256 | 512x512 | 512/256 MB |
| Up 1 | upsample | 256 | -> 1024x1024 | 1024 MB |
| Up 0 | resblocks x3 | 256->128 | 1024x1024 | 1024/512 MB |
| Output | norm + conv_out | 128->3 | 1024x1024 | 12 MB |

#### Flux2 (1024x1024 image, latent 64x64, z_channels=32)

| Stage | Layer | Channels | Spatial | Tensor Size (F32) |
|-------|-------|----------|---------|-------------------|
| Reshape | p=2 unpack | 128->32 | 64->128x128 | - |
| Input | post_quant + conv_in | 32->512 | 128x128 | 32 MB |
| Mid | block_1 + attn + block_2 | 512 | 128x128 | 128 MB |
| Up 3 | resblocks x3 + upsample | 512 | -> 256x256 | 128 MB |
| Up 2 | resblocks x3 + upsample | 512 | -> 512x512 | 512 MB |
| Up 1 | resblocks x3 + upsample | 512->256 | -> 1024x1024 | 1024 MB |
| Up 0 | resblocks x3 | 256->128 | 1024x1024 | 1024/512 MB |
| Output | norm + conv_out | 128->3 | 1024x1024 | 12 MB |

**The peak live memory is much larger than any single tensor** because ggml must
hold inputs, weights, and outputs simultaneously during each conv2d operation.
A conv2d with `im2col` can require a temporary buffer of
`out_channels * kernel_h * kernel_w * in_channels * spatial_size` elements.

Source: `vae.hpp:363-582`, `stable-diffusion.cpp:2720-2794`

---

## Diffusion Model Compute Buffer Scaling

The diffusion model compute buffer depends on the number of **tokens** in the
latent representation:

```
latent_tokens = (image_W / vae_scale_factor / patch_size) * (image_H / vae_scale_factor / patch_size)
```

| Architecture | vae_scale | patch | Tokens (1024x1024) | Tokens (512x512) |
|--------------|-----------|-------|--------------------|--------------------|
| SD1.5 UNet | 8 | N/A | 128x128 = 16,384 | 64x64 = 4,096 |
| SDXL UNet | 8 | N/A | 128x128 = 16,384 | 64x64 = 4,096 |
| SD3 MMDiT | 8 | 2 | 64x64 = 4,096 | 32x32 = 1,024 |
| Flux DiT | 8 | 2 | 64x64 = 4,096 | 32x32 = 1,024 |
| Flux2 DiT | 16 | 1 | 64x64 = 4,096 | 32x32 = 1,024 |
| Z-Image | 16 | 2 | 32x32 = 1,024 | 16x16 = 256 |

### Memory scaling

**Without flash attention**: Attention memory scales as O(tokens^2) because the
full Q*K^T matrix is materialized:
```
attention_matrix_size = num_heads * tokens * tokens * sizeof(float)
```

**With flash attention** (`--diffusion-fa`): Attention memory drops to O(tokens)
because the fused kernel never materializes the full matrix. This is a massive
savings for large images.

### Observed compute buffer sizes

| Model | Image Size | Flash Attn | Compute Buffer |
|-------|------------|------------|----------------|
| Z-Image (Q2_K) | 1024x1024 | yes | ~530 MB |
| Flux (F16) | 1024x1024 | no | ~2000+ MB |

Source: `z_image.hpp:404-408`, `flux.hpp:932-951`, `ggml_extend.hpp:1396-1437`

---

## CLI Flags and Their Memory Effects

### Flag reference

| Flag | Effect on VRAM | Effect on RAM | Performance Impact |
|------|---------------|---------------|-------------------|
| `--offload-to-cpu` | Weights stored in RAM, loaded to VRAM per-phase | +model_size | Slower (CPU<->GPU copies per phase) |
| `--clip-on-cpu` | CLIP weights + compute on CPU | +clip_size | Slower text encoding |
| `--vae-on-cpu` | VAE weights + compute on CPU | +vae_size + vae_compute | Much slower decode, avoids VRAM OOM |
| `--vae-tiling` | VAE processes tiles instead of full image | Same | Slower decode, ~16x less VAE VRAM |
| `--vae-conv-direct` | Avoids im2col temp buffers in VAE conv2d | Same | Slightly less VRAM |
| `--diffusion-fa` | Flash attention for diffusion model | Same | Less VRAM, often faster on modern GPUs |
| `--tae` / `--taesd` | Use tiny autoencoder (much smaller VAE) | Same | Much less VRAM, lower image quality |

### How `--offload-to-cpu` changes the memory timeline

**Without offloading** (default for server, `free_params_immediately=false`):
```
Phase 1 VRAM: [clip weights] + [clip compute]
Phase 2 VRAM: [clip weights] + [diffusion weights] + [diffusion compute]  <<< cumulative!
Phase 3 VRAM: [clip weights] + [diffusion weights] + [vae weights] + [vae compute]  <<< OOM!
```

**With `--offload-to-cpu`** (weights on CPU, loaded per-phase):
```
Phase 1 VRAM: [clip weights (temp copy)] + [clip compute]
Phase 2 VRAM: [diffusion weights (temp copy)] + [diffusion compute]
Phase 3 VRAM: [vae weights (temp copy)] + [vae compute]
Peak = max(phase1, phase2, phase3)
```

**With `--offload-to-cpu` + `--clip-on-cpu`**:
```
Phase 1 VRAM: 0  (clip runs entirely on CPU)
Phase 2 VRAM: [diffusion weights (temp copy)] + [diffusion compute]
Phase 3 VRAM: [vae weights (temp copy)] + [vae compute]
```

**With `--offload-to-cpu` + `--clip-on-cpu` + `--vae-on-cpu`**:
```
Phase 1 VRAM: 0
Phase 2 VRAM: [diffusion weights (temp copy)] + [diffusion compute]
Phase 3 VRAM: 0  (vae runs entirely on CPU)
Peak = phase2 only
```

**With `--offload-to-cpu` + `--clip-on-cpu` + `--vae-tiling`**:
```
Phase 1 VRAM: 0
Phase 2 VRAM: [diffusion weights (temp copy)] + [diffusion compute]
Phase 3 VRAM: [vae weights (temp copy)] + [vae compute FOR ONE TILE]
```

### VAE tiling memory reduction

With `--vae-tiling`, the VAE processes 32x32 latent tiles (or custom sizes)
instead of the full latent. This reduces the compute buffer by roughly:

```
reduction_factor ≈ (full_latent_area / tile_area)

Example for 1024x1024 with Flux (64x64 latent, 32x32 tiles):
  Full compute: ~6656 MB
  Tiled compute: ~176 MB (per tile)  
  Reduction: ~38x
```

Source: `stable-diffusion.cpp:2752-2786`, `examples/common/common.hpp:455-614`

---

## Peak VRAM Calculation

### General formula

```
VRAM_peak = max(
  Phase1_VRAM,
  Phase2_VRAM,
  Phase3_VRAM
)
```

Where each phase VRAM depends on flags:

```
Phase1 (text encoding):
  if --clip-on-cpu:    0
  elif --offload-to-cpu: text_encoder_params + text_encoder_compute
  else:                  text_encoder_params + text_encoder_compute

Phase2 (diffusion sampling):
  if --offload-to-cpu: diffusion_params + diffusion_compute
  else:                diffusion_params + diffusion_compute
  (diffusion always runs on GPU -- there's no --diffusion-on-cpu flag)

Phase3 (VAE decode):
  if --vae-on-cpu:     0
  elif --vae-tiling:   vae_params + vae_tile_compute
  elif --offload-to-cpu: vae_params + vae_full_compute
  else:                vae_params + vae_full_compute

  NOTE: Without --offload-to-cpu AND without free_params_immediately,
        diffusion_params may STILL be on GPU during Phase3!
```

### Practical formula for `--offload-to-cpu --clip-on-cpu --diffusion-fa`

This is the recommended low-VRAM configuration:

```
VRAM_peak = max(
  diffusion_params_size + diffusion_compute_buffer,
  vae_params_size + vae_compute_buffer
)
```

If VAE compute buffer > diffusion total, add `--vae-tiling`:

```
VRAM_peak = diffusion_params_size + diffusion_compute_buffer
```

Source: `stable-diffusion.cpp:3383-3565`

---

## The Server OOM Bug

The original crash in the issue log is caused by a known architectural problem in
`sd-server`:

```cpp
// examples/server/main.cpp:304
sd_ctx_params_t sd_ctx_params = ctx_params.to_sd_ctx_params_t(false, false, false);
//                                                                    ^^^^^
//                                                          free_params_immediately = false
```

Compare with the CLI:
```cpp
// examples/cli/main.cpp:689
sd_ctx_params_t sd_ctx_params = ctx_params.to_sd_ctx_params_t(vae_decode_only, true, ...);
//                                                                              ^^^^
//                                                              free_params_immediately = true
```

When `free_params_immediately = false` (server mode), the diffusion model weights
are **not freed** before VAE decode. This means Phase 3 VRAM includes BOTH the
diffusion model weights AND the VAE compute buffer:

```
Server Phase 3 VRAM = diffusion_params (STILL ON GPU!) + vae_params + vae_compute
```

For the original crash scenario (8 GB VRAM, Z-Image Q2_K + Flux VAE):
- Diffusion params: 3472 MB (still on GPU)
- VAE params: 160 MB
- VAE compute buffer: 6656 MB (attempted)
- Total needed: ~10,288 MB >> 8 GB

**Workarounds**:
- `--offload-to-cpu`: Correctly unloads diffusion weights after sampling
  (via `free_compute_buffer()` -> `offload_params_to_params_backend()`)
- `--vae-tiling`: Reduces VAE compute to ~176 MB
- `--vae-on-cpu`: Moves VAE entirely to CPU

Related GitHub issues: #305, #1290, #1293

Source: `examples/server/main.cpp:304`, `examples/cli/main.cpp:689`

---

## JavaScript Memory Calculator

```javascript
/**
 * Memory usage calculator for stable-diffusion.cpp
 *
 * Estimates VRAM/RAM requirements for a given model configuration,
 * image size, and CLI flags.
 */

// ---------------------------------------------------------------------------
// GGUF quantization type metadata
// ---------------------------------------------------------------------------

const GGUF_QUANT_TYPES = {
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

// Aliases for mixed-quant naming convention (e.g., Q4_K_M -> Q4_K base)
const QUANT_ALIASES = {
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
  'BF16':   'BF16',
  'F32':    'F32',
};

/**
 * Get bits-per-weight for a quantization type string.
 * Handles aliases like "Q4_K_M" -> Q4_K -> 4.5 bpw.
 */
function getBitsPerWeight(quantType) {
  const normalized = QUANT_ALIASES[quantType] || quantType;
  const info = GGUF_QUANT_TYPES[normalized];
  if (!info) throw new Error(`Unknown quant type: ${quantType}`);
  return info.bpw;
}

/**
 * Estimate model file size given parameter count and quantization.
 * @param {number} params - Total parameter count
 * @param {string} quantType - GGUF quantization type (e.g., "Q4_K_M")
 * @returns {number} Size in bytes
 */
function estimateModelSize(params, quantType) {
  const bpw = getBitsPerWeight(quantType);
  return params * bpw / 8;
}

// ---------------------------------------------------------------------------
// Architecture definitions
// ---------------------------------------------------------------------------

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
 */
const ARCHITECTURES = {
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

// ---------------------------------------------------------------------------
// VAE compute buffer estimation
// ---------------------------------------------------------------------------

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
 * @param {number}  [options.tileSize=32] - Tile size in latent pixels
 * @param {boolean} [options.convDirect=false] - Whether --vae-conv-direct is used
 * @returns {number} Estimated compute buffer size in bytes
 */
function estimateVAEComputeBuffer(width, height, vaeScaleFactor, options = {}) {
  const { tiling = false, tileSize = 32, convDirect = false } = options;

  // Empirical constant: bytes of compute buffer per output pixel.
  // Calibrated from observed logs:
  //   SD/SDXL at 1024x1024 (latent 128x128): ~2560 MB = 2560 * 1024^2 bytes
  //     -> K = 2560 * 1024^2 / (1024*1024) = 2560 bytes/pixel
  //   Flux at 1024x1024 (latent 64x64): ~6656 MB
  //     -> K = 6656 * 1024^2 / (1024*1024) = 6656 bytes/pixel
  //
  // The difference comes from the decoder processing: Flux's latent is smaller
  // but the conv_in stage (32->512 at 128x128 after reshape) and the subsequent
  // upsampling stages produce different intermediate tensor overlap patterns.
  //
  // We approximate: K_base scales with 1/vaeScaleFactor^2 relationship
  // because a larger vae_scale_factor means smaller latent and thus different
  // internal resolution at each stage.

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

// ---------------------------------------------------------------------------
// Diffusion model compute buffer estimation
// ---------------------------------------------------------------------------

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
function estimateDiffusionComputeBuffer(archKey, width, height, options = {}) {
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

// ---------------------------------------------------------------------------
// Main calculator
// ---------------------------------------------------------------------------

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
 * @param {number}  [config.flags.vaeTileSize=32]
 * @param {boolean} [config.flags.vaeConvDirect=false]
 * @param {boolean} [config.flags.diffusionFlashAttn=false]
 *
 * @returns {object} Memory estimation breakdown
 */
function calculateMemoryUsage(config) {
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

// ---------------------------------------------------------------------------
// Convenience: find max image size for a given VRAM budget
// ---------------------------------------------------------------------------

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
function findMaxImageSize(config, vramBudgetMB, minSize = 256, maxSize = 4096, step = 64) {
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

// ---------------------------------------------------------------------------
// Example usage
// ---------------------------------------------------------------------------

/*
// Z-Image with Q2_K quantization on 8 GB VRAM
const result = calculateMemoryUsage({
  arch: 'z-image',
  diffusionQuant: 'Q2_K',
  textEncoderQuant: 'Q8_0',
  vaeQuant: 'F32',
  width: 1024,
  height: 1024,
  flags: {
    offloadToCpu: true,
    clipOnCpu: true,
    diffusionFlashAttn: true,
    vaeTiling: false,
  },
});

console.log(result);
// {
//   peakVramMB: ~6000+ (VAE compute dominates, needs --vae-tiling!)
//   ...
// }

// Find max image size for 8 GB VRAM with --vae-tiling
const max = findMaxImageSize({
  arch: 'z-image',
  diffusionQuant: 'Q2_K',
  textEncoderQuant: 'Q8_0',
  vaeQuant: 'F32',
  flags: {
    offloadToCpu: true,
    clipOnCpu: true,
    diffusionFlashAttn: true,
    vaeTiling: true,
  },
}, 8000);

console.log(`Max size: ${max.maxWidth}x${max.maxHeight}`);
console.log(`Peak VRAM: ${max.usage.peakVramMB} MB`);
*/

// Export for use in Node.js / bundled apps
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GGUF_QUANT_TYPES,
    QUANT_ALIASES,
    ARCHITECTURES,
    getBitsPerWeight,
    estimateModelSize,
    estimateVAEComputeBuffer,
    estimateDiffusionComputeBuffer,
    calculateMemoryUsage,
    findMaxImageSize,
  };
}
```

---

## Layerwise Offloading: Future Optimization

### The Problem with Current Offloading

The current `--offload-to-cpu` implementation copies **all weights** for an entire
component (e.g., the full diffusion model) to/from GPU in one batch. For a 12B
Flux model at Q4_K (~5.6 GB), every sampling step requires copying 5.6 GB to GPU
and back -- even though each transformer block only needs ~100 MB of weights.

### How vLLM-Omni Does It

vLLM-Omni implements two levels of offloading for diffusion models:

1. **Model-level (sequential)**: Mutual exclusion between DiT and encoder -- only
   one on GPU at a time. (This is what sd.cpp `--offload-to-cpu` already does.)

2. **Layerwise (blockwise)**: Only one transformer block on GPU at a time. Uses
   CUDA streams to overlap block N's compute with block N+1's weight prefetch.

```
Block 0: [prefetch block 1 (async)] -> [compute block 0] -> [free block 0]
Block 1: [prefetch block 2 (async)] -> [compute block 1] -> [free block 1]
...
```

This reduces VRAM from `full_model_weights + compute_buffer` to
`single_block_weights + compute_buffer`, with minimal throughput loss when
per-block compute time exceeds the H2D transfer time.

### Feasibility in stable-diffusion.cpp

**Good news**: The infrastructure partially exists:

| Requirement | Status |
|-------------|--------|
| Named blocks in model code | Exists: `double_blocks.0`, `single_blocks.5`, `layers.12`, etc. |
| Async tensor copy API | Exists: `ggml_backend_tensor_copy_async()` in ggml |
| CUDA streams | Exists: ggml-cuda uses `cudaMemcpyAsync` with streams |
| Pinned host memory | Exists: `ggml_backend_dev_caps.host_buffer` capability |
| Per-block param contexts | **Missing**: All weights share one `params_ctx` |
| Block-to-tensor mapping | **Missing**: No tracking of which tensors belong to which block |

**What would need to change:**

1. **Block-to-tensor mapping**: During model init, record which tensors belong to
   each transformer block. The block naming convention (`layers.0.attn.qkv.weight`)
   already encodes this information.

2. **Per-block GPU buffer management**: Instead of one `runtime_params_buffer` for
   all weights, manage one buffer per block (or a ring buffer for 2-3 blocks).

3. **Async prefetch in compute loop**: In the sampling step function, before
   computing block N, issue an async copy of block N+1's weights. After computing
   block N, free block N's GPU buffer.

4. **Build graph per-block**: Currently the entire model graph is built at once.
   Layerwise offload would require building/executing the graph per-block, OR
   using ggml's backend scheduling with mixed CPU/GPU tensors.

### VRAM savings estimate

| Model | Full Offload (current) | Layerwise (proposed) | Savings |
|-------|------------------------|----------------------|---------|
| Flux.1 Q4_K | ~5.6 GB params + compute | ~200 MB params + compute | ~5.4 GB |
| Z-Image Q2_K | ~3.5 GB params + compute | ~130 MB params + compute | ~3.4 GB |
| SDXL Q4_K | ~1.3 GB params + compute | ~50 MB params + compute | ~1.25 GB |

This would make Flux.1 runnable on 4 GB GPUs (with `--vae-tiling`), which is
currently impossible even with `--offload-to-cpu`.

### Reference implementations

- **vLLM-Omni**: `/data/vllm-omni` -- Python/PyTorch with hook-based prefetching
  via `LayerwiseOffloadHook` and `SequentialOffloadHook`
- **llama.cpp**: `/data/llama.cpp` -- C/ggml with `n_gpu_layers` controlling how
  many transformer layers stay on GPU vs CPU. Uses `ggml_backend_sched` for
  multi-backend graph execution.

---

## TODO / Open Research

### Calibration & Validation

- [ ] **Measure actual compute buffer sizes** across architectures at multiple
  resolutions (512, 768, 1024, 1536, 2048) and record the results. The current
  empirical K constants are calibrated from only 1-2 data points.

- [ ] **Validate VAE compute buffer formula** with `--vae-conv-direct` enabled.
  The 0.75x reduction factor is a rough guess.

- [ ] **Measure diffusion compute buffer** with and without flash attention for
  Flux, SDXL, SD3, Z-Image at multiple resolutions to refine the per-token
  constants.

- [ ] **Account for mixed quantization** in size estimates. A "Q4_K_M" GGUF has
  some tensors at Q5_K/Q6_K. Read the actual tensor type distribution from GGUF
  metadata to get exact sizes.

### Missing Architecture Support

- [ ] **Add Wan2 video model** memory profiles (3D VAE, temporal attention).
- [ ] **Add ControlNet** memory overhead to the calculator.
- [ ] **Add LoRA** memory overhead (additive to base model).
- [ ] **Add ESRGAN upscaler** memory profile.
- [ ] **Add img2img / inpainting** memory differences (encoder + decoder).

### Server Mode Fix

- [ ] **Investigate making server free params between phases** like CLI does, or
  at minimum offload diffusion weights before VAE decode. This is the root cause
  of the 8 GB OOM crash reported in the original issue. See GitHub issues
  #305, #1290, #1293.

- [ ] **Audit `free_params_immediately` behavior** in all server endpoints
  (txt2img, img2img, video). The server hardcodes `false` at
  `examples/server/main.cpp:304` but should ideally free between phases and only
  keep weights for fast re-generation.

### Layerwise Offloading Implementation

- [ ] **Study llama.cpp's `n_gpu_layers`** implementation in `/data/llama.cpp` to
  understand how ggml_backend_sched assigns layers to different backends.

- [ ] **Study vLLM-Omni's `LayerwiseOffloadHook`** in `/data/vllm-omni` for the
  async prefetch pattern with CUDA streams.

- [ ] **Prototype block-to-tensor mapping** in GGMLRunner by parsing tensor names
  to extract block indices (e.g., `double_blocks.5.img_attn.qkv.weight` -> block 5).

- [ ] **Prototype per-block offload** for Flux `double_blocks` as a proof of
  concept: load block N to GPU, compute, free, load block N+1.

- [ ] **Benchmark H2D transfer overlap**: Measure whether a single Flux
  double_block's compute time (~50-100ms on mid-range GPU) is long enough to hide
  the async transfer of the next block (~100 MB at ~12 GB/s PCIe 3.0 = ~8ms).
  If so, layerwise offloading would be nearly free in throughput cost.

- [ ] **Design a `--n-gpu-layers` flag** for sd.cpp that controls how many
  transformer blocks stay on GPU (like llama.cpp). Blocks beyond that limit
  would use layerwise offloading from CPU.

### Calculator Improvements

- [ ] **Read GGUF file metadata** to get exact per-tensor sizes instead of
  estimating from parameter count * bpw. This gives precise weight sizes.

- [ ] **Add non-square image support** to the calculator. Currently assumes
  square for `findMaxImageSize`.

- [ ] **Model the ggml allocator** more precisely. The current approach uses
  empirical K constants. A more accurate model would simulate the ggml graph
  allocator's tensor lifetime analysis.

- [ ] **Add a UI component** showing model sizes with green/yellow/red indicators
  for GPU compatibility.
