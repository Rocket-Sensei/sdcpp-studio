# REST API Documentation

sd.cpp Studio provides a REST API for image generation, queue management, model management, and more.

## Base URL

```
http://localhost:3000/api
```

---

## Health & Configuration

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-23T12:00:00.000Z"
}
```

### GET /config

Get API configuration including SD API endpoint, default model, and authentication status.

**Response:**
```json
{
  "sdApiEndpoint": "http://192.168.2.180:1234/v1",
  "model": "qwen-image",
  "authEnabled": true
}
```

---

## Image Generation (Synchronous)

These endpoints provide a synchronous API that internally uses the queue system. The job is queued, the model is automatically started if needed, and the endpoint waits for completion before returning the result.

**Note:** These endpoints keep the HTTP connection open while the generation is in progress (up to 5 minutes). For long-running operations, consider using the Queue Management API instead.

### POST /generate

Generate image(s) from text prompt (text-to-image).

**Request Body:**
```json
{
  "prompt": "string (required)",
  "model": "string (required, model ID from models.yml e.g., qwen-image, z-image-turbo)",
  "negative_prompt": "string (optional)",
  "size": "string (optional, default: 512x512)",
  "n": "number (optional, default: 1, min: 1, max: 10)",
  "quality": "string (optional: auto, high, medium, low, hd, standard)",
  "style": "string (optional: vivid, natural)",
  "seed": "number (optional, for reproducibility)"
}
```

**Response:**
```json
{
  "id": "uuid",
  "created": 1234567890,
  "data": [
    {
      "id": "uuid",
      "index": 0,
      "revised_prompt": "string or null"
    }
  ]
}
```

### POST /edit

Edit image using text prompt (image-to-image).

**Request:** `multipart/form-data`
- `image`: File (required)
- `prompt`: string (required)
- `negative_prompt`: string (optional)
- `size`: string (optional)
- `n`: number (optional)
- `mask`: File (optional)

### POST /variation

Create variations of an image.

**Request:** `multipart/form-data`
- `image`: File (required)
- `prompt`: string (optional)
- `negative_prompt`: string (optional)
- `size`: string (optional)
- `n`: number (optional)
- `strength`: number (optional, default: 0.75, img2img strength)

---

## Queue Management (Asynchronous)

These endpoints add jobs to a queue for background processing.

### POST /queue/generate

Add text-to-image job to queue.

**Request Body:** Same as `/generate`

**Response:**
```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

### POST /queue/edit

Add edit job to queue.

**Request:** Same as `/edit` (multipart/form-data)

**Response:** Same as `/queue/generate`

### POST /queue/variation

Add variation job to queue.

**Request:** Same as `/variation` (multipart/form-data)

**Response:** Same as `/queue/generate`

### POST /queue/upscale

Add upscale job to queue.

**Request:** `multipart/form-data`
- `image`: File (required)
- `upscaler`: string (optional, default: "RealESRGAN 4x+")
- `resize_mode`: number (optional, default: 0 - by factor, 1 - to size)
- `upscale_factor`: number (optional, default: 2.0)
- `target_width`: number (optional, required when resize_mode=1)
- `target_height`: number (optional, required when resize_mode=1)

**Response:** Same as `/queue/generate`

### GET /queue

Get all jobs in queue with statistics.

**Query Parameters:**
- `status`: Filter by status (optional: pending, processing, completed, failed, cancelled)

**Response:**
```json
{
  "jobs": [
    {
      "id": "uuid",
      "type": "generate|edit|variation|upscale",
      "model": "qwen-image",
      "prompt": "string",
      "negative_prompt": "string or null",
      "size": "512x512",
      "seed": "string or null",
      "n": 1,
      "quality": "string or null",
      "style": "string or null",
      "input_image_path": "string or null",
      "status": "pending|processing|completed|failed|cancelled",
      "progress": 0.0,
      "error": "string or null",
      "created_at": 1234567890,
      "updated_at": 1234567890,
      "started_at": 1234567890 or null,
      "completed_at": 1234567890 or null
    }
  ],
  "stats": {
    "pending": 2,
    "processing": 1,
    "completed": 15,
    "failed": 0
  }
}
```

### GET /queue/:id

Get details of a specific job.

**Response:** Single job object (same format as above)

### DELETE /queue/:id

Cancel a pending or processing job.

**Response:**
```json
{
  "success": true,
  "job": { /* job object */ }
}
```

### POST /queue/cancel-all

Cancel all pending and processing jobs.

**Response:**
```json
{
  "success": true,
  "cancelled": 5
}
```

### GET /queue/stats

Get queue statistics.

**Response:**
```json
{
  "pending": 2,
  "processing": 1,
  "completed": 15,
  "failed": 0
}
```

---

## Generations & Images

### GET /generations

Get all generations (completed image generations).

**Query Parameters:**
- `limit`: Number of results per page (optional, default: 20)
- `offset`: Offset for pagination (optional, default: 0)

**Response:**
```json
[
  {
    "id": "uuid",
    "type": "generate|edit|variation|upscale",
    "model": "qwen-image",
    "prompt": "string",
    "negative_prompt": "string or null",
    "size": "512x512",
    "seed": "string or null",
    "n": 1,
    "created_at": 1234567890,
    "updated_at": 1234567890,
    "image_count": 1
  }
]
```

### GET /generations/:id

Get a single generation with its images.

**Response:**
```json
{
  "id": "uuid",
  "type": "generate|edit|variation|upscale",
  "model": "qwen-image",
  "prompt": "string",
  "negative_prompt": "string or null",
  "size": "512x512",
  "seed": "string or null",
  "n": 1,
  "created_at": 1234567890,
  "updated_at": 1234567890,
  "images": [
    {
      "id": "uuid",
      "generation_id": "uuid",
      "index_in_batch": 0,
      "file_path": "/path/to/image.png",
      "mime_type": "image/png",
      "width": 512,
      "height": 512,
      "revised_prompt": "string or null"
    }
  ]
}
```

### GET /images/:imageId

Get an image file by ID.

**Response:** Image file (Content-Type: image/png)

### GET /generations/:id/image

Get the first image for a generation (backwards compatibility).

**Response:** Image file (Content-Type: image/png)

### GET /generations/:id/images

Get metadata for all images in a generation.

**Response:** Array of image objects (same format as above)

### DELETE /generations/:id

Delete a generation and its associated image files.

**Response:**
```json
{
  "success": true
}
```

### DELETE /generations

Delete all generations.

**Query Parameters:**
- `delete_files`: boolean (optional, default: false) - Whether to delete image files from disk

**Response:**
```json
{
  "success": true,
  "deleted": 15
}
```

---

## Model Management

### GET /models

List all models with file status.

**Response:**
```json
{
  "models": [
    {
      "id": "qwen-image",
      "name": "Qwen Image",
      "description": "Text-to-image model",
      "capabilities": ["text-to-image", "image-to-image"],
      "exec_mode": "server|cli|api",
      "mode": "preload|on_demand",
      "port": 1400,
      "status": "stopped|starting|running|stopping|error",
      "fileStatus": {
        "allFilesExist": true,
        "files": [
          {
            "fileName": "model.gguf",
            "exists": true,
            "filePath": "/models/model.gguf"
          }
        ]
      },
      "huggingface": {
        "repo": "user/repo"
      }
    }
  ]
}
```

### GET /models/running

Get list of currently running models.

**Response:**
```json
[
  {
    "id": "qwen-image",
    "name": "Qwen Image",
    "port": 1400,
    "status": "running"
  }
]
```

### GET /models/downloaded

Get list of downloaded models (models where all files exist).

**Response:**
```json
{
  "models": [
    {
      "id": "qwen-image",
      "name": "Qwen Image",
      "fileStatus": { "allFilesExist": true }
    }
  ]
}
```

### GET /models/:id

Get details for a specific model.

**Response:** Single model object (same format as GET /models)

### GET /models/:id/status

Get the running status of a specific model.

**Response:**
```json
{
  "id": "qwen-image",
  "status": "running|stopped|starting|error",
  "port": 1400
}
```

### POST /models/:id/start

Start a model process (for on_demand server mode models).

**Response:**
```json
{
  "success": true,
  "status": "starting",
  "port": 1400
}
```

### POST /models/:id/stop

Stop a running model process.

**Response:**
```json
{
  "success": true,
  "status": "stopped"
}
```

### POST /models/download

Start a model download from HuggingFace.

**Request Body:**
```json
{
  "modelId": "qwen-image"
}
```

**Response:**
```json
{
  "downloadId": "uuid",
  "status": "downloading"
}
```

### GET /models/download/:id

Get status of a model download.

**Response:**
```json
{
  "status": "downloading|completed|failed",
  "progress": 0.5,
  "bytes_downloaded": 123456,
  "total_bytes": 987654
}
```

### DELETE /models/download/:id

Cancel an active model download.

**Response:**
```json
{
  "success": true
}
```

### GET /models/:id/files/status

Check if model files exist on disk.

**Response:**
```json
{
  "allFilesExist": true,
  "files": [
    {
      "fileName": "model.gguf",
      "exists": true,
      "filePath": "/models/model.gguf"
    }
  ]
}
```

---

## Logs

### GET /api/logs

Get all logs.

**Query Parameters:**
- `limit`: Maximum number of log entries to return (optional)

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2025-12-23T12:00:00.000Z",
      "level": "info",
      "message": "Log message",
      "module": "queueProcessor"
    }
  ]
}
```

### GET /generations/:id/logs

Get logs for a specific generation.

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2025-12-23T12:00:00.000Z",
      "level": "info",
      "message": "Starting generation..."
    }
  ]
}
```

---

## SD.next / Automatic1111 Compatible API

These endpoints provide compatibility with SD.next and Automatic1111 WebUI.

### GET /sdapi/v1/samplers

List available samplers.

**Response:**
```json
[
  "Euler a",
  "Euler",
  "DPM++ 2M",
  "DPM++ SDE"
]
```

### GET /sdapi/v1/schedulers

List available schedulers.

**Response:**
```json
[
  "DDIM",
  "DPMSolverMultistep",
  "UniPC"
]
```

### GET /sdapi/v1/sd-models

List all available models.

**Response:**
```json
{
  "title": "sd-models",
  "models": [
    "model1.safetensors",
    "model2.safetensors"
  ]
}
```

### GET /sdapi/v1/options

Get current options including model checkpoint.

**Response:**
```json
{
  "sd_model_checkpoint": "current-model.safetensors",
  "sd_vae": "vae-ft-mse-840000.safetensors"
}
```

### POST /sdapi/v1/options

Set options (used by SillyTavern for set-model).

**Request Body:**
```json
{
  "sd_model_checkpoint": "new-model.safetensors"
}
```

### GET /sdapi/v1/progress

Get generation progress (used by SillyTavern to poll job completion).

**Response:**
```json
{
  "progress": 0.5,
  "eta_relative": 30.0,
  "state": {
    "job_count": 2,
    "job_timestamp": "1234567890.123456"
  }
}
```

### POST /sdapi/v1/interrupt

Interrupt current generation.

### GET /sdapi/v1/upscalers

Get list of available upscalers.

**Response:**
```json
[
  {
    "name": "RealESRGAN 4x+",
    "model_name": "RealESRGAN 4x+",
    "model_path": "/path/to/upscaler"
  }
]
```

### POST /sdapi/v1/extra-single-image

Upscale a single image.

**Request:** `multipart/form-data` or JSON with base64
- `image`: File or base64 string (required)
- `resize_mode`: number (0 = by factor, 1 = to size)
- `upscaler_1`: string (upscaler name)
- `upscaling_resize`: number (scale factor)
- `upscaling_resize_w`: number (target width)
- `upscaling_resize_h`: number (target height)

**Response:**
```json
{
  "image": "base64-encoded-image-data",
  "html_info": "<div>Upscaled with RealESRGAN 4x+</div>"
}
```

### POST /sdapi/v1/extra-batch-images

Upscale multiple images in batch.

**Request:** JSON with imageList array
- `imageList`: Array of `{ data: base64-string, name: string }` (required)
- `resize_mode`: number (0 = by factor, 1 = to size)
- `upscaler_1`: string (upscaler name)
- `upscaling_resize`: number (scale factor)
- `upscaling_resize_w`: number (target width)
- `upscaling_resize_h`: number (target height)

**Response:**
```json
{
  "images": ["base64-image-1", "base64-image-2"],
  "html_info": "<div>Upscaled 2 images with RealESRGAN 4x+</div>"
}
```

---

## WebSocket API

Connect to `ws://localhost:3000/ws` for real-time updates.

### Message Format

**Subscribe to channel:**
```json
{
  "type": "subscribe",
  "channel": "queue|generations|models"
}
```

**Queue events:**
- `job_updated` - Job status changed
- `job_completed` - Job finished successfully
- `job_failed` - Job failed with error

**Generations events:**
- `generation_completed` - New generation completed

**Models events:**
- `model_status_changed` - Model status changed

---

## Queue Job Status Flow

```
pending -> processing -> completed
                   |
                   v
                 failed
```

- **pending**: Job is waiting in queue
- **processing**: Job is currently being processed
- **completed**: Job finished successfully
- **failed**: Job failed with an error (see `error` field)
- **cancelled**: Job was cancelled by user

---

## Error Responses

All endpoints may return errors in the following format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- `400`: Bad Request (invalid parameters)
- `401`: Unauthorized (missing or invalid API key)
- `404`: Not Found (generation/image/job/model not found)
- `500`: Internal Server Error (server error, API error)
