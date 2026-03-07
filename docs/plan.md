# Development Plan

## Current Sprint

### Phase 1: Unified Multi-Model Backend Configuration
**Status:** Core Implementation Complete ✅

Redesign the configuration system to support multi-model backends elegantly:

**Current Problem:**
- Each model requires 20-30 lines of config with duplicated args
- Adding a new model variant means copying entire config blocks
- No clean separation between backend settings and model settings

**Proposed Solution:**

1. **Backend Presets** - Define backend configurations once:
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
    
  llama-server:
    command: "./bin/llama-server"
    exec_mode: "server"
    mode: "on_demand"
    config_file: "./config/llm-models.ini"  # Multi-model mode
    
  wan2gp:
    command: "python"
    exec_mode: "cli"
    mode: "on_demand"
    working_dir: "./Wan2GP"
    env:
      PYENV_VERSION: "wan"
```

2. **Model References** - Simple model definitions:
```yaml
models:
  qwen-image-2512:
    name: "Qwen Image 2512"
    backend: "sd-server"
    model_file: "./models/qwen-image-2512-Q3_K_M.gguf"
    vae: "./models/qwen_image_vae.safetensors"
    qwen2vl: "./models/Qwen2.5-VL-7B-Instruct.Q4_K_M.gguf"
    capabilities: ["text-to-image"]
    
  gemma-3-27b-it:
    name: "Gemma 3 27B IT"
    backend: "llama-server"
    ini_section: "gemma-3-27b-it"  # References llm-models.ini
    capabilities: ["text-generation"]
    
  wan-t2v-14b:
    name: "Wan2.1 T2V 14B"
    backend: "wan2gp"
    model_file: "../models/wan2.1_t2v_14B_fp8_scaled.safetensors"
    capabilities: ["text-to-video"]
```

**Benefits:**
- Add new models in 5-10 lines instead of 30 (70% reduction)
- Backend settings centralized and reusable
- Easy to support new backends
- Clear separation of concerns

**Tasks:**
- [x] Create BackendRegistry class (`backend/services/backendRegistry.js`)
- [x] Add backend preset support to modelManager
- [x] Create `backend/config/backends.yml` with presets
- [ ] Migrate existing configs to new format
- [x] Support backward compatibility (models without backend field work unchanged)

### Phase 2: Wan2GP Video Generation Backend
**Status:** Planning

Add Wan2GP (from Wan2GP folder) as a video generation backend:
- On-demand startup: `pyenv activate wan && python wgp.py`
- Generate video then auto-stop (same pattern as sd-server)
- Support text-to-video and image-to-video modes
- Integrate with existing queue system

**Tasks:**
- [ ] Create Wan2GP service wrapper
- [ ] Add video generation route handlers
- [ ] Update model config for Wan2GP models
- [ ] Add video-specific UI components
- [ ] Test end-to-end video generation flow

### Phase 2: LLM Text Generation Backend
**Status:** Core Implementation Complete ✅

Add llama.cpp as a text generation backend:
- Support for text generation via llama-server
- Two modes: single model mode and multi-model mode with INI file
- Create INI configuration file with existing models
- Add "Text" tab to mode switcher

**Tasks:**
- [x] Create `backend/config/llm-models.ini` with current models
- [x] Create `backend/config/models-llm.yml` with standalone LLM models
- [x] Support single model direct execution mode
- [x] Support `llama-server --models-preset config.ini` mode
- [x] Add "Text" tab to frontend mode switcher
- [x] Create `GenerateText` component for text input
- [x] Fix Text mode filtering to show only LLM models (not image models)
- [ ] Create llama.cpp backend service wrapper
- [ ] Add text generation API routes
- [ ] Build llama.cpp with CUDA 13.1 support

### Phase 3: Model Manager Improvements
**Status:** Planning

Improve the model manager widget:
- Add explicit start/stop buttons for each model
- Show model status more prominently
- Add model actions (restart, view logs, etc.)
- Support for backends with multiple models per command

**Tasks:**
- [ ] Redesign ModelManager component
- [ ] Add start/stop action buttons
- [ ] Add status indicators with colors
- [ ] Add model logs viewer
- [ ] Support multi-model backends

## Future Plans

### Phase 4: Backend Abstraction
- Refactor backend system to be more generic
- Allow easy addition of new backends
- Standardize backend interface

### Phase 5: Advanced Features
- Model chaining/composition
- Batch processing improvements
- Advanced scheduling for multi-GPU setups

## Backlog

- [ ] Better error handling and recovery
- [ ] Model warmup/preload optimization
- [ ] GPU memory management
- [ ] Distributed generation support
