# VRAM Memory Management Feature

> Feature specification for runtime memory management in sd.cpp Studio

## Overview

sd.cpp Studio manages multiple AI image generation models (Z-Image, FLUX, Qwen, SDXL, etc.), each consisting of several GPU components:

- **Diffusion model** - The core image generation backbone (UNet/DiT/Flux/ZImage)
- **VAE** - Variational Autoencoder for encoding/decoding latents
- **Text encoders** - CLIP-L, T5-XXL, LLM (for prompt encoding)
- **CLIP Vision** - For image-to-image and edit modes

Users with limited VRAM (4-12GB) need careful control over which components load to GPU vs CPU. Currently, memory flags like `--offload-to-cpu`, `--clip-on-cpu`, `--vae-on-cpu`, `--diffusion-fa` are **hardcoded in each model's YAML config** and cannot be changed at runtime. Additionally, the choice of `exec_mode` (CLI vs server) is statically configured per model, even though it has a major impact on VRAM usage.

This feature adds:

1. **GPU detection** - Auto-detect GPU name and VRAM via `nvidia-smi` or `gpustat`
2. **Automatic exec_mode selection** - Use CLI mode by default (lower VRAM), server mode only when batching
3. **Component visualization** - Show which model components will load where (GPU/CPU)
4. **Global memory defaults** - Centralized memory flags in `settings.yml`
5. **Runtime memory panel** - UI toggles to override flags per-generation
6. **VRAM estimation** - Real-time estimation of VRAM usage vs available budget

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  GeneratePanel.jsx          │  MemoryPanel.jsx (new)           │
│  - Mode tabs                │  - GPU info display               │
│  - Model selector           │  - Memory flag toggles            │
│  - Image settings           │  - Component visualization        │
│  - [Generate button]        │  - VRAM estimation bar           │
│                             │  - Exec mode indicator (CLI/SVR) │
│                             │  - "Keep model loaded" toggle    │
└──────────────┬──────────────┴──────────────────────────────────┘
               │ /api/gpu-info, /api/memory/estimate
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Backend (Express.js)                        │
├─────────────────────────────────────────────────────────────────┤
│  gpuService.js (new)        │  modelManager.js                 │
│  - nvidia-smi parsing        │  - Merged memory flags            │
│  - VRAM detection           │  - startModel() with args        │
│                             │  - CLI command derivation         │
│  memoryCalculator.js (new)  │                                   │
│  - From docs/memory-         │  queueProcessor.js               │
│    usage-calculation.md     │  - Auto exec_mode selection       │
│                             │  - CLI for n=1, server for n>1   │
└─────────────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Config System (YAML)                         │
├─────────────────────────────────────────────────────────────────┤
│  settings.yml                 │  models-*.yml                    │
│  - memory_defaults:           │  - Per-model args (model files)  │
│      offload_to_cpu: true     │  - memory_overrides (optional)  │
│      clip_on_cpu: true        │  - exec_mode: "auto" (default)  │
│      vae_on_cpu: false        │                                   │
│      vae_tiling: false        │                                   │
│      diffusion_fa: true        │                                   │
│  - default_exec_mode: "auto"  │                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Config loading**: `modelManager.js` loads YAML configs, merges `memory_defaults` from `settings.yml` into each model's effective args
2. **GPU detection**: Backend queries `nvidia-smi` on startup and exposes via `/api/gpu-info`
3. **Memory estimation**: Frontend sends model + settings to `/api/memory/estimate`, backend uses calculator from `docs/memory-usage-calculation.md`
4. **Exec mode selection**: queueProcessor auto-selects CLI or server mode based on quantity and model capabilities
5. **Generation**: Frontend sends memory flags with generation request, queueProcessor passes to modelManager for process restart if needed

---

## GPU Detection

### Implementation Location

`backend/services/gpuService.js` (new file)

### Detection Strategy

```javascript
// Priority: nvidia-smi > gpustat > unknown

// nvidia-smi output:
// +-----------------------------------------------------------------+
// | NVIDIA-SMI 525.147.05   Driver Version: 525.147.05   CUDA Version: 12.0     |
// |-------------------------------+----------------------+----------------------+
// | GPU  Name        Persistence-M| Bus-Id        Disp.A | Volatile Uncorr. ECC |
// | Fan  Temp  Perf  Pwr:Usage/Cap|         Memory-Usage | GPU-Util  Compute M. |
// |===============================+======================+======================|
// |   0  NVIDIA GeForce ...  Off  | 00000000:01:00.0 Off |                  N/A |
// |  0%   41C    P0    35W / 120W |      1MiB /  8192MiB |      0%      N/A     |
// +-------------------------------+----------------------+----------------------+

// gpustat output:
// {"gpus": [{"index": 0, "name": "NVIDIA GeForce RTX 3080", "memory.used": 1024, "memory.total": 10240}]}
```

### Response Format

```json
{
  "available": true,
  "name": "NVIDIA GeForce RTX 3080",
  "vramTotalMB": 10240,
  "driver": "525.147.05",
  "cudaVersion": "12.0",
  "method": "nvidia-smi"
}
```

### Fallback Behavior

| Tool Available | Response |
|----------------|----------|
| `nvidia-smi` | Parse GPU name, VRAM, driver, CUDA version |
| `gpustat` only | Parse name and VRAM, leave driver/CUDA as null |
| Neither | Return `{ available: false, name: "Unknown GPU", vramTotalMB: null }` |

### Future: NVML Integration

Future enhancement: Use [go-nvml](https://github.com/NVIDIA/go-nvml) bindings for more accurate GPU metrics (real-time VRAM usage, temperature, power draw).

---

## Config System Changes

### New Global Defaults in `settings.yml`

```yaml
# Global memory management defaults
# These can be overridden per-model in individual model YAML files

memory_defaults:
  # Phase-level offloading (weights freed between phases)
  offload_to_cpu: true
  
  # Component-specific CPU placement
  clip_on_cpu: true        # CLIP-L, T5-XXL, LLM text encoders
  vae_on_cpu: false        # VAE encoder/decoder
  
  # Memory optimization flags
  vae_tiling: false         # Process VAE in tiles (saves VRAM)
  diffusion_fa: true        # Flash attention (saves VRAM for attention)
  
  # Advanced VAE options
  vae_conv_direct: false    # Direct convolution (vs tiled)
  vae_tile_size: 32        # Tile size when vae_tiling: true
```

### Per-Model Override

Individual model configs can override any global default:

```yaml
# models-z-turbo.yml
models:
  z-image-turbo:
    name: "Z-Image Turbo"
    # ... other config ...
    
    # Override global memory defaults
    memory_overrides:
      offload_to_cpu: true
      clip_on_cpu: true
      diffusion_fa: true
    
    args:
      - "--diffusion-model"
      - "./models/z-image/..."
      # NOTE: Memory flags no longer duplicated here!
```

### Legacy Flag Migration

**Before** (current state - duplicate flags in every model):

```yaml
# models-z-turbo.yml
args:
  - "--diffusion-model"
  - "./models/z-image/..."
  - "--offload-to-cpu"      # DUPLICATED in every model!
  - "--clip-on-cpu"         # DUPLICATED in every model!
  - "--diffusion-fa"        # DUPLICATED in every model!
```

**After** (flags in global config, removed from per-model):

```yaml
# settings.yml
memory_defaults:
  offload_to_cpu: true
  clip_on_cpu: true
  diffusion_fa: true

# models-z-turbo.yml
args:
  - "--diffusion-model"
  - "./models/z-image/..."
  # No memory flags here!
```

The modelManager merges `memory_defaults` into effective args at startup.

### Flag Mapping

| Config Key | CLI Flag | Description |
|------------|----------|-------------|
| `offload_to_cpu` | `--offload-to-cpu` | Free weights between phases |
| `clip_on_cpu` | `--clip-on-cpu` | Load text encoders on CPU |
| `vae_on_cpu` | `--vae-on-cpu` | Load VAE on CPU |
| `vae_tiling` | `--vae-tiling` | Tile VAE decode |
| `diffusion_fa` | `--diffusion-fa` | Flash attention for diffusion |
| `vae_conv_direct` | `--vae-conv-direct` | Direct VAE convolution |
| `vae_tile_size` | `--vae-tile-size N` | VAE tile size |

---

## Automatic Exec Mode Selection (CLI vs Server)

### The Problem

sd.cpp has two binaries with fundamentally different memory behavior:

| Binary | `free_params_immediately` | Memory Behavior |
|--------|---------------------------|-----------------|
| `sd-server` | `false` | Weights stay in VRAM across phases - **cumulative** |
| `sd-cli` | `true` | Weights freed between phases - **peak of max phase** |

This is hardcoded in the sd.cpp source (`examples/server/main.cpp:304` vs `examples/cli/main.cpp:689`).

**Impact on VRAM**: For Z-Image Q8_0 at 1024x1024:
- **CLI mode** (`--offload-to-cpu --clip-on-cpu`): Peak = max(diffusion phase, vae phase) ~ 3.5 GB
- **Server mode** (no offload): Peak = clip + diffusion + vae accumulated ~ 10+ GB
- **Server mode** (`--offload-to-cpu`): Same as CLI for peak, but server stays resident for fast re-use

Currently every model has a static `exec_mode: "server"` or `exec_mode: "cli"` in its YAML config. Most models are configured as server mode because it's faster for interactive use. But this wastes VRAM when generating a single image.

### The Solution: Auto Mode

Instead of a fixed exec_mode, the queueProcessor will automatically select the mode:

```
exec_mode: "auto"   # New default - system picks CLI or server per-job
exec_mode: "server"  # Force server mode (legacy, for specific needs)
exec_mode: "cli"     # Force CLI mode (legacy)
exec_mode: "api"     # External API (unchanged)
```

### Selection Logic

```
if job.quantity == 1:
    use CLI mode (lower VRAM, weights freed between phases)
elif job.quantity > 1:
    use SERVER mode (keep model loaded, generate batch via HTTP API)
```

Additional heuristics (future):
- If model is already running as server and request arrives within auto-stop window, reuse the server
- If VRAM is tight (estimation shows >80% usage), prefer CLI even for batches
- User can force server mode via UI toggle ("Keep model loaded")

### Implementation: How It Works

The model configs already contain the same `args` (model loading flags like `--diffusion-model`, `--vae`, `--llm`) regardless of whether they run as CLI or server. The only differences at runtime are:

**Server mode** (modelManager.startModel adds):
- `--listen-port {port}` and `-l 127.0.0.1`
- Spawns `sd-server`, waits for HTTP readiness
- queueProcessor sends generation via HTTP POST

**CLI mode** (cliHandler.buildCommand adds):
- `-p "prompt"`, `-W width`, `-H height`, `--seed`, `--steps`, etc.
- Spawns `sd-cli`, waits for process exit, reads output image

So the switch is straightforward:
1. Model config defines `command: "./bin/sd-server"` as before (or a new `commands` field)
2. At generation time, queueProcessor checks quantity and selects mode
3. For CLI: swap command to `./bin/sd-cli`, pass args to cliHandler
4. For server: use existing server flow unchanged

### Config Changes

**Option A**: Add `cli_command` field alongside existing `command`:
```yaml
models:
  z-image-turbo:
    command: "./bin/sd-server"       # Used for server mode
    cli_command: "./bin/sd-cli"      # Used for CLI mode (default: replace sd-server -> sd-cli in command)
    exec_mode: "auto"               # New default
    args:
      - "--diffusion-model"
      - "./models/z-image/..."
      # Model-loading args shared between both modes
```

**Option B** (simpler): Auto-derive CLI command from server command by replacing `sd-server` -> `sd-cli` in the command string. No config changes needed.

Recommended: **Option B** with Option A as an override escape hatch.

### VRAM Impact Display

The memory panel should show both modes' VRAM requirements:

```
Mode: Auto (CLI for single, Server for batch)
  CLI peak:    ~3,500 MB  (weights freed between phases)
  Server peak: ~10,200 MB (weights stay in VRAM)
```

### What Changes in the Codebase

| File | Change |
|------|--------|
| `queueProcessor.js` | Auto-select exec_mode in `processJob()` based on quantity |
| `modelManager.js` | Support starting same model in CLI mode (derive CLI command) |
| `cliHandler.js` | Accept server-configured models (use their args, swap binary) |
| Model YAML configs | Change `exec_mode: "server"` to `exec_mode: "auto"` (or remove, make auto the default) |
| `settings.yml` | Add `default_exec_mode: "auto"` |
| Frontend | Show current mode indicator, optional "Keep model loaded" toggle |

---

## Model Component Memory Mapping

### Component Detection

Components are detected from model args via `FILE_FLAGS` in `backend/utils/modelHelpers.js`:

```javascript
const FILE_FLAGS = [
  '--diffusion-model',  // Main diffusion backbone
  '--model', '-m',
  '--vae',              // VAE encoder/decoder
  '--llm',              // LLM text encoder (Qwen)
  '--llm_vision',
  '--clip_l',           // CLIP-L text encoder
  '--t5xxl',            // T5-XXL text encoder
  '--clip',             // Generic CLIP
  '--clip_g',           // CLIP-G
  '--clip_vision',      // CLIP vision encoder
  '--embeddings',
  '--text_encoder',
  '--tokenizer',
  '--mmdit'             // DiT model variant
];
```

### Memory Placement Logic

| Flag Present | Component | Placement | Color |
|--------------|-----------|----------|-------|
| (none) | diffusion-model | GPU | Green |
| `--offload-to-cpu` | diffusion-model | GPU temporarily | Yellow |
| `--offload-to-cpu` | vae | GPU temporarily | Yellow |
| `--vae-on-cpu` | vae | CPU only | Orange |
| `--offload-to-cpu` | clip_l/t5xxl/llm | GPU temporarily | Yellow |
| `--clip-on-cpu` | clip_l/t5xxl/llm | CPU only | Orange |

### UI Component Visualization

```
┌─────────────────────────────────────────────────────┐
│ Model: Z-Image Turbo                    [Restart]  │
├─────────────────────────────────────────────────────┤
│ Components:                                         │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐             │
│usion│  │   │Diff   VAE   │  │   LLM   │  ...        │
│   │  Model  │  │         │  │         │             │
│   │   🟢    │  │   🟡    │  │   🟠    │             │
│   └─────────┘  └─────────┘  └─────────┘             │
│     GPU        Offload       CPU-only              │
└─────────────────────────────────────────────────────┘
```

---

## VRAM Estimation

### Integration

The JavaScript calculator from `docs/memory-usage-calculation.md` is ported to `backend/services/memoryCalculator.js`.

### Calculator Input

```javascript
{
  arch: 'z-image',           // Architecture key
  diffusionQuant: 'Q8_0',    // Quantization
  textEncoderQuant: 'F16',
  vaeQuant: 'F32',
  width: 1024,
  height: 1024,
  flags: {
    offloadToCpu: true,
    clipOnCpu: true,
    vaeOnCpu: false,
    vaeTiling: false,
    diffusionFlashAttn: true
  }
}
```

### Calculator Output

```javascript
{
  arch: 'z-image',
  imageSize: '1024x1024',
  quantization: { diffusion: 'Q8_0', textEncoder: 'F16', vae: 'F32' },
  flags: { offloadToCpu: true, clipOnCpu: true, ... },
  
  weights: {
    diffusionMB: 2600,
    textEncoderMB: 800,
    vaeMB: 160,
    totalMB: 3560
  },
  
  compute: {
    diffusionMB: 420,
    vaeMB: 680,
    textEncoderMB: 10
  },
  
  // CLI mode: free_params_immediately=true, peak = max of phases
  cliMode: {
    peakVramMB: 1100,
    phases: {
      phase1: { name: 'Text Encoding', vramMB: 10 },
      phase2: { name: 'Diffusion', vramMB: 1100 },
      phase3: { name: 'VAE Decode', vramMB: 680 }
    },
    fitsInVram: true,
    marginMB: 7092
  },
  
  // Server mode: free_params_immediately=false, weights accumulate
  serverMode: {
    peakVramMB: 4200,
    phases: {
      phase1: { name: 'Text Encoding', vramMB: 810 },
      phase2: { name: 'Diffusion', vramMB: 3810 },
      phase3: { name: 'VAE Decode', vramMB: 4200 }  // clip+diff still resident!
    },
    fitsInVram: true,
    marginMB: 3992
  },
  
  gpuVramMB: 8192,
  selectedMode: 'cli',  // What auto-mode would select for this job
}
```

### UI Display

```
┌─────────────────────────────────────────────────────┐
│ VRAM Usage (1024×1024)              Mode: Auto(CLI) │
│                                                     │
│ ████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│ 1100 MB / 8192 MB (13%)                            │
│                                                     │
│ CLI peak:    1100 MB (weights freed between phases) │
│ Server peak: 4200 MB (weights stay resident)        │
│                                                     │
│ ✅ Fits in VRAM - 7092 MB headroom                 │
└─────────────────────────────────────────────────────┘
```

### findMaxImageSize()

The calculator includes `findMaxImageSize(gpuVramMB, config)` - a binary search to find the maximum image size that fits in a given VRAM budget.

Used to show "Max size: 1024×1024" recommendations.

---

## Frontend UI Design

### Memory Panel Location

The Memory Panel appears in the **GeneratePanel** form, positioned:

- **Left of the Generate button** (bottom of form)
- **Collapsed by default** (click to expand)
- **Compact width** (~280px)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Prompt: [________________________________________________] [Generate]│
│                                                                       │
│ ┌────────────────────────┐  ┌─────────────────────────────────────┐  │
│ │ Image Settings        │  │ Memory Settings (click to expand)   │  │
│ │ ───────────────────── │  │ ▼ GPU: RTX 3080 (8GB)               │  │
│ │ Width: [1024___]      │  │                                     │  │
│ │ Height: [1024___]     │  │ Mode: Auto ▼  [ ] Keep model loaded │  │
│ │ Steps: [____9__]      │  │                                     │  │
│ │ CFG Scale: [___7.0]   │  │ [✓] Offload to CPU                  │  │
│ │                      │  │ [✓] CLIP on CPU                    │  │
│ │ Sampler: [Euler___▼]  │  │ [ ] VAE on CPU                     │  │
│ │                      │  │ [ ] VAE Tiling                      │  │
│ │ [Negative Prompt]    │  │ [✓] Flash Attention                │  │
│ └────────────────────────┘  │                                     │  │
│                             │ Components: D[🟢] V[🟡] L[🟠]        │  │
│                             │                                     │  │
│                             │ VRAM: ████░░░ 1100/8192 MB (13%)   │  │
│                             │ CLI: 1100 MB  SVR: 4200 MB         │  │
│                             │ Max: 2048×2048                     │  │
│                             └─────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

**"Keep model loaded" toggle**: When checked, forces server mode regardless of quantity. Useful for interactive workflows where the user is iterating on prompts and wants fast re-generation without model reload overhead.

### Component: `MemoryPanel.jsx`

**Location**: `frontend/src/components/settings/MemoryPanel.jsx`

**Props**:
```javascript
{
  selectedModel: string,        // Current model ID
  modelConfig: object,          // Model config from API
  gpuInfo: object,              // GPU info from /api/gpu-info
  imageWidth: number,
  imageHeight: number,
  onFlagsChange: (flags) => void  // Called when user toggles flags
}
```

**State**:
- `expanded` - Panel collapsed/expanded
- `flags` - Current memory flags (from global config + overrides)
- `estimation` - VRAM estimation from API

### Warning Banner

When user changes memory flags while model is running:

```
⚠️ Memory settings changed - model must restart to apply new settings
                  [Restart Model]  [Cancel]
```

This is critical because memory flags are **process startup flags**, not per-generation HTTP params.

### Component Color Legend

| Color | Meaning | When Shown |
|-------|---------|------------|
| 🟢 Green | Will load on GPU (fastest) | No offload flags |
| 🟡 Yellow | GPU + CPU offload | `--offload-to-cpu` without component-specific flags |
| 🟠 Orange | CPU only (slow) | `--clip-on-cpu`, `--vae-on-cpu` |
| 🔴 Red | Error / Cannot determine | Missing model info |

---

## Backend API

### New Endpoints

#### `GET /api/gpu-info`

Returns detected GPU information.

**Response**:
```json
{
  "available": true,
  "name": "NVIDIA GeForce RTX 3080",
  "vramTotalMB": 10240,
  "driver": "525.147.05",
  "cudaVersion": "12.0",
  "method": "nvidia-smi"
}
```

#### `GET /api/memory/estimate`

Estimate VRAM usage for a model + settings.

**Query Params**:
- `modelId` - Model identifier
- `width` - Image width
- `height` - Image height
- `offloadToCpu` - Override offload flag (0/1)
- `clipOnCpu` - Override CLIP CPU flag (0/1)
- `vaeOnCpu` - Override VAE CPU flag (0/1)
- `vaeTiling` - Override VAE tiling (0/1)
- `diffusionFa` - Override flash attention (0/1)

**Response**:
```json
{
  "arch": "z-image",
  "imageSize": "1024x1024",
  "weights": { "diffusionMB": 2600, "textEncoderMB": 800, "vaeMB": 160 },
  "compute": { "diffusionMB": 420, "vaeMB": 680 },
  "peakVramMB": 1100,
  "fitsInVram": true,
  "gpuVramMB": 8192,
  "marginMB": 7092,
  "maxImageSize": { "width": 2048, "height": 2048 }
}
```

#### `GET /api/models/:modelId/memory-components`

Returns component list with memory placement for a model.

**Response**:
```json
{
  "modelId": "z-image-turbo",
  "components": [
    { "name": "diffusion-model", "flag": "--diffusion-model", "placement": "gpu", "color": "green" },
    { "name": "vae", "flag": "--vae", "placement": "offload", "color": "yellow" },
    { "name": "llm", "flag": "--llm", "placement": "cpu", "color": "orange" }
  ]
}
```

#### `POST /api/models/:modelId/memory-flags`

Set memory flags for a model (triggers restart if running).

**Body**:
```json
{
  "offloadToCpu": true,
  "clipOnCpu": true,
  "vaeOnCpu": false,
  "vaeTiling": false,
  "diffusionFa": true
}
```

**Response**:
```json
{
  "success": true,
  "restartRequired": true,
  "message": "Memory flags updated. Model will restart on next generation."
}
```

---

## Implementation TODO List

### Phase 1: GPU Detection + Backend API

- [ ] Create `backend/services/gpuService.js` with nvidia-smi parsing
- [ ] Parse GPU name, total VRAM, driver version, CUDA version from `nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits`
- [ ] Fallback: try `gpustat --json` if nvidia-smi unavailable
- [ ] Fallback: return `{ available: false, name: "?", vramTotalMB: null }` if neither tool found
- [ ] Cache GPU info on first query (GPU doesn't change at runtime)
- [ ] Add `GET /api/gpu-info` endpoint in backend routes
- [ ] Add unit tests for gpuService.js with mocked nvidia-smi output

### Phase 2: Config System Refactor (memory_defaults)

- [ ] Add `memory_defaults` section to `backend/config/settings.yml`:
  ```yaml
  memory_defaults:
    offload_to_cpu: true
    clip_on_cpu: true
    vae_on_cpu: false
    vae_tiling: false
    diffusion_fa: true
  ```
- [ ] Update `modelManager.js` to read `memory_defaults` and merge into effective model args
- [ ] Support per-model `memory_overrides` in model YAML configs
- [ ] Merge priority: per-model `memory_overrides` > global `memory_defaults` > hardcoded args
- [ ] Remove duplicate `--offload-to-cpu`, `--clip-on-cpu`, `--diffusion-fa` from `models-z-turbo.yml`
- [ ] Remove duplicate memory flags from `models-flux.yml`
- [ ] Remove duplicate memory flags from `models-qwen-image.yml`, `models-qwen-edit.yml`
- [ ] Remove duplicate memory flags from all remaining model YAML configs
- [ ] Add `default_exec_mode: "auto"` to `settings.yml`
- [ ] Verify all models still start correctly after migration (manual test)

### Phase 3: Automatic Exec Mode Selection (CLI vs Server)

- [ ] Add `exec_mode: "auto"` support in queueProcessor.js `processJob()`:
  - `quantity == 1` -> use CLI mode
  - `quantity > 1` -> use server mode (keep model loaded for batch)
- [ ] Update `cliHandler.js` to accept server-configured models:
  - Derive CLI command by replacing `sd-server` -> `sd-cli` in `model.command`
  - Use model's `args` (model-loading flags) directly
  - Add generation-specific args (`-p`, `-W`, `-H`, `--seed`, etc.) as cliHandler already does
- [ ] Update `modelManager.js`:
  - Support `cli_command` field as optional override (fallback: auto-derive from `command`)
  - When auto-mode selects CLI, skip server startup/port allocation entirely
- [ ] Update model YAML configs: change `exec_mode: "server"` to `exec_mode: "auto"` (or omit for default)
- [ ] Handle edge case: model already running as server when CLI job arrives (reuse server? or let it be?)
- [ ] Handle edge case: rapid successive single-image requests (don't restart between each)
- [ ] Add "Keep model loaded" toggle in frontend that forces server mode
- [ ] Add tests for auto-selection logic

### Phase 4: Frontend Memory Panel

- [ ] Create `frontend/src/components/MemoryPanel.jsx`
- [ ] Position in GeneratePanel.jsx: near bottom, left of Generate button
- [ ] Collapsible by default, shows compact GPU info summary when collapsed
- [ ] Expanded view shows:
  - GPU name and VRAM (from `/api/gpu-info`)
  - Memory flag toggles (offload_to_cpu, clip_on_cpu, vae_on_cpu, vae_tiling, diffusion_fa)
  - Current exec mode indicator (Auto / CLI / Server)
  - Optional "Keep model loaded" toggle
- [ ] Add "restart required" warning when flags change while model is running
- [ ] Wire toggle changes to backend via `/api/models/:modelId/memory-flags`

### Phase 5: Model Component Visualization

- [ ] Add component detection using FILE_FLAGS from `modelHelpers.js`
- [ ] Determine placement per-component based on active memory flags:
  - Green: GPU resident (no offload)
  - Yellow: GPU temporarily / CPU offloaded (`--offload-to-cpu`)
  - Orange/Red: CPU only (`--clip-on-cpu`, `--vae-on-cpu`)
- [ ] Display format like models-cli.js: `3/3 present (diffusion-model, vae, llm)` with colored component names
- [ ] Add `GET /api/models/:modelId/memory-components` endpoint
- [ ] Show component badges in MemoryPanel

### Phase 6: VRAM Estimation Integration

- [ ] Port JavaScript calculator from `docs/memory-usage-calculation.md` to `backend/services/memoryCalculator.js`
- [ ] Map model IDs to architecture keys (need `architecture` field in model config or auto-detect)
- [ ] Add `GET /api/memory/estimate` endpoint accepting modelId, width, height, flags
- [ ] Return per-phase VRAM breakdown, peak VRAM, fits-in-VRAM boolean
- [ ] Show both CLI and server mode estimates in response
- [ ] Add `findMaxImageSize()` and show "Max size: NxN" recommendation in UI
- [ ] Add VRAM usage bar in MemoryPanel (estimated / total)
- [ ] Live-update estimation when image size or flags change

### Phase 7: Polish & Testing

- [ ] Add localStorage persistence for user memory flag preferences
- [ ] Error handling: GPU detection failures, estimation errors
- [ ] Loading states for VRAM estimation
- [ ] Test on systems without NVIDIA GPU (graceful "?" display)
- [ ] Test memory flag changes trigger model restart
- [ ] Test auto exec_mode selection with quantity=1 and quantity>1
- [ ] Test CLI mode fallback for all server-configured models
- [ ] Integration tests for full generation flow in both modes
- [ ] Update CLAUDE.md with new config fields and API endpoints

---

## Key Design Notes

1. **Memory flags are startup flags** - Changing them requires model restart. The UI explicitly warns users of this.

2. **Config merge priority**: Per-model `memory_overrides` > global `memory_defaults` > hardcoded args (legacy)

3. **Graceful degradation** - When GPU is not detected, show "?" for VRAM and disable estimation features.

4. **Quantization detection** - Use existing `extractQuantFromFilename()` from modelHelpers.js to detect Q8_0, Q4_K_M, etc.

5. **Architecture mapping** - Map model IDs to architecture keys (z-image → z-image, flux1 → flux1, sd15 → sd1.5, sdxl → sdxl)

6. **Memory flags apply to both modes** - `--offload-to-cpu`, `--clip-on-cpu`, etc. are model-loading flags that work with both `sd-server` and `sd-cli`. CLI mode inherently uses less VRAM due to `free_params_immediately=true`, but the flags still control component placement.

7. **One server at a time** - Only one server-mode model can run. Memory flag changes affect whichever model is running or next to run.

8. **Auto exec_mode is the default** - Most generations use CLI mode (lower VRAM). Server mode is only used when generating multiple images (`n > 1`) to keep the model loaded between generations. Users can force server mode via a "Keep model loaded" toggle.

9. **CLI mode is the VRAM-friendly mode** - `sd-cli` uses `free_params_immediately=true`, meaning weights are freed between the text encoding, diffusion, and VAE phases. Peak VRAM = max of any single phase. Server mode keeps all weights resident for fast re-use but at higher VRAM cost.
