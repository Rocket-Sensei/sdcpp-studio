# Application Code Structure

sd.cpp Studio is a full-stack Node.js application with an Express backend and React frontend.

## Directory Structure

```
sd.cpp-studio/
├── backend/                 # Express API server
│   ├── db/                 # Database layer
│   │   ├── database.js     # Database initialization and schema
│   │   ├── queries.js      # Generations and images queries
│   │   └── queueQueries.js # Queue management queries
│   ├── services/           # Business logic
│   │   ├── imageService.js # Image generation API calls
│   │   └── queueProcessor.js # Background job processor
│   ├── data/               # SQLite database and images (gitignored)
│   └── server.js           # Express server entry point
├── frontend/               # React + Vite frontend
│   ├── dist/              # Built files (gitignored)
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── ui/        # shadcn/ui components
│   │   │   ├── TextToImage.jsx
│   │   │   ├── ImageToImage.jsx
│   │   │   ├── History.jsx
│   │   │   └── Queue.jsx
│   │   ├── hooks/         # Custom React hooks
│   │   │   ├── useToast.jsx
│   │   │   └── useImageGeneration.jsx
│   │   ├── lib/           # Utilities
│   │   │   └── utils.jsx
│   │   ├── App.jsx        # Main app component
│   │   └── main.jsx       # React entry point
│   ├── index.html
│   └── vite.config.js
├── tests/                  # Vitest tests
│   └── imageGeneration.test.js
├── docs/                   # Documentation
├── .github/
│   └── workflows/
│       └── test.yml        # GitHub Actions CI
├── .gitignore
├── package.json
├── README.md
└── LICENSE
```

---

## Backend Architecture

### Database Layer (`backend/db/`)

#### `database.js`
- Initializes SQLite database with WAL mode
- Creates tables: `generations`, `generated_images`, `queue`
- Provides utility functions: `getDatabase()`, `getImagesDir()`, `deleteGeneration()`

#### `queries.js`
- `getAllGenerations()` - Get all generations
- `getGenerationById(id)` - Get single generation with images
- `getImageById(id)` - Get single image metadata
- `getImagesByGenerationId(id)` - Get all images for a generation
- `createGeneration(data)` - Create new generation record
- `createGeneratedImage(data)` - Save image to disk and create record

#### `queueQueries.js`
- `addToQueue(params)` - Add job to queue
- `getJobById(id)` - Get single job
- `getJobs(status, limit)` - Get jobs with optional status filter
- `getNextPendingJob()` - Get next job to process
- `updateJobStatus(id, status, data)` - Update job status/progress
- `cancelJob(id)` - Cancel a job
- `getQueueStats()` - Get queue statistics

### Services Layer (`backend/services/`)

#### `imageService.js`
- `generateImageDirect(params, mode)` - Direct API call, returns raw response
- `generateImage(params, mode)` - Full generation with database save
- Handles prompt parsing for SD-CPP extra args and negative prompts
- Supports modes: `generate`, `edit`, `variation`

#### `queueProcessor.js`
- `startQueueProcessor(intervalMs)` - Start background job processor
- `stopQueueProcessor()` - Stop the processor
- `getCurrentJob()` - Get currently processing job
- Processes jobs sequentially from pending queue
- Updates job progress and status

### API Server (`backend/server.js`)

Express server with middleware:
- CORS enabled
- JSON body parsing (50MB limit)
- Multipart file upload (50MB limit)
- Static file serving from frontend/dist

**Routes:**
- Health & config: `/api/health`, `/api/config`
- Sync generation: `/api/generate`, `/api/edit`, `/api/variation`
- Queue: `/api/queue/*`
- Generations: `/api/generations/*`
- Images: `/api/images/:imageId`

---

## Frontend Architecture

### Component Structure

#### Main Components (`frontend/src/components/`)

**`TextToImage.jsx`**
- Form for text-to-image generation
- Queue mode toggle
- Settings injection from "Create More" feature
- Parameters: prompt, negative prompt, size, n, quality, style, seed

**`ImageToImage.jsx`**
- Image upload form for edit/variation
- Similar parameters to TextToImage
- File preview and validation

**`History.jsx`**
- Grid of completed generations
- Image modal with navigation for batch results
- Download and delete functionality
- "Create More" button to reuse settings

**`Queue.jsx`**
- Real-time queue display (polls every 2 seconds)
- Job cards with status badges
- Progress bar for processing jobs
- Error display for failed jobs

#### UI Components (`frontend/src/components/ui/`)

shadcn/ui components built with Radix UI:
- `button.jsx` - Button variants
- `card.jsx` - Card containers
- `dialog.jsx` - Modal dialogs
- `input.jsx` - Text input
- `label.jsx` - Form labels
- `select.jsx` - Dropdown selects
- `slider.jsx` - Range slider
- `switch.jsx` - Toggle switch
- `tabs.jsx` - Tab navigation
- `textarea.jsx` - Multi-line text input
- `toast.jsx` - Toast notifications
- `badge.jsx` - Status badges
- `progress.jsx` - Progress bars

### Custom Hooks (`frontend/src/hooks/`)

**`useImageGeneration.jsx`**
- `generate(params)` - Synchronous generation
- `generateQueued(params)` - Add to queue
- Returns: `{ generate, generateQueued, isLoading, error, result }`

**`useGenerations.jsx`**
- `fetchGenerations()` - Load all generations
- `deleteGeneration(id)` - Delete a generation
- Returns: `{ fetchGenerations, deleteGeneration, isLoading, error, generations }`

**`useToast.jsx`**
- Toast notification system
- `addToast(title, message, variant)` - Show toast

### Main App (`frontend/src/App.jsx`)

- Tab-based navigation in header
- Model display in header
- State management for active tab and settings
- "Create More" functionality

---

## Data Flow

### Synchronous Generation Flow
```
User submits form
  → TextToImage component
  → useImageGeneration.generate()
  → POST /api/generate
  → imageService.generateImage()
  → SD-CPP API (waits for response)
  → Save to database
  → Return result
  → Show in History
```

### Queue-based Generation Flow
```
User submits form
  → TextToImage component
  → useImageGeneration.generateQueued()
  → POST /api/queue/generate
  → addToQueue()
  → Return job_id immediately
  → queueProcessor picks up job
  → imageService.generateImageDirect()
  → SD-CPP API
  → Update job status/progress
  → Save to database
  → Job completed
  → Show in History
```

---

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Server**: Express.js
- **Database**: SQLite with better-sqlite3
- **File Upload**: Multer
- **External API**: stable-diffusion.cpp (OpenAI-compatible)

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 5
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS v4
- **Icons**: lucide-react
- **State**: React hooks (useState, useEffect, useCallback)

### Testing
- **Test Runner**: Vitest
- **Coverage**: Tests cover database operations, seed generation, prompt parsing

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `DB_PATH` | SQLite database path | `backend/data/sd-cpp-studio.db` |
| `IMAGES_DIR` | Images storage directory | `backend/data/images` |
