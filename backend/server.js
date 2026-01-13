import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';
import http from 'http';

// Load environment variables from .env file BEFORE importing database module
// Skip .env loading in test mode - tests use environment variables set by test runner
const envResult = process.env.NODE_ENV === 'test'
  ? { error: new Error('Skipping .env in test mode') }
  : config({
      path: path.join(dirname(fileURLToPath(import.meta.url)), '.env')
    });

import { initializeDatabase, closeDatabase, getImagesDir, getInputImagesDir } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { authenticateRequest, isAuthEnabled } from './middleware/auth.js';
import {
  getAllGenerations,
  getGenerationById,
  getImageById,
  getImagesByGenerationId,
  createGeneration,
  cancelGeneration,
  getGenerationStats,
  GenerationStatus,
  deleteGeneration,
  getGenerationsCount,
  failOldQueuedGenerations,
  deleteAllGenerations,
  cancelAllGenerations
} from './db/queries.js';
import { startQueueProcessor } from './services/queueProcessor.js';

// Model management services
import { modelManager } from './services/modelManager.js';
import { processTracker } from './services/processTracker.js';
import { modelDownloader, getDownloadMethod } from './services/modelDownloader.js';
import { ensurePngFormat } from './utils/imageUtils.js';

// WebSocket for real-time updates
import { initializeWebSocket, broadcastGenerationComplete, broadcastModelStatus } from './services/websocket.js';

// Debug logging utilities
import { logApiRequest, createLogger, getGenerationLogs } from './utils/logger.js';

// Create logger for server module
const logger = createLogger('server');

// Check for dotenv config error (already called above)
if (envResult.error) {
  // .env file is optional, log but don't fail
  logger.info('Note: .env file not found, using environment variables');
}

// Log HuggingFace token status
if (process.env.HF_TOKEN) {
  logger.info('HuggingFace token configured for authenticated downloads');
} else {
  logger.info('No HuggingFace token found (HF_TOKEN not set)');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';  // Default to all interfaces

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware (for API routes only)
app.use((req, res, next) => {
  // Skip logging for:
  // 1. Static file routes (/static/*)
  // 2. Image serving endpoints (/api/images/*, /api/generations/*/image)
  // 3. Health checks
  const skipLogging =
    req.path.startsWith('/static') ||
    req.path.startsWith('/api/images/') ||
    req.path.match(/^\/api\/generations\/[^/]+\/image$/) ||
    req.path === '/api/health';

  // Only log API routes (both /api/* and /sdapi/* routes for SD.next compatibility)
  if (!skipLogging && (req.path.startsWith('/api') || req.path.startsWith('/sdapi'))) {
    const startTime = Date.now();

    // Log the request
    const protocol = req.protocol;
    const host = req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;
    logApiRequest(req.method, url, req.headers, req.body);

    // Capture response when finished
    res.on('finish', () => {
      const elapsed = Date.now() - startTime;
      // Response logging is handled by the logging utility
    });
  }
  next();
});

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Serve static images from images directory (respects IMAGES_DIR env var for tests)
// These are generated images that can be served directly without going through the API
app.use('/static/images', express.static(getImagesDir()));

// Serve static input images from input directory (respects INPUT_DIR env var for tests)
// These are uploaded/input images used for img2img
app.use('/static/input', express.static(getInputImagesDir()));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Initialize database
initializeDatabase();

// Run migrations
await runMigrations();

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get API config (for client to know the SD API endpoint)
app.get('/api/config', (req, res) => {
  const defaultModel = modelManager.getDefaultModel();
  res.json({
    sdApiEndpoint: process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1',
    model: defaultModel?.id || 'qwen-image',
    authRequired: isAuthEnabled()
  });
});

// Generate image (text-to-image) - queues job and waits for completion
// This provides a synchronous API that internally uses the queue system
app.post('/api/generate', authenticateRequest, async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      size,
      n,
      quality,
      style,
      seed,
      model,
      // SD.cpp Advanced Settings
      cfg_scale,
      sampling_method,
      sample_steps,
      clip_skip,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Missing required field: model' });
    }

    // Validate the model exists
    const modelConfig = modelManager.getModel(model);
    if (!modelConfig) {
      return res.status(400).json({
        error: `Invalid model: ${model}`,
        detail: `Model '${model}' not found in configuration. Available models: ${modelManager.getAllModels().map(m => m.id).join(', ')}`
      });
    }

    // Get model-specific default parameters
    const modelParams = modelManager.getModelGenerationParams(model);

    // Create generation job in queue
    const jobId = randomUUID();
    const job = {
      id: jobId,
      type: 'generate',
      model: model,
      prompt: prompt || '',
      negative_prompt: negative_prompt || '',
      size: size || '1024x1024',
      seed: seed || -1,
      n: n || 1,
      quality: quality || null,
      style: style || null,
      status: GenerationStatus.PENDING,
      created_at: new Date().toISOString(),
      // SD.cpp Advanced Settings
      cfg_scale: cfg_scale ?? modelParams?.cfg_scale ?? undefined,
      sampling_method: sampling_method ?? modelParams?.sampling_method ?? undefined,
      sample_steps: sample_steps ?? modelParams?.sample_steps ?? undefined,
      clip_skip: clip_skip ?? modelParams?.clip_skip ?? undefined,
    };

    await createGeneration(job);

    // Wait for completion (simple polling)
    const MAX_WAIT = 300; // 5 minutes
    const POLL_INTERVAL = 500;
    let attempts = 0;

    while (attempts < MAX_WAIT) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const generation = await getGenerationById(jobId);

      if (generation && generation.status === 'completed') {
        const images = await getImagesByGenerationId(jobId);
        if (images && images.length > 0) {
          // Return OpenAI-compatible format
          return res.json({
            id: jobId,
            created: Math.floor(new Date(generation.created_at).getTime() / 1000),
            data: images.map(img => ({
              id: img.id,
              index: img.index_in_batch,
              revised_prompt: img.revised_prompt || null
            }))
          });
        }
      }

      if (generation && generation.status === 'failed') {
        return res.status(500).json({ error: generation.error || 'Generation failed' });
      }

      attempts++;
    }

    res.status(500).json({ error: 'Generation timeout' });
  } catch (error) {
    logger.error({ error }, 'Error generating image');
    res.status(500).json({ error: error.message });
  }
});

// Generate image edit (image-to-image) - queues job and waits for completion
// This provides a synchronous API that internally uses the queue system
app.post('/api/edit', authenticateRequest, upload.single('image'), async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      size,
      n,
      model,
      seed,
      // SD.cpp Advanced Settings
      cfg_scale,
      sampling_method,
      sample_steps,
      clip_skip,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    if (!prompt) {
      return res.status(400).json({ error: 'Missing required field: prompt' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Missing required field: model' });
    }

    // Validate the model exists
    const modelConfig = modelManager.getModel(model);
    if (!modelConfig) {
      return res.status(400).json({
        error: `Invalid model: ${model}`,
        detail: `Model '${model}' not found in configuration. Available models: ${modelManager.getAllModels().map(m => m.id).join(', ')}`
      });
    }

    // Get model-specific default parameters
    const modelParams = modelManager.getModelGenerationParams(model);

    // Save uploaded image to disk
    const inputImagesDir = getInputImagesDir();
    const imageFilename = `${randomUUID()}.png`;
    const imagePath = path.join(inputImagesDir, imageFilename);
    const pngBuffer = await ensurePngFormat(req.file.buffer, req.file.mimetype);
    await writeFile(imagePath, pngBuffer);

    // Create generation job in queue
    const jobId = randomUUID();
    const job = {
      id: jobId,
      type: 'edit',
      model: model,
      prompt: prompt || '',
      negative_prompt: negative_prompt || '',
      size: size || '1024x1024',
      seed: seed || -1,
      n: n || 1,
      status: GenerationStatus.PENDING,
      created_at: new Date().toISOString(),
      input_image_path: imagePath,
      input_image_mime_type: 'image/png',
      // SD.cpp Advanced Settings
      cfg_scale: cfg_scale ?? modelParams?.cfg_scale ?? undefined,
      sampling_method: sampling_method ?? modelParams?.sampling_method ?? undefined,
      sample_steps: sample_steps ?? modelParams?.sample_steps ?? undefined,
      clip_skip: clip_skip ?? modelParams?.clip_skip ?? undefined,
    };

    await createGeneration(job);

    // Wait for completion (simple polling)
    const MAX_WAIT = 300; // 5 minutes
    const POLL_INTERVAL = 500;
    let attempts = 0;

    while (attempts < MAX_WAIT) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const generation = await getGenerationById(jobId);

      if (generation && generation.status === 'completed') {
        const images = await getImagesByGenerationId(jobId);
        if (images && images.length > 0) {
          // Return OpenAI-compatible format
          return res.json({
            id: jobId,
            created: Math.floor(new Date(generation.created_at).getTime() / 1000),
            data: images.map(img => ({
              id: img.id,
              index: img.index_in_batch,
              revised_prompt: img.revised_prompt || null
            }))
          });
        }
      }

      if (generation && generation.status === 'failed') {
        return res.status(500).json({ error: generation.error || 'Generation failed' });
      }

      attempts++;
    }

    res.status(500).json({ error: 'Generation timeout' });
  } catch (error) {
    logger.error({ error }, 'Error editing image');
    res.status(500).json({ error: error.message });
  }
});

// Generate image variation - queues job and waits for completion
// This provides a synchronous API that internally uses the queue system
app.post('/api/variation', authenticateRequest, upload.single('image'), async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      size,
      n,
      model,
      seed,
      strength,
      // SD.cpp Advanced Settings
      cfg_scale,
      sampling_method,
      sample_steps,
      clip_skip,
    } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    if (!model) {
      return res.status(400).json({ error: 'Missing required field: model' });
    }

    // Validate the model exists
    const modelConfig = modelManager.getModel(model);
    if (!modelConfig) {
      return res.status(400).json({
        error: `Invalid model: ${model}`,
        detail: `Model '${model}' not found in configuration. Available models: ${modelManager.getAllModels().map(m => m.id).join(', ')}`
      });
    }

    // Get model-specific default parameters
    const modelParams = modelManager.getModelGenerationParams(model);

    // Save uploaded image to disk
    const inputImagesDir = getInputImagesDir();
    const imageFilename = `${randomUUID()}.png`;
    const imagePath = path.join(inputImagesDir, imageFilename);
    const pngBuffer = await ensurePngFormat(req.file.buffer, req.file.mimetype);
    await writeFile(imagePath, pngBuffer);

    // Create generation job in queue
    const jobId = randomUUID();
    const job = {
      id: jobId,
      type: 'variation',
      model: model,
      prompt: prompt || '',
      negative_prompt: negative_prompt || '',
      size: size || '1024x1024',
      seed: seed || -1,
      n: n || 1,
      status: GenerationStatus.PENDING,
      created_at: new Date().toISOString(),
      input_image_path: imagePath,
      input_image_mime_type: 'image/png',
      // Strength parameter for img2img (variation) - controls how much the original image is preserved
      // Default: 0.75 (balanced variation)
      strength: parseFloat(strength) || 0.75,
      // SD.cpp Advanced Settings
      cfg_scale: cfg_scale ?? modelParams?.cfg_scale ?? undefined,
      sampling_method: sampling_method ?? modelParams?.sampling_method ?? undefined,
      sample_steps: sample_steps ?? modelParams?.sample_steps ?? undefined,
      clip_skip: clip_skip ?? modelParams?.clip_skip ?? undefined,
    };

    await createGeneration(job);

    // Wait for completion (simple polling)
    const MAX_WAIT = 300; // 5 minutes
    const POLL_INTERVAL = 500;
    let attempts = 0;

    while (attempts < MAX_WAIT) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const generation = await getGenerationById(jobId);

      if (generation && generation.status === 'completed') {
        const images = await getImagesByGenerationId(jobId);
        if (images && images.length > 0) {
          // Return OpenAI-compatible format
          return res.json({
            id: jobId,
            created: Math.floor(new Date(generation.created_at).getTime() / 1000),
            data: images.map(img => ({
              id: img.id,
              index: img.index_in_batch,
              revised_prompt: img.revised_prompt || null
            }))
          });
        }
      }

      if (generation && generation.status === 'failed') {
        return res.status(500).json({ error: generation.error || 'Generation failed' });
      }

      attempts++;
    }

    res.status(500).json({ error: 'Generation timeout' });
  } catch (error) {
    logger.error({ error }, 'Error creating variation');
    res.status(500).json({ error: error.message });
  }
});

// Get all generations (authenticated - sensitive data)
app.get('/api/generations', authenticateRequest, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const offset = req.query.offset ? parseInt(req.query.offset) : null;

    const generations = getAllGenerations({ limit, offset });
    const total = getGenerationsCount();

    res.json({
      generations,
      pagination: {
        total,
        limit: limit || total,
        offset: offset || 0,
        hasMore: limit !== null && (offset + limit) < total
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching generations');
    res.status(500).json({ error: error.message });
  }
});

// Get single generation (authenticated - sensitive data)
app.get('/api/generations/:id', authenticateRequest, async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }
    res.json(generation);
  } catch (error) {
    logger.error({ error }, 'Error fetching generation');
    res.status(500).json({ error: error.message });
  }
});

// Get image file by image ID (serves original full-resolution image) - authenticated
// Supports optional ?size=thumbnail query param for future thumbnail support
app.get('/api/images/:imageId', authenticateRequest, async (req, res) => {
  try {
    const image = getImageById(req.params.imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.set('Content-Type', image.mime_type);
    // Cache images for 1 hour
    res.set('Cache-Control', 'public, max-age=3600, immutable');
    // Ensure the path is absolute before sending
    const absolutePath = path.isAbsolute(image.file_path)
      ? image.file_path
      : path.resolve(__dirname, image.file_path);
    res.sendFile(absolutePath, (err) => {
      if (err) {
        logger.error({ error: err, filePath: absolutePath }, 'Error sending image file');
        if (!res.headersSent) {
          res.status(404).json({ error: 'Image file not found on disk' });
        }
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching image');
    res.status(500).json({ error: error.message });
  }
});

// Get first image for a generation (for backwards compatibility) - authenticated
app.get('/api/generations/:id/image', authenticateRequest, async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation || !generation.images || generation.images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const firstImage = generation.images[0];
    res.set('Content-Type', firstImage.mime_type);
    // Cache images for 1 hour
    res.set('Cache-Control', 'public, max-age=3600, immutable');
    // Ensure the path is absolute before sending
    const absolutePath = path.isAbsolute(firstImage.file_path)
      ? firstImage.file_path
      : path.resolve(__dirname, firstImage.file_path);
    res.sendFile(absolutePath, (err) => {
      if (err) {
        logger.error({ error: err, filePath: absolutePath }, 'Error sending image file');
        if (!res.headersSent) {
          res.status(404).json({ error: 'Image file not found on disk' });
        }
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching image');
    res.status(500).json({ error: error.message });
  }
});

// Get all images for a generation (authenticated - sensitive data)
app.get('/api/generations/:id/images', authenticateRequest, async (req, res) => {
  try {
    const images = await getImagesByGenerationId(req.params.id);
    res.json(images);
  } catch (error) {
    logger.error({ error }, 'Error fetching images');
    res.status(500).json({ error: error.message });
  }
});

// Delete generation
app.delete('/api/generations/:id', authenticateRequest, async (req, res) => {
  try {
    // Delete the generation (also deletes associated images via cascade)
    const result = deleteGeneration(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error deleting generation');
    res.status(500).json({ error: error.message });
  }
});

// Delete all generations (must be before /:id route)
app.delete('/api/generations', authenticateRequest, async (req, res) => {
  try {
    const deleteFiles = req.query.delete_files === 'true';
    const result = await deleteAllGenerations(deleteFiles);
    res.json({
      success: true,
      count: result.count,
      filesDeleted: result.filesDeleted
    });
  } catch (error) {
    logger.error({ error }, 'Error deleting all generations');
    res.status(500).json({ error: error.message });
  }
});

// Get logs for a specific generation
app.get('/api/generations/:id/logs', authenticateRequest, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 50;
    const logs = await getGenerationLogs(req.params.id, limit);
    res.json(logs);
  } catch (error) {
    logger.error({ error, generationId: req.params.id }, 'Error fetching generation logs');
    res.status(500).json({ error: error.message });
  }
});

// Get all logs (no generation filter)
app.get('/api/logs', authenticateRequest, async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit) : 100;
    // Pass undefined as generationId to get all logs
    const logs = await getGenerationLogs(undefined, limit);
    res.json(logs);
  } catch (error) {
    logger.error({ error }, 'Error fetching logs');
    res.status(500).json({ error: error.message });
  }
});

// ========== Queue API Endpoints ==========

// Add job to queue (text-to-image)
app.post('/api/queue/generate', authenticateRequest, async (req, res) => {
  try {
    const id = randomUUID();
    const params = {
      id,
      type: 'generate',
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      size: req.body.size,
      n: req.body.n,
      quality: req.body.quality,
      style: req.body.style,
      model: req.body.model,
      seed: req.body.seed,
      status: GenerationStatus.PENDING,
      // SD.cpp Advanced Settings
      cfg_scale: req.body.cfg_scale,
      sampling_method: req.body.sampling_method,
      sample_steps: req.body.sample_steps,
      clip_skip: req.body.clip_skip,
    };
    await createGeneration(params);
    res.json({ job_id: id, status: GenerationStatus.PENDING });
  } catch (error) {
    logger.error({ error }, 'Error adding to queue');
    res.status(500).json({ error: error.message });
  }
});

// Add job to queue (image-to-image edit)
app.post('/api/queue/edit', authenticateRequest, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req, res) => {
  try {
    const imageFile = req.files?.image?.[0];
    if (!imageFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Save uploaded image to disk
    // Convert webp to PNG for sdcpp compatibility
    const inputImagesDir = getInputImagesDir();
    const imageFilename = `${randomUUID()}.png`;
    const imagePath = path.join(inputImagesDir, imageFilename);
    const pngBuffer = await ensurePngFormat(imageFile.buffer, imageFile.mimetype);
    await writeFile(imagePath, pngBuffer);

    const id = randomUUID();
    const params = {
      id,
      type: 'edit',
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      size: req.body.size,
      n: req.body.n,
      source_image_id: req.body.source_image_id,
      model: req.body.model,
      seed: req.body.seed,
      status: GenerationStatus.PENDING,
      input_image_path: imagePath,
      input_image_mime_type: 'image/png',
      // SD.cpp Advanced Settings
      cfg_scale: req.body.cfg_scale,
      sampling_method: req.body.sampling_method,
      sample_steps: req.body.sample_steps,
      clip_skip: req.body.clip_skip,
    };

    // Handle optional mask upload
    const maskFile = req.files?.mask?.[0];
    if (maskFile) {
      const maskFilename = `${randomUUID()}_mask.png`;
      const maskPath = path.join(inputImagesDir, maskFilename);
      const maskPngBuffer = await ensurePngFormat(maskFile.buffer, maskFile.mimetype);
      await writeFile(maskPath, maskPngBuffer);
      params.mask_image_path = maskPath;
      params.mask_image_mime_type = 'image/png';
    }

    await createGeneration(params);
    res.json({ job_id: id, status: GenerationStatus.PENDING });
  } catch (error) {
    logger.error({ error }, 'Error adding to queue');
    res.status(500).json({ error: error.message });
  }
});

// Add job to queue (variation)
app.post('/api/queue/variation', authenticateRequest, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    // Save uploaded image to disk
    // Convert webp to PNG for sdcpp compatibility
    const inputImagesDir = getInputImagesDir();
    const imageFilename = `${randomUUID()}.png`;
    const imagePath = path.join(inputImagesDir, imageFilename);
    const pngBuffer = await ensurePngFormat(req.file.buffer, req.file.mimetype);
    await writeFile(imagePath, pngBuffer);

    const id = randomUUID();
    const params = {
      id,
      type: 'variation',
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      size: req.body.size,
      n: req.body.n,
      model: req.body.model,
      seed: req.body.seed,
      status: GenerationStatus.PENDING,
      input_image_path: imagePath,
      input_image_mime_type: 'image/png',
      // Strength parameter for img2img (variation) - controls how much the original image is preserved
      // Default: 0.75 (balanced variation)
      strength: parseFloat(req.body.strength) || 0.75,
      // SD.cpp Advanced Settings
      cfg_scale: req.body.cfg_scale,
      sampling_method: req.body.sampling_method,
      sample_steps: req.body.sample_steps,
      clip_skip: req.body.clip_skip,
    };

    await createGeneration(params);
    res.json({ job_id: id, status: GenerationStatus.PENDING });
  } catch (error) {
    logger.error({ error }, 'Error adding to queue');
    res.status(500).json({ error: error.message });
  }
});

// Get all jobs in queue (authenticated - sensitive data)
app.get('/api/queue', authenticateRequest, async (req, res) => {
  try {
    const status = req.query.status || null;
    // Return all generations, filtered by status if provided
    const allGenerations = getAllGenerations();
    let jobs = allGenerations;
    if (status) {
      jobs = allGenerations.filter(g => g.status === status);
    }
    const stats = getGenerationStats();
    res.json({ jobs, stats });
  } catch (error) {
    logger.error({ error }, 'Error fetching queue');
    res.status(500).json({ error: error.message });
  }
});

// Get queue statistics (must be before /:id route) - authenticated
app.get('/api/queue/stats', authenticateRequest, async (req, res) => {
  try {
    const stats = getGenerationStats();
    res.json(stats);
  } catch (error) {
    logger.error({ error }, 'Error fetching queue stats');
    res.status(500).json({ error: error.message });
  }
});

// Get single job (authenticated - sensitive data)
app.get('/api/queue/:id', authenticateRequest, async (req, res) => {
  try {
    const job = getGenerationById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    logger.error({ error }, 'Error fetching job');
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
app.delete('/api/queue/:id', authenticateRequest, async (req, res) => {
  try {
    const job = cancelGeneration(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or cannot be cancelled' });
    }
    res.json({ success: true, job });
  } catch (error) {
    logger.error({ error }, 'Error cancelling job');
    res.status(500).json({ error: error.message });
  }
});

// Cancel all jobs (pending and processing)
app.post('/api/queue/cancel-all', authenticateRequest, async (req, res) => {
  try {
    const count = cancelAllGenerations();
    res.json({
      success: true,
      cancelled: count
    });
  } catch (error) {
    logger.error({ error }, 'Error cancelling all jobs');
    res.status(500).json({ error: error.message });
  }
});

// ========== SD.next Compatible API Endpoints ==========

/**
 * Derive model type from model name or configuration
 * @param {Object} model - Model configuration object
 * @returns {string} Model type (sdxl, sd15, etc.)
 */
function deriveModelType(model) {
  if (!model) {
    return 'sd15';
  }

  // Check model name for XL indicators
  const name = (model.name || '').toLowerCase();
  if (name.includes('xl') || name.includes('sdxl')) {
    return 'sdxl';
  }

  // Check model_type in config
  if (model.model_type) {
    const modelType = model.model_type.toLowerCase();
    if (modelType.includes('xl') || modelType.includes('sdxl')) {
      return 'sdxl';
    }
  }

  // Check exec_mode for API models
  if (model.exec_mode === 'api' && model.api) {
    const api = model.api.toLowerCase();
    if (api.includes('xl') || api.includes('sdxl')) {
      return 'sdxl';
    }
  }

  // Default to sd15
  return 'sd15';
}

/**
 * Extract model file path from model args
 * Looks for --diffusion-model, --model, or -m flag values
 * @param {Object} model - Model configuration object
 * @returns {string|null} Model file path or null
 */
function extractModelPath(model) {
  if (!model || !model.args || !Array.isArray(model.args)) {
    return null;
  }

  const args = model.args;

  // Look for --diffusion-model flag
  const diffIndex = args.indexOf('--diffusion-model');
  if (diffIndex !== -1 && diffIndex + 1 < args.length) {
    return args[diffIndex + 1];
  }

  // Look for --model flag (used by some models like sd15-base)
  const modelIndex = args.indexOf('--model');
  if (modelIndex !== -1 && modelIndex + 1 < args.length) {
    return args[modelIndex + 1];
  }

  // Look for -m flag (used by some CLI models)
  const mIndex = args.indexOf('-m');
  if (mIndex !== -1 && mIndex + 1 < args.length) {
    return args[mIndex + 1];
  }

  // Also check for --diffusion-model=value format
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--diffusion-model=')) {
      return arg.split('=')[1];
    }
  }

  return null;
}

/**
 * Helper function to extract filename from model args
 * Looks for --diffusion-model, --model, or -m flag values
 * @param {Array} args - Model arguments array
 * @returns {string|null} Extracted filename or null
 */
function extractFilenameFromArgs(args) {
  if (!args || !Array.isArray(args)) {
    return null;
  }

  // Look for --diffusion-model flag
  const diffIndex = args.indexOf('--diffusion-model');
  if (diffIndex !== -1 && diffIndex + 1 < args.length) {
    return args[diffIndex + 1];
  }

  // Look for --model flag (used by some models like sd15-base)
  const modelIndex = args.indexOf('--model');
  if (modelIndex !== -1 && modelIndex + 1 < args.length) {
    return args[modelIndex + 1];
  }

  // Look for -m flag (used by some CLI models)
  const mIndex = args.indexOf('-m');
  if (mIndex !== -1 && mIndex + 1 < args.length) {
    return args[mIndex + 1];
  }

  return null;
}

/**
 * Helper function to determine model type from filename extension
 * @param {string} filename - Model filename
 * @returns {string|null} Model type (safetensors, ckpt, gguf, diffusers, etc.)
 */
function getModelTypeFromFilename(filename) {
  if (!filename) {
    return null;
  }

  const ext = path.extname(filename).toLowerCase();

  const typeMap = {
    '.safetensors': 'safetensors',
    '.ckpt': 'ckpt',
    '.gguf': 'gguf',
    '.pt': 'pt',
    '.pth': 'pth',
    '.bin': 'diffusers'
  };

  return typeMap[ext] || null;
}

/**
 * Helper function to get file status for a model with HuggingFace config
 * @param {Object} model - The model object
 * @returns {Object|null} File status object with { hasHuggingFace, allFilesExist, files[] }
 */
async function getModelFileStatus(model) {
  if (!model.huggingface || !model.huggingface.files) {
    return {
      hasHuggingFace: false,
      files: []
    };
  }

  const { existsSync } = await import('fs');
  const { join, basename, resolve, dirname } = await import('path');
  const { fileURLToPath } = await import('url');

  // Get project root path (backend/..)
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

  // Check each file
  const fileStatus = model.huggingface.files.map(file => {
    // Use the dest from config, or fall back to MODELS_DIR env, or ./models
    const destDir = file.dest || process.env.MODELS_DIR || './models';

    // Resolve the path from the project root
    const resolvedDestDir = resolve(projectRoot, destDir);
    const fileName = basename(file.path);
    const filePath = join(resolvedDestDir, fileName);
    const exists = existsSync(filePath);

    return {
      path: file.path,
      dest: file.dest,
      filePath,
      resolvedDestDir,
      exists,
      fileName
    };
  });

  return {
    hasHuggingFace: true,
    allFilesExist: fileStatus.every(f => f.exists),
    files: fileStatus
  };
}

// ========== Model Management API Endpoints ==========

/**
 * GET /api/models
 * List all available models (authenticated - sensitive configuration data)
 * Now includes file status for each model to avoid separate API calls
 */
app.get('/api/models', authenticateRequest, async (req, res) => {
  try {
    const models = modelManager.getAllModels();

    // Add file status to each model with HuggingFace config
    // This avoids the need for separate /api/models/:id/files/status requests
    const modelsWithFileStatus = await Promise.all(
      models.map(async (model) => {
        const fileStatus = await getModelFileStatus(model);
        return {
          ...model,
          fileStatus // Add inline file status: { hasHuggingFace, allFilesExist, files[] }
        };
      })
    );

    res.json({
      models: modelsWithFileStatus,
      default: modelManager.getDefaultModel(),
      default_models: modelManager.defaultModels
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching models');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/running
 * Get list of currently running models (authenticated - sensitive operational data)
 * NOTE: This route must be defined BEFORE /api/models/:id to avoid "running" being treated as a model ID
 */
app.get('/api/models/running', authenticateRequest, async (req, res) => {
  try {
    const runningModels = modelManager.getRunningModels();
    const processes = processTracker.getAllProcesses();

    const result = runningModels.map(modelId => {
      const model = modelManager.getModel(modelId);
      const processInfo = processes.find(p => p.modelId === modelId);

      return {
        id: modelId,
        name: model?.name || modelId,
        pid: processInfo?.pid,
        port: processInfo?.port,
        execMode: processInfo?.execMode,
        startedAt: processInfo?.startedAt,
        api: model?.api || null
      };
    });

    res.json({
      count: result.length,
      models: result
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching running models');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/downloaded
 * Get list of downloaded models (authenticated - sensitive operational data)
 * NOTE: This route must be defined BEFORE /api/models/:id to avoid "downloaded" being treated as a model ID
 */
app.get('/api/models/downloaded', authenticateRequest, async (req, res) => {
  try {
    const downloadedModels = modelDownloader.getDownloadedModels();
    const allModels = modelManager.getAllModels();

    // Enrich with model configuration details
    const result = downloadedModels.map(dm => {
      const modelConfig = allModels.find(m => m.id === dm.modelId);
      return {
        modelId: dm.modelId,
        name: modelConfig?.name || dm.modelId,
        files: dm.files,
        downloadedAt: dm.downloadedAt,
        totalSize: dm.totalSize,
        huggingfaceRepo: modelConfig?.huggingface?.repo || null
      };
    });

    res.json({
      count: result.length,
      models: result
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching downloaded models');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id
 * Get details for a specific model (authenticated - sensitive operational data)
 * Now includes file status to avoid separate API call
 */
app.get('/api/models/:id', authenticateRequest, async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const isRunning = modelManager.isModelRunning(modelId);
    const processInfo = isRunning ? processTracker.getProcess(modelId) : null;
    const fileStatus = await getModelFileStatus(model);

    res.json({
      id: modelId,
      ...model,
      fileStatus, // Add inline file status: { hasHuggingFace, allFilesExist, files[] }
      running: isRunning,
      process: processInfo ? {
        pid: processInfo.pid,
        port: processInfo.port,
        execMode: processInfo.execMode,
        startedAt: processInfo.startedAt
      } : null
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching model');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id/status
 * Get the running status of a specific model (authenticated - sensitive operational data)
 */
app.get('/api/models/:id/status', authenticateRequest, async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const status = modelManager.getModelStatus(modelId);
    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Error fetching model status');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/start
 * Start a model process
 */
app.post('/api/models/:id/start', authenticateRequest, async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Check if already running
    if (modelManager.isModelRunning(modelId)) {
      return res.status(409).json({
        error: 'Model is already running',
        status: modelManager.getModelStatus(modelId)
      });
    }

    // Start the model process
    const process = await modelManager.startModel(modelId);

    res.json({
      success: true,
      modelId,
      status: 'starting',
      pid: process.pid,
      message: `Model ${modelId} is starting`
    });
  } catch (error) {
    logger.error({ error }, 'Error starting model');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/stop
 * Stop a running model process
 */
app.post('/api/models/:id/stop', authenticateRequest, async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    // Check if model is running
    if (!modelManager.isModelRunning(modelId)) {
      return res.status(400).json({
        error: 'Model is not running',
        status: modelManager.getModelStatus(modelId)
      });
    }

    // Stop the model process
    await modelManager.stopModel(modelId);

    res.json({
      success: true,
      modelId,
      status: 'stopped',
      message: `Model ${modelId} has been stopped`
    });
  } catch (error) {
    logger.error({ error }, 'Error stopping model');
    res.status(500).json({ error: error.message });
  }
});

// ========== Model Download API Endpoints ==========

/**
 * POST /api/models/download
 * Start a model download from HuggingFace
 * Body: { modelId, repo, files }
 */
app.post('/api/models/download', authenticateRequest, async (req, res) => {
  try {
    const { modelId, repo, files } = req.body;

    if (!repo || !files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: repo and files array'
      });
    }

    // Start the download
    const downloadId = await modelDownloader.downloadModel(
      repo,
      files,
      (progress) => {
        // Progress callback - could emit WebSocket event here
        logger.debug({ downloadId, progress }, 'Download progress');
      }
    );

    res.json({
      success: true,
      downloadId,
      modelId,
      repo,
      status: 'downloading',
      message: `Download started for ${repo}`
    });
  } catch (error) {
    logger.error({ error }, 'Error starting download');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/download/:id
 * Get the status of a model download (authenticated - sensitive operational data)
 */
app.get('/api/models/download/:id', authenticateRequest, async (req, res) => {
  try {
    const downloadId = req.params.id;
    const status = modelDownloader.getDownloadStatus(downloadId);

    if (!status) {
      return res.status(404).json({ error: 'Download not found' });
    }

    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Error fetching download status');
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/models/download/:id
 * Cancel an active model download
 */
app.delete('/api/models/download/:id', authenticateRequest, async (req, res) => {
  try {
    const downloadId = req.params.id;
    const status = modelDownloader.getDownloadStatus(downloadId);

    if (!status) {
      return res.status(404).json({ error: 'Download not found' });
    }

    if (status.status === 'completed' || status.status === 'cancelled' || status.status === 'failed') {
      return res.status(400).json({
        error: `Cannot cancel download with status: ${status.status}`
      });
    }

    await modelDownloader.cancelDownload(downloadId);

    res.json({
      success: true,
      downloadId,
      status: 'cancelled',
      message: 'Download has been cancelled'
    });
  } catch (error) {
    logger.error({ error }, 'Error cancelling download');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id/files/status
 * Check if model files exist on disk (authenticated - sensitive operational data)
 */
app.get('/api/models/:id/files/status', authenticateRequest, async (req, res) => {
  try {
    const { existsSync } = await import('fs');
    const { join, dirname, basename, resolve } = await import('path');

    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    if (!model.huggingface || !model.huggingface.files) {
      return res.json({
        modelId,
        hasHuggingFace: false,
        files: []
      });
    }

    // Get project root path (backend/..)
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

    // Check each file
    const fileStatus = model.huggingface.files.map(file => {
      // Use the dest from config, or fall back to MODELS_DIR env, or ./models
      const destDir = file.dest || process.env.MODELS_DIR || './models';

      // Resolve the path from the project root
      // If destDir is relative (starts with . or not starting with /), resolve it from project root
      const resolvedDestDir = resolve(projectRoot, destDir);
      const fileName = basename(file.path);
      const filePath = join(resolvedDestDir, fileName);
      const exists = existsSync(filePath);

      return {
        path: file.path,
        dest: file.dest,
        filePath,
        resolvedDestDir,
        exists,
        fileName
      };
    });

    const allExist = fileStatus.every(f => f.exists);

    res.json({
      modelId,
      hasHuggingFace: true,
      allFilesExist: allExist,
      files: fileStatus
    });
  } catch (error) {
    logger.error({ error }, 'Error checking model files');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/download
 * Download model files from HuggingFace based on model config
 */
app.post('/api/models/:id/download', authenticateRequest, async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    if (!model.huggingface || !model.huggingface.files) {
      return res.status(400).json({ error: 'Model has no HuggingFace configuration' });
    }

    // Start the download
    const downloadId = await modelDownloader.downloadModel(
      model.huggingface.repo,
      model.huggingface.files,
      (progress) => {
        logger.debug({ modelId, progress }, 'Model download progress');
      }
    );

    res.json({
      success: true,
      downloadId,
      modelId,
      repo: model.huggingface.repo,
      status: 'downloading',
      message: `Download started for ${model.name}`
    });
  } catch (error) {
    logger.error({ error }, 'Error starting download');
    res.status(500).json({ error: error.message });
  }
});

// ========== SD.next Compatible API Endpoints ==========

/**
 * SD.cpp supported samplers mapped to SD.next-style names
 * Each sampler has a name for display, optional aliases, and configuration options
 */
const SD_SAMPLERS = [
  { name: 'Euler', aliases: ['euler'], options: {} },
  { name: 'Euler a', aliases: ['euler_a', 'Euler Ancestral'], options: {} },
  { name: 'DDIM', aliases: ['ddim'], options: {} },
  { name: 'PLMS', aliases: ['plms'], options: {} },
  { name: 'DPM++ 2M', aliases: ['dpmpp_2m', 'DPM++ 2M Karras'], options: {} },
  { name: 'DPM++ 2S a', aliases: ['dpmpp_2s_a', 'DPM++ 2S Ancestral', 'DPM++ 2S Ancestral Karras'], options: {} },
  { name: 'DPM++ SDE', aliases: ['dpmpp_sde', 'DPM++ SDE Karras'], options: {} },
  { name: 'DPM Fast', aliases: ['dpm_fast'], options: {} },
  { name: 'DPM Adaptive', aliases: ['dpm_adaptive'], options: {} },
  { name: 'LCM', aliases: ['lcm'], options: {} },
  { name: 'TCD', aliases: ['tcd'], options: {} },
  { name: 'Heun', aliases: ['heun'], options: {} },
  { name: 'DPM2', aliases: ['dpm2'], options: {} },
  { name: 'DPM2 a', aliases: ['dpm2_a', 'DPM2 Ancestral'], options: {} },
  { name: 'UniPC', aliases: ['unipc'], options: {} },
  { name: 'LMS', aliases: ['lms'], options: {} },
  { name: 'LMS Karras', aliases: ['lms_karras'], options: {} },
];

// ==================== SD.next/Automatic1111 Compatible API Endpoints ====================
// These use the standard /sdapi/v1/ path that SillyTavern expects

// GET /sdapi/v1/samplers - List available samplers (authenticated)
app.get('/sdapi/v1/samplers', authenticateRequest, (req, res) => {
  res.json(SD_SAMPLERS);
});

// GET /sdapi/v1/schedulers - List available schedulers (same as samplers for SD.cpp) (authenticated)
app.get('/sdapi/v1/schedulers', authenticateRequest, (req, res) => {
  res.json(SD_SAMPLERS);
});

// GET /sdapi/v1/sd-models - List all available models (authenticated)
app.get('/sdapi/v1/sd-models', authenticateRequest, (req, res) => {
  try {
    const models = modelManager.getAllModels();
    const result = models.map(model => {
      // Extract filename from args
      let filename = '';
      if (model.args && Array.isArray(model.args)) {
        const diffusionIdx = model.args.indexOf('--diffusion-model');
        if (diffusionIdx !== -1 && model.args[diffusionIdx + 1]) {
          filename = model.args[diffusionIdx + 1];
        }
      }
      // Determine type from filename
      let type = 'safetensors';
      if (filename.endsWith('.ckpt')) type = 'ckpt';
      else if (filename.endsWith('.gguf')) type = 'gguf';
      else if (filename.endsWith('.safetensors')) type = 'safetensors';

      return {
        title: model.name,
        model_name: model.id,
        filename: filename,
        type: type,
        hash: null,
        sha256: null,
        config: null
      };
    });
    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error fetching models');
    res.status(500).json({ error: error.message });
  }
});

// GET /sdapi/v1/options - Get current options (including model checkpoint) (authenticated)
app.get('/sdapi/v1/options', authenticateRequest, (req, res) => {
  try {
    const runningModels = modelManager.getRunningModels();
    const defaultModel = modelManager.getDefaultModel();

    // Get the current model name (display name, not ID)
    let currentModelName = '';
    if (runningModels.length > 0) {
      const runningModel = typeof runningModels[0] === 'string'
        ? modelManager.getModel(runningModels[0])
        : runningModels[0];
      currentModelName = runningModel?.name || '';
    } else if (defaultModel) {
      currentModelName = defaultModel.name || '';
    }

    // Return options in SD.next format
    res.json({
      sd_model_checkpoint: currentModelName,
      sd_vae: null,
      // Add other common options as needed
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching options');
    res.status(500).json({ error: error.message });
  }
});

// POST /sdapi/v1/options - Set options (for set-model endpoint)
app.post('/sdapi/v1/options', authenticateRequest, async (req, res) => {
  try {
    const { sd_model_checkpoint } = req.body;
    if (sd_model_checkpoint) {
      // Helper function to find model ID by name (for SillyTavern compatibility)
      function findModelIdByName(modelNameOrId) {
        if (!modelNameOrId) return null;

        // First try as-is (might already be an ID)
        const model = modelManager.getModel(modelNameOrId);
        if (model) return modelNameOrId;

        // Try to find by name match (case-insensitive, partial match)
        const allModels = modelManager.getAllModels();
        const found = allModels.find(m =>
          m.name.toLowerCase() === modelNameOrId.toLowerCase() ||
          m.id.toLowerCase() === modelNameOrId.toLowerCase() ||
          m.name.toLowerCase().includes(modelNameOrId.toLowerCase()) ||
          modelNameOrId.toLowerCase().includes(m.name.toLowerCase())
        );
        return found?.id || null;
      }

      // Map model name to ID
      const modelId = findModelIdByName(sd_model_checkpoint);
      if (!modelId) {
        return res.status(400).json({
          error: `Model not found: ${sd_model_checkpoint}`,
          detail: `Available models: ${modelManager.getAllModels().map(m => m.name).join(', ')}`
        });
      }

      // Start the model if not running
      const model = modelManager.getModel(modelId);
      if (model && !modelManager.isModelRunning(modelId)) {
        await modelManager.startModel(modelId);
        logger.info({ modelId, modelName: model.name }, 'Started model via SD.next API');
      }

      // Return SD.next format response
      return res.json({
        updated: [{ sd_model_checkpoint: true }]
      });
    }

    // No sd_model_checkpoint in request
    res.json({
      updated: []
    });
  } catch (error) {
    logger.error({ error }, 'Error setting options');
    res.status(500).json({ error: error.message });
  }
});

// GET /sdapi/v1/progress - Get generation progress (authenticated)
app.get('/sdapi/v1/progress', authenticateRequest, (req, res) => {
  try {
    const stats = getGenerationStats();
    const jobs = getAllGenerations();
    const processingJob = jobs.find(j => j.status === 'processing');

    let progress = 0;
    let state = { job_count: 0 };

    // Check if any model is currently starting (model loading in progress)
    const allModels = modelManager.getAllModels();
    const startingModel = allModels.find(m => m.status === 'starting');

    if (startingModel) {
      // Model is loading - return non-zero progress for SillyTavern compatibility
      // SillyTavern polls until progress === 0 AND job_count === 0
      progress = 0.25;  // Arbitrary non-zero value to indicate loading in progress
      state = {
        job_count: 1,  // Non-zero to indicate work in progress
        job_no: 0
      };
    } else if (processingJob) {
      // Image generation in progress
      progress = processingJob.progress || 0.5;
      state = {
        job_count: stats.pending || 0,
        job_no: stats.processing || 0
      };
    }

    res.json({
      progress: progress,
      eta_relative: null,
      state: state,
      current_image: null,
      textinfo: null
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching progress');
    res.status(500).json({ error: error.message });
  }
});

// POST /sdapi/v1/interrupt - Interrupt current generation
app.post('/sdapi/v1/interrupt', authenticateRequest, (req, res) => {
  try {
    const jobs = getAllGenerations();
    const processingJob = jobs.find(j => j.status === 'processing');
    if (processingJob) {
      cancelGeneration(processingJob.id);
    }
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Error interrupting');
    res.status(500).json({ error: error.message });
  }
});

// POST /sdapi/v1/txt2img - Text to image generation
app.post('/sdapi/v1/txt2img', authenticateRequest, async (req, res) => {
  try {
    const {
      prompt,
      negative_prompt,
      width,
      height,
      steps,
      cfg_scale,
      sampler_name,
      seed,
      n = 1,
      // SD.next API compatibility fields (for SillyTavern integration)
      override_settings,
      sd_model_checkpoint
    } = req.body;

    // Helper function to find model ID by name (for SillyTavern compatibility)
    function findModelIdByName(modelNameOrId) {
      if (!modelNameOrId) return null;

      // First try as-is (might already be an ID)
      const model = modelManager.getModel(modelNameOrId);
      if (model) return modelNameOrId;

      // Try to find by name match (case-insensitive, partial match)
      const allModels = modelManager.getAllModels();
      const found = allModels.find(m =>
        m.name.toLowerCase() === modelNameOrId.toLowerCase() ||
        m.id.toLowerCase() === modelNameOrId.toLowerCase() ||
        m.name.toLowerCase().includes(modelNameOrId.toLowerCase()) ||
        modelNameOrId.toLowerCase().includes(m.name.toLowerCase())
      );
      return found?.id || null;
    }

    // Determine model ID from request
    // Priority: override_settings.sd_model_checkpoint > sd_model_checkpoint > running model > default
    let modelId = null;

    // Check override_settings first (SD.next API standard for per-request override)
    if (override_settings && override_settings.sd_model_checkpoint) {
      modelId = findModelIdByName(override_settings.sd_model_checkpoint);
    }
    // Check direct sd_model_checkpoint
    else if (sd_model_checkpoint) {
      modelId = findModelIdByName(sd_model_checkpoint);
    }
    // Check for currently running model
    else {
      const runningModels = modelManager.getRunningModels();
      if (runningModels.length > 0) {
        // getRunningModels returns objects with 'id' property
        modelId = typeof runningModels[0] === 'string' ? runningModels[0] : runningModels[0]?.id;
      }
    }

    // Fallback to default model if still not set
    if (!modelId) {
      const defaultModel = modelManager.getDefaultModel();
      modelId = defaultModel?.id || modelManager.defaultModelId || 'qwen-image';
    }

    // Validate the model exists
    const modelConfig = modelManager.getModel(modelId);
    if (!modelConfig) {
      return res.status(400).json({
        error: `Invalid model: ${modelId}`,
        detail: `Model '${modelId}' not found in configuration. Available models: ${modelManager.getAllModels().map(m => m.id).join(', ')}`
      });
    }

    // Get model-specific default parameters
    const modelParams = modelManager.getModelGenerationParams(modelId);

    // Create generation job
    const jobId = randomUUID();
    const job = {
      id: jobId,
      type: 'generate',
      model: modelId,  // Properly set the model
      prompt: prompt || '',
      negative_prompt: negative_prompt || '',
      width: width || 1024,
      height: height || 1024,
      // Use provided steps, fallback to model default, then undefined (queueProcessor will handle)
      sample_steps: steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined),
      cfg_scale: cfg_scale !== undefined ? cfg_scale : (modelParams?.cfg_scale ?? undefined),
      sampling_method: sampler_name || modelParams?.sampling_method || 'euler',
      seed: seed || -1,
      n: n,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    // Add to queue
    createGeneration(job);

    // Wait for completion (simple polling)
    const MAX_WAIT = 300; // 5 minutes
    const POLL_INTERVAL = 500;
    let attempts = 0;

    while (attempts < MAX_WAIT) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      const generation = getGenerationById(jobId);

      if (generation && generation.status === 'completed') {
        const images = getImagesByGenerationId(jobId);
        if (images && images.length > 0) {
          // Read and encode images
          const imagesData = await Promise.all(images.map(async (img) => {
            const fs = await import('fs/promises');
            try {
              // img.file_path is the correct field name from the database schema
              const buffer = await fs.readFile(img.file_path);
              return buffer.toString('base64');
            } catch (err) {
              logger.error({ err, imgId: img.id }, '[API] Failed to read image');
              return null;
            }
          }));

          const validImages = imagesData.filter(Boolean);
          if (validImages.length === 0) {
            return res.status(500).json({ error: 'Failed to read generated images' });
          }

          // Return SD.next format response
          return res.json({
            images: validImages,
            parameters: job,
            info: JSON.stringify({
              prompt: job.prompt,
              negative_prompt: job.negative_prompt,
              width: job.width,
              height: job.height,
              steps: job.sample_steps,
              cfg_scale: job.cfg_scale,
              sampler_name: job.sampling_method,
              seed: job.seed,
              model: job.model
            })
          });
        }
      }

      if (generation && generation.status === 'failed') {
        return res.status(500).json({ error: 'Generation failed' });
      }

      attempts++;
    }

    res.status(500).json({ error: 'Generation timeout' });
  } catch (error) {
    logger.error({ error }, 'Error in txt2img');
    res.status(500).json({ error: error.message });
  }
});

// ========== SD.next Upscaler API Endpoints ==========

/**
 * GET /sdapi/v1/upscalers
 * Get list of available upscalers (authenticated)
 * Compatible with SD.next / Automatic1111 API
 */
app.get('/sdapi/v1/upscalers', authenticateRequest, async (req, res) => {
  try {
    const { getAvailableUpscalers } = await import('./services/upscalerService.js');
    const upscalers = getAvailableUpscalers();
    res.json(upscalers);
  } catch (error) {
    logger.error({ error }, 'Error fetching upscalers');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /sdapi/v1/extra-single-image
 * Upscale a single image
 * Compatible with SD.next / Automatic1111 API
 */
app.post('/sdapi/v1/extra-single-image', authenticateRequest, async (req, res) => {
  try {
    const { upscaleImage } = await import('./services/upscalerService.js');

    const {
      image, // Base64 string
      resize_mode = 0,
      show_extras_results = true,
      gfpgan_visibility = 0,
      codeformer_visibility = 0,
      codeformer_weight = 0,
      upscaling_resize = 2.0,
      upscaling_resize_w = 512,
      upscaling_resize_h = 512,
      upscaling_crop = true,
      upscaler_1 = 'RealESRGAN 4x+',
      upscaler_2 = 'None',
      extras_upscaler_2_visibility = 0
    } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Missing required field: image' });
    }

    // Upscale the image
    const resultBuffer = await upscaleImage(image, {
      resize_mode,
      upscaling_resize,
      upscaling_resize_w,
      upscaling_resize_h,
      upscaling_crop,
      upscaler_1,
      upscaler_2,
      extras_upscaler_2_visibility,
      gfpgan_visibility,
      codeformer_visibility,
      codeformer_weight
    });

    // Convert to base64
    const base64Image = resultBuffer.toString('base64');

    res.json({
      image: base64Image,
      html_info: `<div>Upscaled with ${upscaler_1}</div>`
    });
  } catch (error) {
    logger.error({ error }, 'Error in extra-single-image');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /sdapi/v1/extra-batch-images
 * Upscale multiple images in batch
 * Compatible with SD.next / Automatic1111 API
 */
app.post('/sdapi/v1/extra-batch-images', authenticateRequest, async (req, res) => {
  try {
    const { upscaleImage } = await import('./services/upscalerService.js');

    const {
      imageList, // Array of { data: base64, name: string }
      resize_mode = 0,
      show_extras_results = true,
      gfpgan_visibility = 0,
      codeformer_visibility = 0,
      codeformer_weight = 0,
      upscaling_resize = 2.0,
      upscaling_resize_w = 512,
      upscaling_resize_h = 512,
      upscaling_crop = true,
      upscaler_1 = 'RealESRGAN 4x+',
      upscaler_2 = 'None',
      extras_upscaler_2_visibility = 0
    } = req.body;

    if (!imageList || !Array.isArray(imageList) || imageList.length === 0) {
      return res.status(400).json({ error: 'Missing required field: imageList (array)' });
    }

    // Upscale all images
    const results = await Promise.all(
      imageList.map(async (img) => {
        try {
          const resultBuffer = await upscaleImage(img.data, {
            resize_mode,
            upscaling_resize,
            upscaling_resize_w,
            upscaling_resize_h,
            upscaling_crop,
            upscaler_1,
            upscaler_2,
            extras_upscaler_2_visibility,
            gfpgan_visibility,
            codeformer_visibility,
            codeformer_weight
          });
          return resultBuffer.toString('base64');
        } catch (err) {
          logger.error({ err, imageName: img.name }, 'Error upscaling image');
          return null;
        }
      })
    );

    res.json({
      images: results.filter(Boolean),
      html_info: `<div>Upscaled ${results.filter(Boolean).length} images with ${upscaler_1}</div>`
    });
  } catch (error) {
    logger.error({ error }, 'Error in extra-batch-images');
    res.status(500).json({ error: error.message });
  }
});

// 404 handler for static routes that didn't match
// Must come before the catch-all route
app.use('/static/*', (req, res) => {
  res.status(404).json({ error: 'File not found' });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = initializeWebSocket(server);

// Graceful shutdown handler
function gracefulShutdown(signal) {
  logger.info({ signal }, `Received ${signal}, closing server gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');

    // Close database connection
    try {
      closeDatabase();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error({ error }, 'Error closing database');
    }

    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, HOST, async () => {
  logger.info(`Server running on http://${HOST}:${PORT}`);
  logger.info(`SD API endpoint: ${process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1231/v1'}`);
  logger.info(`WebSocket server initialized at ws://${HOST}:${PORT}/ws`);

  // Fail old queued/processing generations from previous server run
  try {
    failOldQueuedGenerations();
  } catch (error) {
    logger.error(`Failed to fail old queued generations: ${error.message}`);
  }

  // Initialize model manager
  try {
    modelManager.loadConfig();
    const allModels = modelManager.getAllModels();
    const defaultModel = modelManager.getDefaultModel();
    logger.info({ count: allModels.length }, `Model manager initialized`);
    logger.info({ defaultModel: defaultModel?.id || defaultModel?.name || 'none' }, `Default model`);
  } catch (error) {
    logger.error(`Failed to load model configuration: ${error.message}`);
  }

  // Start the queue processor
  startQueueProcessor(2000);
  logger.info(`Queue processor started (polling every 2 seconds)`);

  // Log download method info
  const downloadMethod = await getDownloadMethod();
  logger.info({ downloadMethod }, `Download method`);

  // Log HuggingFace cache directories
  logger.info({ hfHubCache: process.env.HF_HUB_CACHE || process.env.HUGGINGFACE_HUB_CACHE || './models/hf_cache/hub' }, `Python HF Hub cache`);
  logger.info({ nodeCache: process.env.NODE_HF_CACHE || './models/hf_cache/node' }, `Node.js cache`);
  logger.info({ modelsDir: process.env.MODELS_DIR || './models' }, `Models directory`);
});
