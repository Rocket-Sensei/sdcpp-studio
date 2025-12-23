# SD WebUI

A modern web interface for Stable Diffusion image generation via OpenAI-compatible API.

## Features

- **Text-to-Image Generation** - Generate images from text prompts with full parameter control
- **Image-to-Image Generation** - Edit images or create variations
- **History** - Browse all your generated images with download and delete options
- **Dark Theme** - Sleek dark interface for comfortable viewing
- **Random Seeds** - Each generation uses a random seed (set custom seed for reproducibility)
- **Persistent Storage** - All generations saved to SQLite database with images stored on disk

## Tech Stack

- **Backend**: Node.js with Express
- **Frontend**: React with Vite
- **UI Components**: shadcn/ui with Radix UI
- **Styling**: Tailwind CSS v4
- **Database**: SQLite with better-sqlite3
- **Testing**: Vitest

## Getting Started

### Prerequisites

- Node.js 18+
- A Stable Diffusion API server (e.g., stable-diffusion.cpp)

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

Set the `SD_API_ENDPOINT` environment variable to point to your Stable Diffusion API:

```bash
export SD_API_ENDPOINT="http://192.168.2.180:1234/v1"
npm run dev:backend
```

## API Endpoints

- `POST /api/generate` - Text-to-image generation
- `POST /api/edit` - Image-to-image editing
- `POST /api/variation` - Create image variations
- `GET /api/generations` - List all generations
- `GET /api/generations/:id` - Get single generation
- `GET /api/images/:imageId` - Get image file
- `DELETE /api/generations/:id` - Delete generation

## Project Structure

```
sd-webui/
├── backend/           # Express API server
│   ├── db/           # Database setup and queries
│   ├── services/     # Image generation service
│   └── server.js     # Main server file
├── frontend/         # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── hooks/       # Custom hooks
│   │   └── lib/         # Utilities
│   └── dist/           # Built files
├── data/             # Database and images (gitignored)
└── tests/            # Vitest tests
```

## License

MIT
