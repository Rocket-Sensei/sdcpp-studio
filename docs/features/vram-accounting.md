# VRAM Accounting Feature

## Overview

Help users understand if their GPU has enough VRAM for image generation with the selected model. Show:
- Available VRAM
- Model VRAM requirements
- Maximum safe image size for the selected model

## Requirements

### 1. Detect Available VRAM
- Use browser API (`navigator.gpu` or WebGPU) to detect GPU VRAM
- Fallback: Allow user to manually specify VRAM in settings
- Store user's VRAM preference in localStorage

### 2. Calculate Model VRAM Requirements

#### Model Size Calculation
For each model configuration, calculate:
- **Diffusion model size**: Size of the `.gguf` file specified in `--diffusion-model` arg
- **VAE size**: Size of the `.safetensors` file specified in `--vae` arg (if present)
- **LLM size**: Size of the `.gguf` file specified in `--llm` arg (if present)
- **CLIP size**: Size of CLIP model (bundled with diffusion or separate)

#### Offload Flags Detection
Parse model config args for:
- `--offload-to-cpu`: Offload primary model to system RAM
- `--clip-on-cpu`: Offload CLIP to system RAM
- No flag = Keep in VRAM

#### VRAM Formula
```
Base VRAM required = diffusion_model_size + vae_size
LLM VRAM = (llm_size if no --offload-to-cpu) + (clip_size if no --clip-on-cpu)
CLIP VRAM = clip_size if no --clip-on-cpu AND no LLM
Compute buffer = ~2GB for tensor operations (SD.cpp overhead)

Total VRAM = Base VRAM + LLM VRAM + Compute buffer
```

With offload flags:
```
Total VRAM = base_model_size (in VRAM) + compute_buffer
System RAM needed = offloaded_components_size + compute_buffer
```

### 3. Maximum Image Size Calculation

Based on SD.cpp VRAM usage patterns:
- VRAM usage scales with image resolution
- Approximate formula: `vram_needed ≈ base_vram + (width * height * channels * bytes_per_pixel * multiplier)`

Simplified heuristic:
- 512x512 = baseline (~8GB for most models)
- 768x768 = ~1.5x baseline VRAM
- 1024x1024 = ~2x baseline VRAM
- 1536x1536 = ~3x baseline VRAM

Calculate max safe resolution:
```
max_pixels = (available_vram - base_vram) / bytes_per_pixel
max_dimension = sqrt(max_pixels)
```

### 4. UI Display

#### Model Card Badge
Show VRAM requirement on model selection:
```
[Z-Image Turbo] Requires: 6GB VRAM + 8GB RAM (with --offload-to-cpu)
```

#### Size Selector Warnings
When user selects image size:
- Green: Safe for your GPU
- Yellow: Close to limit, may fail
- Red: Exceeds your VRAM

#### Warning Message
```
⚠️ This model requires 6GB VRAM but you only have 4GB available.
Try: 1) Enable --offload-to-cpu, 2) Reduce image size, 3) Use a smaller model
```

## Implementation Plan

### Phase 1: Backend - Model Size Detection
1. Add function to parse model YAML config and extract file paths
2. Add function to calculate file sizes from disk
3. Add endpoint `GET /api/models/:id/vram-requirements` returning:
   ```json
   {
     "model_id": "z-image-turbo",
     "vram_required_gb": 6.2,
     "ram_required_gb": 8.5,
     "offload_to_cpu": true,
     "clip_on_cpu": true,
     "breakdown": {
       "diffusion_model_gb": 4.2,
       "vae_gb": 0.8,
       "llm_gb": 3.4,
       "clip_gb": 0.8,
       "compute_buffer_gb": 2.0
     }
   }
   ```

### Phase 2: Frontend - VRAM Detection
1. Add VRAM detection utility (`src/utils/vram.js`)
2. Add user settings for manual VRAM override
3. Add VRAM context/provider for app-wide access

### Phase 3: UI Integration
1. Add VRAM badge to model selector
2. Add size warnings to size selector
3. Add detailed VRAM info to model details modal

### Phase 4: Testing
1. Unit tests for VRAM calculation
2. Integration tests for size warnings
3. Manual testing on different GPU configurations

## Edge Cases

1. **Multiple GPUs**: Use the minimum VRAM across GPUs
2. **Integrated GPU**: Show system RAM instead
3. **Unknown VRAM**: Prompt user to enter manually
4. **Dynamic VRAM**: Some GPUs share system memory (Apple Silicon)

## File Structure

```
backend/services/
  vramCalculator.js     # Calculate model VRAM requirements
  modelFileSizes.js     # Get file sizes from disk

frontend/src/utils/
  vram.js               # VRAM detection utilities
  modelRequirements.js  # Calculate max image size

frontend/src/contexts/
  VRAMContext.jsx       # VRAM state management

frontend/src/components/
  VRAMBadge.jsx         # VRAM requirement badge
  SizeWarning.jsx       # Size selector warnings
```

## Mock Data for Testing

```json
{
  "z-image-turbo": {
    "diffusion_model": "./models/z_image_turbo-Q8_0.gguf",  // 4.2 GB
    "vae": "./models/ae.safetensors",                       // 0.8 GB
    "llm": "./models/Qwen3-4B-Instruct-2507-Q8_0.gguf",    // 4.5 GB
    "offload_to_cpu": true,
    "clip_on_cpu": true,
    "expected_vram": 6.2,
    "expected_ram": 9.3
  }
}
```

## References

- SD.cpp VRAM requirements: https://github.com/lllyasviel/stable-diffusion.cpp
- WebGPU VRAM detection: https://developer.chrome.com/docs/web-platform/gpu/
- Model file sizes in `/models/` directory
