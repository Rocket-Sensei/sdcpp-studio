import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';
import http from 'http';
import { initializeDatabase, getImagesDir, getInputImagesDir } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import { generateImage } from './services/imageService.js';
import {
  getAllGenerations,
  getGenerationById,
  getImageById,
  getImagesByGenerationId,
  createGeneration,
  cancelGeneration,
  getGenerationStats,
  GenerationStatus,
  deleteGeneration
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
import { logApiRequest } from './utils/logger.js';

// Load environment variables from .env file
const envResult = config({
  path: path.join(dirname(fileURLToPath(import.meta.url)), '.env')
});

if (envResult.error) {
  // .env file is optional, log but don't fail
  console.log('Note: .env file not found, using environment variables');
}

// Log HuggingFace token status
if (process.env.HF_TOKEN) {
  console.log('HuggingFace token configured for authenticated downloads');
} else {
  console.log('No HuggingFace token found (HF_TOKEN not set)');
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
  // Only log API routes, skip static files and health checks
  // Include both /api/* and /sdapi/* routes for SD.next compatibility
  if ((req.path.startsWith('/api') || req.path.startsWith('/sdapi')) && req.path !== '/api/health') {
    const startTime = Date.now();

    // Log the request
    const protocol = req.protocol;
    const host = req.get('host');
    const url = `${protocol}://${host}${req.originalUrl}`;
    logApiRequest(req.method, url, req.headers, req.body);

    // Capture response when finished
    res.on('finish', () => {
      const elapsed = Date.now() - startTime;
      console.log(`[API] Response: ${res.statusCode} (${elapsed}ms)`);
    });
  }
  next();
});

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

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
    model: defaultModel?.id || 'qwen-image'
  });
});

// Generate image (text-to-image)
app.post('/api/generate', async (req, res) => {
  try {
    const result = await generateImage(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image edit (image-to-image)
app.post('/api/edit', upload.single('image'), async (req, res) => {
  try {
    const result = await generateImage({
      ...req.body,
      image: req.file
    }, 'edit');
    res.json(result);
  } catch (error) {
    console.error('Error editing image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image variation
app.post('/api/variation', upload.single('image'), async (req, res) => {
  try {
    const result = await generateImage({
      ...req.body,
      image: req.file
    }, 'variation');
    res.json(result);
  } catch (error) {
    console.error('Error creating variation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all generations
app.get('/api/generations', async (req, res) => {
  try {
    const generations = await getAllGenerations();
    res.json(generations);
  } catch (error) {
    console.error('Error fetching generations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single generation
app.get('/api/generations/:id', async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }
    res.json(generation);
  } catch (error) {
    console.error('Error fetching generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get image file by image ID (for thumbnails and specific images)
app.get('/api/images/:imageId', async (req, res) => {
  try {
    const image = getImageById(req.params.imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.set('Content-Type', image.mime_type);
    res.sendFile(image.file_path);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get first image for a generation (for backwards compatibility)
app.get('/api/generations/:id/image', async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation || !generation.images || generation.images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const firstImage = generation.images[0];
    res.set('Content-Type', firstImage.mime_type);
    res.sendFile(firstImage.file_path);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all images for a generation
app.get('/api/generations/:id/images', async (req, res) => {
  try {
    const images = await getImagesByGenerationId(req.params.id);
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete generation
app.delete('/api/generations/:id', async (req, res) => {
  try {
    // Delete the generation (also deletes associated images via cascade)
    const result = deleteGeneration(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== Queue API Endpoints ==========

// Add job to queue (text-to-image)
app.post('/api/queue/generate', async (req, res) => {
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
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add job to queue (image-to-image edit)
app.post('/api/queue/edit', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mask', maxCount: 1 }]), async (req, res) => {
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
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add job to queue (variation)
app.post('/api/queue/variation', upload.single('image'), async (req, res) => {
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
      // SD.cpp Advanced Settings
      cfg_scale: req.body.cfg_scale,
      sampling_method: req.body.sampling_method,
      sample_steps: req.body.sample_steps,
      clip_skip: req.body.clip_skip,
    };

    await createGeneration(params);
    res.json({ job_id: id, status: GenerationStatus.PENDING });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all jobs in queue (now returns generations with status)
app.get('/api/queue', async (req, res) => {
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
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get queue statistics (must be before /:id route)
app.get('/api/queue/stats', async (req, res) => {
  try {
    const stats = getGenerationStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single job
app.get('/api/queue/:id', async (req, res) => {
  try {
    const job = getGenerationById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
app.delete('/api/queue/:id', async (req, res) => {
  try {
    const job = cancelGeneration(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or cannot be cancelled' });
    }
    res.json({ success: true, job });
  } catch (error) {
    console.error('Error cancelling job:', error);
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

// ========== Model Management API Endpoints ==========

/**
 * GET /api/models
 * List all available models
 */
app.get('/api/models', async (req, res) => {
  try {
    const models = modelManager.getAllModels();
    // getAllModels() returns an array, so we need to handle it properly
    res.json({
      models: models,
      default: modelManager.getDefaultModel(),
      default_models: modelManager.defaultModels
    });
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/running
 * Get list of currently running models
 * NOTE: This route must be defined BEFORE /api/models/:id to avoid "running" being treated as a model ID
 */
app.get('/api/models/running', async (req, res) => {
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
    console.error('Error fetching running models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/downloaded
 * Get list of downloaded models
 * NOTE: This route must be defined BEFORE /api/models/:id to avoid "downloaded" being treated as a model ID
 */
app.get('/api/models/downloaded', async (req, res) => {
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
    console.error('Error fetching downloaded models:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id
 * Get details for a specific model
 */
app.get('/api/models/:id', async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const isRunning = modelManager.isModelRunning(modelId);
    const processInfo = isRunning ? processTracker.getProcess(modelId) : null;

    res.json({
      id: modelId,
      ...model,
      running: isRunning,
      process: processInfo ? {
        pid: processInfo.pid,
        port: processInfo.port,
        execMode: processInfo.execMode,
        startedAt: processInfo.startedAt
      } : null
    });
  } catch (error) {
    console.error('Error fetching model:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id/status
 * Get the running status of a specific model
 */
app.get('/api/models/:id/status', async (req, res) => {
  try {
    const modelId = req.params.id;
    const model = modelManager.getModel(modelId);

    if (!model) {
      return res.status(404).json({ error: 'Model not found' });
    }

    const status = modelManager.getModelStatus(modelId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching model status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/start
 * Start a model process
 */
app.post('/api/models/:id/start', async (req, res) => {
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
    console.error('Error starting model:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/stop
 * Stop a running model process
 */
app.post('/api/models/:id/stop', async (req, res) => {
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
    console.error('Error stopping model:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/running
 * Get list of currently running models
 */
app.get('/api/models/running', async (req, res) => {
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
    console.error('Error fetching running models:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== Model Download API Endpoints ==========

/**
 * POST /api/models/download
 * Start a model download from HuggingFace
 * Body: { modelId, repo, files }
 */
app.post('/api/models/download', async (req, res) => {
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
        console.log(`Download ${downloadId} progress:`, progress);
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
    console.error('Error starting download:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/download/:id
 * Get the status of a model download
 */
app.get('/api/models/download/:id', async (req, res) => {
  try {
    const downloadId = req.params.id;
    const status = modelDownloader.getDownloadStatus(downloadId);

    if (!status) {
      return res.status(404).json({ error: 'Download not found' });
    }

    res.json(status);
  } catch (error) {
    console.error('Error fetching download status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/models/download/:id
 * Cancel an active model download
 */
app.delete('/api/models/download/:id', async (req, res) => {
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
    console.error('Error cancelling download:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/models/:id/files/status
 * Check if model files exist on disk
 */
app.get('/api/models/:id/files/status', async (req, res) => {
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
    console.error('Error checking model files:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/models/:id/download
 * Download model files from HuggingFace based on model config
 */
app.post('/api/models/:id/download', async (req, res) => {
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
        console.log(`Download ${modelId} progress:`, progress);
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
    console.error('Error starting download:', error);
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

// GET /sdapi/v1/samplers - List available samplers
app.get('/sdapi/v1/samplers', (req, res) => {
  res.json(SD_SAMPLERS);
});

// GET /sdapi/v1/schedulers - List available schedulers (same as samplers for SD.cpp)
app.get('/sdapi/v1/schedulers', (req, res) => {
  res.json(SD_SAMPLERS);
});

// GET /sdapi/v1/sd-models - List all available models
app.get('/sdapi/v1/sd-models', (req, res) => {
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
    console.error('Error fetching models:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /sdapi/v1/options - Get current options (including model checkpoint)
app.get('/sdapi/v1/options', (req, res) => {
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
    console.error('Error fetching options:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /sdapi/v1/options - Set options (for set-model endpoint)
app.post('/sdapi/v1/options', async (req, res) => {
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
        console.log(`[API] Started model: ${modelId} (${model.name})`);
      }
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting options:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /sdapi/v1/progress - Get generation progress
app.get('/sdapi/v1/progress', (req, res) => {
  try {
    const stats = getGenerationStats();
    const jobs = getAllGenerations();
    const processingJob = jobs.find(j => j.status === 'processing');

    let progress = 0;
    let state = { job_count: 0 };

    if (processingJob) {
      progress = processingJob.progress || 0;
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
    console.error('Error fetching progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /sdapi/v1/interrupt - Interrupt current generation
app.post('/sdapi/v1/interrupt', (req, res) => {
  try {
    const jobs = getAllGenerations();
    const processingJob = jobs.find(j => j.status === 'processing');
    if (processingJob) {
      cancelGeneration(processingJob.id);
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error interrupting:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /sdapi/v1/txt2img - Text to image generation
app.post('/sdapi/v1/txt2img', async (req, res) => {
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
      // SD WebUI API compatibility fields
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

    // Check override_settings first (SD WebUI API standard for per-request override)
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
      sample_steps: steps || 20,
      cfg_scale: cfg_scale || 7.0,
      sampling_method: sampler_name || 'euler',
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
              const buffer = await fs.readFile(img.path);
              return buffer.toString('base64');
            } catch {
              return null;
            }
          }));

          return res.json({
            images: imagesData.filter(Boolean),
            parameters: job,
            info: JSON.stringify(job)
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
    console.error('Error in txt2img:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// Create HTTP server and attach WebSocket
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = initializeWebSocket(server);

server.listen(PORT, HOST, async () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`SD API endpoint: ${process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1231/v1'}`);
  console.log(`WebSocket server initialized at ws://${HOST}:${PORT}/ws`);

  // Initialize model manager
  try {
    modelManager.loadConfig();
    const allModels = modelManager.getAllModels();
    const defaultModel = modelManager.getDefaultModel();
    console.log(`Model manager initialized: ${allModels.length} models loaded`);
    console.log(`Default model: ${defaultModel?.id || defaultModel?.name || 'none'}`);
  } catch (error) {
    console.error(`Failed to load model configuration: ${error.message}`);
  }

  // Start the queue processor
  startQueueProcessor(2000);
  console.log(`Queue processor started (polling every 2 seconds)`);

  // Log download method info
  const downloadMethod = await getDownloadMethod();
  console.log(`Download method: ${downloadMethod}`);

  // Log HuggingFace cache directories
  console.log(`Python HF Hub cache: ${process.env.HF_HUB_CACHE || process.env.HUGGINGFACE_HUB_CACHE || './models/hf_cache/hub'}`);
  console.log(`Node.js cache: ${process.env.NODE_HF_CACHE || './models/hf_cache/node'}`);
  console.log(`Models directory: ${process.env.MODELS_DIR || './models'}`);
});
