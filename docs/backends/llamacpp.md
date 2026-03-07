# Llama.cpp Backend

## Overview
Text generation backend using llama.cpp for LLM inference.

## Binary
- `llama-server` - Main server binary

## Build Instructions

### Requirements
- CUDA 13.1
- CMake
- GCC/G++

### Build Commands
```bash
export CUDA_HOME=/usr/local/cuda-13.1
export PATH="$CUDA_HOME/bin:$PATH"
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release
```

**Note:** Currently having issues with CUDA compiler detection. May need to use Docker version or resolve build environment issues.

## Modes

### 1. Multi-Model Mode (INI File)
Uses `--models-preset` flag to load multiple models:

```bash
llama-server --models-preset config/llm-models.ini
```

INI format:
```ini
[model-section-name]
model = /path/to/model.gguf
mmproj = /path/to/mmproj.gguf  # Optional, for vision models
```

### 2. Single Model Mode
Direct model execution:

```bash
llama-server -m /path/to/model.gguf [other args]
```

## Configuration
Models defined in `/backend/config/llm-models.ini`:

```ini
[gemma-3-27b-it]
model = /models/google/gemma-3-27b-it/google_gemma-3-27b-it-IQ3_XS.gguf
mmproj = /models/google/gemma-3-27b-it/mmproj-google_gemma-3-27b-it-f16.gguf

[Devstral-Small-2-24B-Instruct]
model = /models/lmstudio-community/Devstral-Small-2-24B-Instruct-2512-GGUF/Devstral-Small-2-24B-Instruct-2512-Q4_K_M.gguf
mmproj = /models/lmstudio-community/Devstral-Small-2-24B-Instruct-2512-GGUF/mmproj-Devstral-Small-2-24B-Instruct-2512-F16.gguf
```

## API Endpoints
Llama.cpp provides OpenAI-compatible endpoints:
- `POST /v1/chat/completions` - Chat completions
- `POST /v1/completions` - Text completions
- `GET /v1/models` - List available models

## Integration
Will be integrated with:
- Text generation UI tab
- Model manager for start/stop
- Queue system for batch processing
