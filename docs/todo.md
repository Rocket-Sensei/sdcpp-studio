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

### Memory Management & Model UI
**Status:** In Progress

- [ ] Per-model component indicators (Model/VAE/LLM badges) visible per-model when multiple models are selected
- [ ] Enable `vae_on_cpu: true` by default in `settings.yml` (required for 8GB GPUs to avoid OOM)
- [ ] Persist memory flag toggles per model in localStorage (not just session state)
- [ ] Per-model memory flag toggles merged with quant badge in model list (next to Q2_K badge)
- [ ] Restore start/stop server buttons for models in the model list
  - Allow manual sd-server start for specific models
  - If server is running, generation must use it instead of sd-cli
  - Server-only settings UI (e.g. `--steps`) configurable at start time
- [ ] Warning banner when memory flags change while model is running
- [ ] Real-time VRAM usage tracking (poll `nvidia-smi` for actual usage, not just estimates)

## New Requests (March 2026)

### Terminal UI for SD.cpp/llama.cpp/wan Tools
**Status:** In Progress

**Goal:** Implement proper terminal UI for agent sessions showing SD.cpp, llama.cpp, and wan tool outputs with scrolling and copy functionality.

**Reference:** opencode app at `/data/agents/_competitors-cli/opencode/` has excellent terminal UI implementation

**Implementation Tasks:**
- [x] Create TerminalUI component similar to opencode's terminal.tsx
- [x] Create LogViewer component to display stdout from tools
- [x] Parse log entries to extract `stdout` field only
- [x] Add `--terminal-ui` flag to app startup
- [x] Implement real in-console TUI runtime for `--terminal-ui`
- [x] Suppress normal stdout/stderr logger output in terminal mode to avoid TUI corruption
- [x] Route startup and migration output through structured logger instead of direct `console.log`
- [ ] Implement real WebSocket terminal streaming for app-level logs (not only model/process output)
- [ ] Right-click menu on messages for generation info
- [x] Wire up SD.cpp process outputs to terminal UI (WebSocket channel + log files)
- [ ] Wire up llama.cpp/wan tool outputs to terminal UI
- [ ] Add bottom dock terminal frame in web UI with latest lines (VS Code style)

### Generation Event Logging (Console Output)
**Status:** Completed ✅

**Implementation Tasks:**
- [x] Log generation start event with model, resolution, seed, sampler, steps, cfg, prompt, ref images, upscale
- [x] Log generation end event with model load time, generation time, memory settings
- [x] Store sd-cli binary version before each generation

### Generation Details Modal Improvements
**Status:** Completed ✅

**Implementation Tasks:**
- [x] Remove duplicate prompt display (line-clamp-2)
- [x] Show full prompt without truncation in modal
- [x] Add upscale enable and sampler to modal
- [x] Add memory settings used to modal
- [x] Add sd-cli binary version to modal
- [ ] Prepare for multiple sd-cli binary version selection

### Memory Settings Modal Fixes
**Status:** Completed ✅

**Implementation Tasks:**
- [x] Verify all toggles in modal are wired correctly (VAE on CPU, Offload to CPU, CLIP on CPU, VAE Tiling, Flash Attention, diffusion-fa)
- [x] Ensure settings are per-model, not global
- [x] Persist per-model memory settings
- [ ] Move Memory Settings button next to per-model memory buttons

### Config Cleanup - Remove command Field
**Status:** Completed ✅

**Implementation Tasks:**
- [x] Remove `command` field from all model config YAML files
- [x] Update modelManager to auto-detect binary from exec_mode

### Testing Infrastructure
**Status:** Ongoing

**Implementation Tasks:**
- [x] Create vitest specs for log parsing/extraction
- [x] Create vitest specs for terminal routes
- [x] Create vitest specs for generation event logging
- [x] Create vitest specs for command auto-detection
- [x] Create vitest specs for memory settings wiring
- [ ] Run all tests before each commit

## Completed
- [x] Update model list API to OpenRouter format
- [x] Add quant badges to UI
- [x] Migrate frontend to v1 models endpoint
- [x] Fix default model loading
- [x] GPU detection service (`gpuService.js`)
- [x] Memory calculator (`memoryCalculator.js`)
- [x] Centralized memory defaults in `settings.yml`
- [x] Model YAML cleanup (removed duplicate memory flags, exec_mode → auto)
- [x] Auto exec_mode (CLI by default, server when model has server=true)
- [x] Memory API endpoints (gpu-info, estimate, components, flags)
- [x] Frontend MemoryPanel (inline bar + popover)
- [x] Fix: memory flags now injected into CLI args via `_mergeMemoryFlags()`
- [x] Terminal UI infrastructure (logParser, TerminalUI, terminal routes)
- [x] Generation event logging (logGenerationStart, logGenerationEnd)
- [x] Per-model memory settings wired and persisted
- [x] Binary version capture and display in modal
- [x] Config cleanup - command field removed, auto-detection added
- [x] Database schema updated with memory flags and binary_version columns

(End of file - total 245 lines)
