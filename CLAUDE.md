# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development (both backend + frontend)
npm run dev

# Individual services
npm run dev:backend    # Node.js --watch on :3000
npm run dev:frontend   # Vite on :5173

# Testing
npm test               # Run Vitest
npm run test:ui        # Vitest UI

# Model management CLI
npm run models:list    # List all configured models
npm run models:info <id>   # Get detailed model info
npm run models:files <id>  # Check model file status
npm run models:running     # Show running models
```

## Architecture Overview

SD WebUI is a web interface for Stable Diffusion via stable-diffusion.cpp. The architecture has three main layers:

1. **Backend (`/backend`)** - Express.js API server with SQLite database
2. **Frontend (`/frontend`)** - React + Vite application with shadcn/ui
3. **External Integration** - stable-diffusion.cpp binaries (`/bin/sd-server`, `/bin/sd-cli`)

### Multi-File Configuration System

The model configuration is split across multiple YAML files in `/backend/config/`:

- **settings.yml** - Global defaults (default_model, default_models)
- **upscalers.yml** - Upscaler configurations
- **models-qwen-cli.yml** - CLI mode qwen-image
- **models-qwen-image.yml** - Server mode qwen-image (port 1400)
- **models-qwen-edit.yml** - Qwen Image Edit variants (ports 1401-1405)
- **models-z-turbo.yml** - Z-Image Turbo (port 1238)
- **models-copax.yml** - Copax Timeless XL+Z1 (port 1406)

Config files are loaded in order; later configs override earlier ones. The modelManager auto-adds `--listen-port` from the `port` field and auto-fills the `api` field for server mode models.

### Backend Services Architecture

| Service | File | Purpose |
|---------|------|---------|
| **modelManager.js** | `/backend/services/` | Singleton that manages SD model processes (start/stop/health). Supports server mode (long-running HTTP), CLI mode (one-shot), and API mode (external) |
| **queueProcessor.js** | `/backend/services/` | Polling-based queue (2s interval). Merges queue and generations into single DB table. Auto-stops conflicting server models |
| **imageService.js** | `/backend/services/` | Makes HTTP requests to SD.cpp APIs. Injects SD.cpp args via XML tags in prompt (`<sd_cpp_extra_args>`, `<negative_prompt>`) |
| **websocket.js** | `/backend/services/` | Pub/sub WebSocket on `/ws`. Channels: `queue`, `generations`, `models`. Broadcast helpers for events |
| **cliHandler.js** | `/backend/services/` | Handles CLI mode generation - spawns sd-cli process with prompt/args |
| **upscalerService.js** | `/backend/services/` | Image upscaling via RealESRGAN or resize algorithms |

### Frontend Architecture

**Routes:** `/generate` (Generate form), `/gallery` (UnifiedQueue gallery), `/models` (ModelManager)

**Key Hooks:**
- `useImageGeneration` - Queued and direct API calls to `/api/queue/*`
- `useWebSocket` - Real-time subscriptions with channel filtering

**Components:**
- `Generate.jsx` - Unified generation form with mode tabs (txt2img, img2img, imgedit, upscale)
- `UnifiedQueue.jsx` - Combined gallery view with active jobs and recent generations
- `ModelManager.jsx` - Model management UI with start/stop controls

### SD.next API Compatibility Layer

For SillyTavern integration, the backend provides SD.next-compatible endpoints:

- `GET /sdapi/v1/progress` - Returns `{progress: 0-1, state: {job_count: n}}`. SillyTavern polls until `progress === 0 AND job_count === 0`
- `GET /sdapi/v1/samplers` - Available sampling methods
- `GET /sdapi/v1/upscalers` - Available upscalers
- `POST /sdapi/v1/extra-single-image` - Upscaling endpoint
- `GET /sdapi/v1/options` - Model options with `sd_model_checkpoint` key for current model

**Important:** Model loading progress is reported via the progress endpoint by checking for models with `status === 'starting'` and returning non-zero progress during load.

### Database Schema

**Generations Table** (unified queue + generations):
- `status`: pending/processing/completed/failed/cancelled
- `type`: generate/edit/variation
- `progress`: 0.0-1.0
- `input_image_path`, `mask_image_path` for img2img
- `started_at`, `completed_at` timestamps

**Generated Images Table:**
- Links to generations via `generation_id`
- `file_path` points to disk storage in `/backend/data/images/`

### Model Configuration Format

```yaml
models:
  model-id:
    name: "Display Name"
    capabilities: ["text-to-image", "image-to-image"]
    command: "./bin/sd-server"
    port: 1400
    args:
      - "--diffusion-model"
      - "./models/model.gguf"
      - "--vae"
      - "./models/vae.safetensors"
    exec_mode: "server"  # server/cli/api
    mode: "on_demand"     # on_demand/preload
    model_type: "text-to-image"
    generation_params:    # Optional defaults
      cfg_scale: 0.0
      sample_steps: 9
```

**Key behaviors:**
- Server mode: `port` field required, `api` field auto-generated as `http://127.0.0.1:{port}/v1`
- CLI mode: No port/api needed, spawns process per generation
- Only one server model can run at a time; queueProcessor auto-stops conflicts

### WebSocket Protocol

Connect to `ws://host:3000/ws`

```javascript
// Subscribe
{ type: 'subscribe', channel: 'queue' }

// Queue events
{ channel: 'queue', type: 'job_updated', data: {...} }
{ channel: 'queue', type: 'job_completed', data: {...} }
{ channel: 'queue', type: 'job_failed', data: {...} }

// Model events
{ channel: 'models', type: 'model_status_changed', data: { modelId, status, port, ... } }
```

### External Dependencies

- **stable-diffusion.cpp**: Binaries at `/bin/sd-server` and `/bin/sd-cli`
- **Model files**: Stored in `/models/` (gitignored)
- **Database**: SQLite at `/backend/data/sd-webui.db` (WAL mode enabled)

### Important Notes

1. **SD.cpp Args Injection**: Extra args (cfg_scale, sampling_method, etc.) are injected into prompts as XML tags, not passed as query params. The imageService strips these tags before sending to the API.

2. **Port Conflicts**: Only one server mode model can run at a time. The queueProcessor stops any running server model before switching to a different one.

3. **Image Storage**: Images are saved to disk in `/backend/data/images/`. The database only stores file paths, not image data.

4. **Model Loading**: Models are loaded on-demand (unless `mode: preload`). The modelManager tracks process status (stopped/starting/running/error) and broadcasts via WebSocket.

5. **Testing**: Uses Vitest with jsdom. Test setup in `/tests/setup.js`. Run individual test files with `npm test -- filename.test.js`.

6. **LLM Compatibility Issues**: Some newer models (qwen-image-edit-2511, z-image-turbo) require specific LLM files in safetensors format. GGUF LLM files may have incompatible tensor structures.
