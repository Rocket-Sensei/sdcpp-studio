# Changelog

## Recent Changes

### 2024-03-07 - Text Generation Support & LLM Models

**Added:**
- New "Text" generation mode for LLM text generation
  - Added Text tab to mode switcher (5 modes now: Image, Edit, Video, Text, Upscale)
  - Created `GenerateText` component for text input
  - Updated `PromptBar` with text mode support
  - Added Text category to ModelSelectorModal with proper LLM filtering
  - Updated MultiModelSelector to filter LLMs in text mode
- LLM Models Configuration
  - Created `backend/config/llm-models.ini` with Gemma 3 and Devstral models
  - Created `backend/config/models-llm.yml` with standalone LLM models:
    - Qwen 2.5 VL 7B (Q4_K_M and Q8_0 variants)
    - Qwen 3 4B (Q8_0)
    - Llama 3.1 8B (Q8_0)
    - Gemma 3 27B IT
    - Devstral Small 24B
  - These LLMs are separate from SD component models (they use different IDs with `llm-` prefix)
  - Configured for llama-server backend with proper architecture/output_modalities
- Frontend Filtering
  - Text mode now correctly shows only LLM models (text-generation capability)
  - Supports both new architecture-based and legacy capabilities-based filtering
  - Architecture: output includes "text" but excludes "image" and "video"
- Backend Documentation
  - Created comprehensive backend documentation structure
  - Added docs for Wan2GP, SD.cpp, and llama.cpp backends

### 2024-03-07 - Dynamic Port Allocation & Multi-Model Backend System

**Added:**
- Dynamic port allocation using `pick-port` library
  - Port range: 40000-49000
  - Automatic port selection on model startup
  - Removed hardcoded ports from all config files
  - All servers now bind to 127.0.0.1 (local only) for security
- Multi-Model Backend System
  - Created `BackendRegistry` class (`backend/services/backendRegistry.js`)
  - Backend presets defined in `backend/config/backends.yml`
  - Support for `backend` field in model configs
  - Automatic arg merging: backend base_args + model file args + explicit args
  - Shorthand file fields: `model_file`, `vae`, `clip_l`, `t5xxl`, `qwen2vl`
  - Example: `models-example-new-format.yml` showing simplified config (70% reduction)

**Planned:**
- Unified Multi-Model Backend Configuration System
  - Backend presets for reusable command/arg configurations
  - Simplified model definitions (5-10 lines vs 20-30)
  - Model auto-discovery from directories
  - Clear separation between backend and model settings

### 2024-03-07 - Model List API Update

**Changed:**
- Updated `/api/v1/models` endpoint to use OpenRouter-style JSON format
  - Changed response structure from `{models: [...]}` to `{object: 'list', data: [...]}`
  - Added `id`, `name`, `description`, `quant`, `architecture`, `status` fields
  - Added `supported_parameters` and `default_parameters` fields
  - Removed `top_provider` from API response

**Added:**
- Automatic `quant` field extraction from model filenames (e.g., Q8_0, Q4_K_M, fp16)
- Quant badges displayed in UI with purple/violet styling
- Model status now returned as lowercase strings: "stopped", "starting", "running", "stopping", "error"
- Start/stop endpoints to `/api/v1/models` (`POST /api/v1/models/:id/start`, `POST /api/v1/models/:id/stop`)
- New backend routes: `/api/v1/models` for OpenRouter compatibility

**Updated:**
- Frontend migrated from `/api/models` to `/api/v1/models` endpoint
- Model filtering now uses `architecture` field with `input_modalities` and `output_modalities`
- Default model loading uses `/api/config` endpoint
- Model names in YAML configs (removed quant suffixes since they now show as badges)
- ModelCard, MultiModelSelector, ImageCard components to show quant badges

**Added Models:**
- Shuttle-3-Diffusion (port 1410)
- Copax Timeless XL+Z1 (port 1406)
- FLUX models on various ports

**Technical:**
- Created comprehensive test suite: `tests/modelsList.test.js`
- Updated `useModels.js` hook to provide `modelsQuantMap` for easy quant lookup
- Backend status handling updated throughout

---

*Note: Earlier changelog entries should be added here as they are documented.*
