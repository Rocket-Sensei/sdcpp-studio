# REST API Documentation

sd.cpp Studio provides a REST API for image generation and queue management.

## Base URL

```
http://localhost:3000/api
```

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

Get API configuration including SD API endpoint and default model.

**Response:**
```json
{
  "sdApiEndpoint": "http://192.168.2.180:1234/v1",
  "model": "qwen-image"
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
      "type": "generate|edit|variation",
      "model": "qwen-image",
      "prompt": "string",
      "negative_prompt": "string or null",
      "size": "512x512",
      "seed": "string or null",
      "n": 1,
      "quality": "string or null",
      "style": "string or null",
      "source_image_id": "string or null",
      "status": "pending|processing|completed|failed|cancelled",
      "progress": 0.0,
      "error": "string or null",
      "generation_id": "string or null",
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

**Response:**
```json
[
  {
    "id": "uuid",
    "type": "generate|edit|variation",
    "model": "qwen-image",
    "prompt": "string",
    "negative_prompt": "string or null",
    "size": "512x512",
    "seed": "string or null",
    "n": 1,
    "quality": "string or null",
    "style": "string or null",
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
  "type": "generate|edit|variation",
  "model": "qwen-image",
  "prompt": "string",
  "negative_prompt": "string or null",
  "size": "512x512",
  "seed": "string or null",
  "n": 1,
  "quality": "string or null",
  "style": "string or null",
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
- `404`: Not Found (generation/image/job not found)
- `500`: Internal Server Error (server error, API error)
