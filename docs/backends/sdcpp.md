# Stable Diffusion CPP Backend

## Overview
The primary image generation backend using stable-diffusion.cpp binaries.

## Binaries
- `/bin/sd-server` - Server mode (long-running HTTP API)
- `/bin/sd-cli` - CLI mode (one-shot execution)

## Modes

### Server Mode
- Long-running HTTP server
- Port-based communication
- Supports multiple generation types
- Auto-starts on demand

### CLI Mode
- One-shot execution per generation
- Spawns process for each request
- Suitable for models that don't support server mode

## Configuration

### Legacy Configuration
Traditional models configured in `/backend/config/models-*.yml` files:

```yaml
models:
  model-id:
    name: "Display Name"
    capabilities: ["text-to-image", "image-to-image"]
    command: "./bin/sd-server"
    args:
      - "--diffusion-model"
      - "./models/model.gguf"
      - "--steps"
      - "9"
    exec_mode: "server"
    mode: "on_demand"
```

### New Multi-Model Backend Configuration (Recommended)

**Backend Presets** (`backends.yml`):
```yaml
backends:
  sd-server:
    command: "./bin/sd-server"
    exec_mode: "server"
    mode: "on_demand"
    base_args:
      - "-v"
      - "--offload-to-cpu"
      - "--clip-on-cpu"
```

**Model Definition** (simplified, 70% less config):
```yaml
models:
  qwen-image-2512:
    name: "Qwen Image 2512"
    backend: "sd-server"
    model_file: "./models/qwen-image-2512-Q3_K_M.gguf"
    vae: "./models/qwen_image_vae.safetensors"
    qwen2vl: "./models/Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf"
    capabilities: ["text-to-image"]
    generation_params:
      sample_steps: 24
```

**Available File Fields:**
- `model_file` → `--diffusion-model`
- `vae` → `--vae`
- `clip_l` → `--clip_l`
- `t5xxl` → `--t5xxl`
- `qwen2vl` → `--qwen2vl`
- `clip_vision` → `--clip_vision`

**Benefits:**
- **70% less configuration** (10 lines vs 30+ lines per model)
- Shared base args reduce duplication
- Backend settings centralized
- Clear separation of concerns
- Easy to add new models

## Important Notes
- Server-mode models MUST include `--steps` in args (SD.cpp doesn't support steps via HTTP API)
- Only one server model can run at a time
- Queue processor auto-stops conflicting server models
- **Future:** Consider sd-server multi-model mode similar to llama-server's `--models-preset`

## API Compatibility
Provides OpenAI-compatible `/v1/images/generations` endpoint.

## SD.next Compatibility
For SillyTavern integration:
- `GET /sdapi/v1/progress` - Generation progress
- `GET /sdapi/v1/samplers` - Available samplers
- `GET /sdapi/v1/upscalers` - Available upscalers
- `POST /sdapi/v1/extra-single-image` - Upscaling
