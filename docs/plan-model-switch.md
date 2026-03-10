# Model Switch System Implementation Plan

## Overview

Add support for multiple Stable Diffusion models with automatic process management. The system will be able to start/stop SD-CPP server processes on demand and manage running model instances.

## Key Features

1. **Model Configuration** - YAML-based model definitions
2. **Process Management** - Start/stop SD-CPP server and CLI processes
3. **Mode Support** - Both `server` (long-running) and `cli` (one-shot) modes
4. **Model Downloads** - HuggingFace integration for model downloads
5. **UI Integration** - Model selector with start/stop controls
6. **Queue Integration** - Queue processor uses model-specific processes

---

## Configuration Format

### models.yml

```yaml
# Default model (used when no specific model requested)
default: fluxed-up-flux

# Models configuration
models:
  fluxed-up-flux:
    # Display name
    name: "FluxedUp Flux NSFW"
    # Description
    description: "High quality flux model with NSFW support"
    # Command template to start SD-CPP in server mode
    command: "./build/bin/sd-server"
    args:
      - "-l"
      - "0.0.0.0"
      - "--diffusion-model"
      - "/media/nvme/sdnext/models/UNET/fluxedUpFluxNSFW_v51Q4KSV2.gguf"
      - "--vae"
      - "./models/vae/flux1_f32.safetensors"
      - "--clip_l"
      - "./models/clip_l.safetensors"
      - "--t5xxl"
      - "./models/t5xxl_fp16.safetensors"
      - "-p"
      - "a lovely cat holding a sign says 'flux.cpp'"
      - "--cfg-scale"
      - "1.0"
      - "--sampling-method"
      - "euler"
      - "-v"
      - "--clip-on-cpu"
    # API endpoint when server is running
    api: "http://localhost:1234/v1"
    # Mode: on_demand (start/stop per request) or preload (keep running)
    mode: "on_demand"
    # Execution mode: server (long-running) or cli (one-shot per image)
    exec_mode: "server"
    # Port to use (auto-assigned if not specified)
    port: 1234
    # HuggingFace model info for downloads
    huggingface:
      repo: "gel基础/fluxedUpFluxNSFW_v51Q4KSV2"
      files:
        - path: "fluxedUpFluxNSFW_v51Q4KSV2.gguf"
          dest: "/media/nvme/sdnext/models/UNET/"

  sd15-base:
    name: "SD 1.5 Base"
    description: "Stable Diffusion 1.5 base model"
    command: "./build/bin/sd-server"
    args:
      - "-l"
      - "0.0.0.0"
      - "--model"
      - "./models/v1-5-pruned-emaonly.ckpt"
      - "--port"
      - "1235"
    api: "http://localhost:1235/v1"
    mode: "preload"
    exec_mode: "server"
    port: 1235
    huggingface:
      repo: "runwayml/stable-diffusion-v1-5"
      files:
        - path: "v1-5-pruned-emaonly.ckpt"
          dest: "./models/"

  sdxl-turbo:
    name: "SDXL Turbo"
    description: "Fast SDXL Turbo for quick generations"
    command: "./build/bin/sd"
    args:
      - "-m"
      - "./models/sd_xl_turbo_1.0_fp16.safetensors"
    api: null  # CLI mode doesn't have an API
    mode: "on_demand"
    exec_mode: "cli"
    huggingface:
      repo: "stabilityai/sdxl-turbo"
      files:
        - path: "sd_xl_turbo_1.0_fp16.safetensors"
          dest: "./models/"
```

---

## Architecture

### Backend Components

#### 1. Model Manager (`backend/services/modelManager.js`)

```javascript
class ModelManager {
  // Load models.yml configuration
  loadConfig()

  // Get model configuration by ID
  getModel(modelId)

  // Get all available models
  getAllModels()

  // Get default model
  getDefaultModel()

  // Get running models
  getRunningModels()

  // Start a model process
  startModel(modelId) -> Process

  // Stop a model process
  stopModel(modelId)

  // Check if model is running
  isModelRunning(modelId) -> boolean

  // Get model status
  getModelStatus(modelId) -> { status: 'stopped|starting|running|stopping|error', pid?, port? }
}
```

#### 2. Process Tracker (`backend/services/processTracker.js`)

```javascript
class ProcessTracker {
  // Register a running process
  registerProcess(modelId, process, port, execMode)

  // Unregister a process
  unregisterProcess(modelId)

  // Get process by model ID
  getProcess(modelId) -> { process, port, execMode, startedAt, pid }

  // Get all processes
  getAllProcesses() -> Array

  // Kill a process
  killProcess(modelId)

  // Cleanup zombie processes
  cleanupZombies()

  // Get available port
  getAvailablePort() -> number
}
```

#### 3. Model Downloader (`backend/services/modelDownloader.js`)

```javascript
class ModelDownloader {
  // Download a model from HuggingFace
  downloadModel(repo, files, onProgress) -> Promise

  // Get download status
  getDownloadStatus(jobId) -> { status, progress, speed, eta }

  // Cancel download
  cancelDownload(jobId)

  // Verify downloaded files
  verifyFiles(files) -> boolean

  // Get downloaded models list
  getDownloadedModels() -> Array
}
```

#### 4. CLI Mode Handler (`backend/services/cliHandler.js`)

```javascript
class CLIHandler {
  // Generate single image using CLI mode
  generateImage(modelId, params) -> Promise<Buffer>

  // Build CLI command from parameters
  buildCommand(modelConfig, params) -> Array<string>

  // Parse CLI output for result path
  parseOutput(output) -> string
}
```

#### 5. Queue Processor Updates

```javascript
// Update queueProcessor.js to:
// 1. Check if required model is running
// 2. Start model if on_demand and not running
// 3. Use model-specific API endpoint
// 4. For CLI mode, use CLIHandler instead of HTTP API

async function processJob(job) {
  const modelConfig = modelManager.getModel(job.model);

  // Ensure model is running (for server mode)
  if (modelConfig.exec_mode === 'server') {
    if (!modelManager.isModelRunning(job.model)) {
      await modelManager.startModel(job.model);
      // Wait for server to be ready
      await waitForServerReady(modelConfig.api);
    }
  }

  // Process based on exec mode
  if (modelConfig.exec_mode === 'cli') {
    return await processCLIJob(job, modelConfig);
  } else {
    return await processHTTPJob(job, modelConfig);
  }
}
```

---

### API Endpoints

#### Model Management

```
GET    /api/models                    - List all models
GET    /api/models/:id                - Get model details
GET    /api/models/:id/status         - Get model running status
POST   /api/models/:id/start          - Start a model process
POST   /api/models/:id/stop           - Stop a model process
GET    /api/models/running            - Get running models list
```

#### Model Downloads

```
POST   /api/models/download           - Start model download
GET    /api/models/download/:id       - Get download status
DELETE /api/models/download/:id       - Cancel download
GET    /api/models/downloaded          - List downloaded models
```

---

### Frontend Components

#### 1. Model Selector (`frontend/src/components/ModelSelector.jsx`)

```jsx
// Dropdown in header to select current model
// Shows running status with indicator
// Quick start/stop buttons for on_demand models
```

#### 2. Model Manager (`frontend/src/components/ModelManager.jsx`)

```jsx
// Full model management interface (new page/tab)
// Table of all models with:
//   - Model name and description
//   - Running status (with start/stop buttons)
//   - Mode badge (on_demand/preload, server/cli)
//   - Download button if not downloaded
//   - Settings/configuration
```

#### 3. Download Progress (`frontend/src/components/ModelDownload.jsx`)

```jsx
// Download progress dialog
// Shows: progress bar, speed, ETA
// Cancel button
```

#### 4. Queue Updates

```jsx
// Update Queue.jsx to show:
// - Model being used for each job
// - Model status indicators
// - "Waiting for model to start..." status
```

---

## Database Schema Updates

### Add models table

```sql
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  command TEXT NOT NULL,
  args TEXT, -- JSON array
  api TEXT,
  mode TEXT DEFAULT 'on_demand', -- on_demand, preload
  exec_mode TEXT DEFAULT 'server', -- server, cli
  port INTEGER,
  huggingface_repo TEXT,
  huggingface_files TEXT, -- JSON array
  downloaded BOOLEAN DEFAULT 0,
  download_path TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE TABLE IF NOT EXISTS model_processes (
  model_id TEXT PRIMARY KEY,
  pid INTEGER,
  port INTEGER,
  exec_mode TEXT,
  status TEXT, -- starting, running, stopping, stopped, error
  started_at INTEGER,
  last_heartbeat_at INTEGER,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_downloads (
  id TEXT PRIMARY KEY,
  model_id TEXT,
  status TEXT, -- pending, downloading, completed, failed, cancelled
  progress REAL DEFAULT 0,
  bytes_downloaded INTEGER DEFAULT 0,
  total_bytes INTEGER,
  error TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  completed_at INTEGER,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
);
```

### Update queue table

```sql
-- Add model_id column if not exists
ALTER TABLE queue ADD COLUMN model_id TEXT;
```

---

## Implementation Steps

### Phase 1: Core Infrastructure
1. Create `backend/services/modelManager.js`
2. Create `backend/services/processTracker.js`
3. Add database schema for models
4. Create `models.yml` configuration loader

### Phase 2: CLI Mode Support
1. Create `backend/services/cliHandler.js`
2. Implement CLI command building
3. Implement CLI output parsing
4. Update queue processor for CLI mode

### Phase 3: Server Mode Management
1. Implement process spawning in modelManager
2. Implement server health checks
3. Implement graceful shutdown
4. Update queue processor for server mode

### Phase 4: Model Downloads
1. Create `backend/services/modelDownloader.js`
2. Implement HuggingFace API integration
3. Create download status tracking
4. Implement file verification

### Phase 5: Frontend Integration
1. Create ModelSelector component
2. Create ModelManager page
3. Create ModelDownload component
4. Update Queue component for model display
5. Update header with model selector

### Phase 6: Testing
1. Unit tests for modelManager
2. Unit tests for processTracker
3. Unit tests for cliHandler
4. Integration tests for queue with models
5. Frontend component tests

---

## Process Lifecycle

### On-Demand Server Mode

```
Request arrives
  → Check if model running
  → If not running:
      - Find available port
      - Spawn server process
      - Wait for health check
      - Mark as running
  → Process generation
  → After idle timeout:
      - Stop process
      - Free port
```

### Preload Server Mode

```
Server startup
  → Start all preload models
  → Monitor process health
  → Auto-restart on crash

Requests processed immediately
```

### CLI Mode

```
Request arrives
  → Build CLI command with parameters
  → Spawn CLI process
  → Wait for completion
  → Parse output for image path
  → Read and return image
  → Process exits naturally
```

---

## Error Handling

### Process Start Failures
- Retry with exponential backoff
- Log error details
- Update model status to 'error'
- Notify user via toast

### Process Crashes
- Detect via missing heartbeat
- Log crash details
- Restart preload models automatically
- Mark on_demand models as stopped
- Complete current queue job as failed

### Port Conflicts
- Auto-assign alternative ports
- Update model config with new port
- Log port assignments

### Download Failures
- Support resume/pause
- Verify checksums
- Retry on network errors
- Clean up partial files on cancel

---

## Security Considerations

1. **Command Injection** - Validate all model configurations
2. **Port Security** - Bind to localhost only by default
3. **File Access** - Restrict file paths to allowed directories
4. **Process Isolation** - Run with minimal permissions
5. **Download Validation** - Verify file checksums after download

---

## Configuration Notes

- `mode: "on_demand"` - Start server when needed, stop after idle timeout
- `mode: "preload"` - Start server on app startup, keep running
- `exec_mode: "server"` - Long-running HTTP server process
- `exec_mode: "cli"` - One-shot process per image generation

CLI mode is recommended for:
- Low-resource systems
- Models that don't support server mode
- Single-image generations

Server mode is recommended for:
- Batch generations
- Queue-heavy workloads
- Models with long startup times
