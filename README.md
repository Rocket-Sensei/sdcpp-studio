# sd.cpp Studio

A modern web interface for Stable Diffusion image generation via stable-diffusion.cpp.

While this application supports any OpenAI-compatible Images API, it is primarily designed as a GUI for [stable-diffusion.cpp](https://github.com/leejet/stable-diffusion.cpp).

See [PR #1037](https://github.com/leejet/stable-diffusion.cpp/pull/1037) for SD-CPP server documentation.

## Features

### Image Generation
- **Text-to-Image Generation** - Generate images from text prompts with full parameter control
- **Image-to-Image Generation** - Edit images or create variations
- **Image Upscaling** - Upscale images with RealESRGAN or simple resize
- **Multiple Model Support** - Z-Image-Turbo, Shuttle-3-Diffusion, FLUX, Qwen Image, Copax Timeless XL+Z1

### User Interface
- **Dark Theme** - Sleek dark interface for comfortable viewing
- **Queue System** - Queue multiple generations and track progress
- **Unified Gallery** - Browse all generations (active jobs and completed)
- **Log Viewer** - Terminal-style log display with real-time WebSocket updates
- **WebSocket Status** - Clickable indicator shows connection status and opens logs

### Developer Features
- **Random Seeds** - Each generation uses a random seed (set custom seed for reproducibility)
- **Persistent Storage** - All generations saved to SQLite database with images stored on disk
- **SD.next API Compatibility** - Compatible with SillyTavern and other SD.next clients
- **Per-Model Configuration** - Each model can have custom generation parameters and startup timeouts

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: React with Vite
- **UI Components**: shadcn/ui with Radix UI
- **Styling**: Tailwind CSS v4
- **Database**: SQLite with better-sqlite3
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 20+
- stable-diffusion.cpp binaries (`/bin/sd-server`, `/bin/sd-cli`)

### Installation

```bash
# Install dependencies
npm install

# Run development servers (backend on :3000, frontend on :5173)
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

### Configuration

Models are configured in YAML files in `backend/config/`:

- **settings.yml** - Global defaults
- **models-z-turbo.yml** - Z-Image Turbo (port 1238)
- **models-shuttle.yml** - Shuttle-3-Diffusion (port 1410)
- **models-flux.yml** - FLUX models (ports 1234, 1409, 1412)
- **models-qwen-image.yml** - Qwen Image (port 1400)
- **models-qwen-edit.yml** - Qwen Image Edit variants
- **models-copax.yml** - Copax Timeless XL+Z1 (port 1406)

Each model specifies:
- `id`: Internal identifier
- `name`: Display name
- `command`: Path to binary (e.g., `./bin/sd-server`)
- `args`: Command-line arguments (MUST include `--steps` for server mode)
- `port`: HTTP port (server mode)
- `exec_mode`: Execution mode (`server`, `cli`, `api`)
- `mode`: `on_demand` or `preload`
- `startup_timeout`: Optional startup timeout in milliseconds (default: 90000)
- `generation_params`: Default parameters (cfg_scale, sample_steps, sampling_method)

## API Endpoints

### Queue API
- `POST /api/queue/generate` - Queue text-to-image generation
- `POST /api/queue/edit` - Queue image-to-image editing
- `POST /api/queue/upscale` - Queue upscaling
- `DELETE /api/queue/:id` - Cancel a queued job
- `GET /api/queue` - List queued jobs

### Generations API
- `GET /api/generations` - List all generations
- `GET /api/generations/:id` - Get single generation
- `GET /api/images/:imageId` - Get image file
- `DELETE /api/generations/:id` - Delete generation

### Logs API
- `GET /api/logs` - Fetch all logs
- `GET /api/logs/:generationId` - Fetch logs for specific generation

### Models API
- `GET /api/models` - List all configured models
- `POST /api/models/:id/start` - Start a model
- `POST /api/models/:id/stop` - Stop a model
- `GET /api/models/:id/status` - Get model status

### SD.next Compatibility (for SillyTavern)
- `GET /sdapi/v1/progress` - Progress endpoint
- `GET /sdapi/v1/samplers` - Available sampling methods
- `GET /sdapi/v1/upscalers` - Available upscalers
- `POST /sdapi/v1/extra-single-image` - Upscaling endpoint
- `GET /sdapi/v1/options` - Model options

## Project Structure

```
sd.cpp-studio/
├── backend/           # Express API server
│   ├── config/        # YAML model configurations
│   ├── db/           # Database setup and queries
│   ├── services/     # Business logic services
│   ├── utils/        # Utilities (logger, etc.)
│   └── server.js     # Main server file
├── frontend/         # React frontend
│   └── src/
│       ├── components/  # React components
│       ├── hooks/       # Custom hooks
│       └── lib/         # Utilities
├── data/             # Database and images (gitignored)
├── logs/             # Application logs
└── tests/            # Vitest tests
```

## Development

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

## Important Notes

1. **Server Mode Steps**: Server-mode models MUST include `--steps` in the `args` array because SD.cpp doesn't support the steps parameter via HTTP API.

2. **Port Conflicts**: Only one server-mode model can run at a time. The queue processor automatically stops conflicting models.

3. **Image Storage**: Images are saved to disk in `/backend/data/images/`. The database only stores file paths.

4. **SD.cpp Args**: Extra args (cfg_scale, sampling_method, etc.) are injected into prompts as XML tags (`<sd_cpp_extra_args>`).

## License

Apache-2.0

## Author

Built by Rocket Sensei with GLM 4.7
