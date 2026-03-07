# Todo List

## High Priority

### Unified Multi-Model Backend System
**Status:** Core Implementation Complete ✅

**Goal:** Reduce config from ~30 lines per model to ~5-10 lines by separating backend presets from model definitions.

**Design:**
```yaml
# Backend preset (defined once in backends.yml)
backends:
  sd-server:
    command: "./bin/sd-server"
    exec_mode: "server"
    base_args: ["-v", "--offload-to-cpu", "--clip-on-cpu"]
    
  llama-server:
    command: "./bin/llama-server"
    exec_mode: "server"
    mode: "on_demand"
    config_file: "./config/llm-models.ini"

# Model definition (simplified)
models:
  qwen-image-2512:
    name: "Qwen Image 2512"
    backend: "sd-server"  # References preset
    model_file: "./models/qwen-image-2512-Q3_K_M.gguf"
    vae: "./models/qwen_image_vae.safetensors"
    capabilities: ["text-to-image"]
```

**Implementation Tasks:**
- [x] Create BackendRegistry class (`backend/services/backendRegistry.js`)
  - Load backend presets from `backends.yml`
  - Provide method to resolve model config with backend args merged
  - Support backend inheritance (model args override backend base_args)
- [x] Create `backend/config/backends.yml` with presets for:
  - sd-server (for image generation)
  - llama-server (for text generation)
  - wan2gp (for video generation)
- [x] Update modelManager.loadConfig() to:
  - Load backend presets before models
  - When loading models with `backend` field, merge backend preset args
  - Convert shorthand fields (model_file, vae, etc.) to args array
  - Keep backward compatibility for models without `backend` field
- [x] Create model argument builder utility
  - Map model_file → --diffusion-model
  - Map vae → --vae
  - Map qwen2vl → --qwen2vl
  - etc.
- [x] Create example config (`models-example-new-format.yml`)
- [ ] Migrate existing config files to new format
  - Convert one model file as proof of concept
  - Then gradually migrate others
- [ ] Test that merged args work correctly in real generation
- [ ] Document the new config format in detail

### Wan2GP Integration
- [ ] Create Wan2GP service wrapper in `backend/services/wan2gpService.js`
- [ ] Add Wan2GP exec_mode to modelManager
- [ ] Create video generation route handlers
- [ ] Add Wan2GP model configurations to YAML
- [ ] Test video generation end-to-end

### LLM Backend
- [x] Create `backend/config/llm-models.ini` with current models
- [x] Create `backend/config/models-llm.yml` with standalone LLM models
  - Qwen 2.5 VL 7B (Q4_K_M, Q8_0)
  - Qwen 3 4B (Q8_0)
  - Llama 3.1 8B (Q8_0)
  - Gemma 3 27B IT
  - Devstral Small 24B
- [x] Add "Text" tab to frontend mode switcher
- [x] Create `GenerateText` component for text input
- [x] Fix Text mode filtering to show only LLM models
- [x] Update ModelSelectorModal and MultiModelSelector with proper LLM filtering
- [ ] Create llama.cpp service wrapper
- [ ] Add text generation routes
- [ ] Build llama.cpp with CUDA 13.1 (fix build issues)
- [ ] Add text generation API endpoints

### Model Manager Improvements
- [x] Add start/stop buttons to ModelManager component (already implemented in ModelCard)
- [x] Add status color indicators (green=running, yellow=starting, red=error) (already implemented)
- [x] Add Text category tab to ModelSelectorModal
- [ ] Add model action dropdown (restart, logs, settings)
- [ ] Support backend type indicators

## Medium Priority

### Backend Abstraction
- [ ] Create base Backend class/interface
- [ ] Refactor modelManager to use backend classes
- [ ] Standardize backend lifecycle (start/stop/status/health)

### Config Restructuring
- [ ] Review `backend/config/settings.yml` for backend-specific settings
- [ ] Consider separate config sections per backend type
- [ ] Add backend type registry

## Low Priority

### Documentation
- [ ] Document all backend APIs
- [ ] Add troubleshooting guides
- [ ] Create backend development guide

### Testing
- [ ] Add backend-specific tests
- [ ] Test multi-model INI mode for llama.cpp
- [ ] Test Wan2GP integration

## Completed
- [x] Update model list API to OpenRouter format
- [x] Add quant badges to UI
- [x] Migrate frontend to v1 models endpoint
- [x] Fix default model loading
