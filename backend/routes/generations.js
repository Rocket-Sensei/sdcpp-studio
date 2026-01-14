import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import {
  getGenerationById,
  getImagesByGenerationId,
  createGeneration,
  getAllGenerations,
  getGenerationsCount,
  deleteGeneration,
  deleteAllGenerations,
  GenerationStatus
} from '../db/queries.js';
import { ensurePngFormat } from '../utils/imageUtils.js';
import { getInputImagesDir } from '../db/database.js';
import { modelManager } from '../services/modelManager.js';
import { authenticateRequest } from '../middleware/auth.js';

const logger = createLogger('routes:generations');

/**
 * Generation routes
 * These provide synchronous API endpoints that internally use the queue system
 */

export function registerGenerationRoutes(app, upload) {
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
}

export default registerGenerationRoutes;
