import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import {
  getGenerationById,
  getImagesByGenerationId,
  createGeneration,
  GenerationStatus
} from '../db/queries.js';
import { modelManager } from '../services/modelManager.js';
import { authenticateRequest } from '../middleware/auth.js';

const logger = createLogger('routes:openai');

/**
 * OpenAI-compatible API routes
 * These provide standard OpenAI-compatible endpoints that internally use the queue system
 */

export function registerOpenAIRoutes(app, upload) {
  /**
   * POST /api/v1/images/generations
   * OpenAI-compatible text-to-image generation endpoint
   * Queues job internally and waits for completion (synchronous from client perspective)
   */
  app.post('/api/v1/images/generations', authenticateRequest, async (req, res) => {
    try {
      const {
        prompt,
        model,
        negative_prompt,
        size,
        n,
        quality,
        style,
        seed,
        response_format,
        // SD.cpp Advanced Settings (via extra args in prompt)
        cfg_scale,
        sampling_method,
        sample_steps,
        clip_skip,
      } = req.body;

      if (!prompt) {
        return res.status(400).json({ error: { message: 'Missing required field: prompt', type: 'invalid_request_error' } });
      }

      // Get default model if not specified
      const modelId = model || modelManager.getDefaultModel()?.id;
      if (!modelId) {
        return res.status(400).json({ error: { message: 'No model specified and no default model configured', type: 'invalid_request_error' } });
      }

      // Validate the model exists
      const modelConfig = modelManager.getModel(modelId);
      if (!modelConfig) {
        return res.status(400).json({
          error: {
            message: `Invalid model: ${modelId}`,
            type: 'invalid_request_error',
            detail: `Model '${modelId}' not found in configuration. Available models: ${modelManager.getAllModels().map(m => m.id).join(', ')}`
          }
        });
      }

      // Get model-specific default parameters
      const modelParams = modelManager.getModelGenerationParams(modelId);

      // Create generation job in queue
      const jobId = randomUUID();
      const job = {
        id: jobId,
        type: 'generate',
        model: modelId,
        prompt: prompt || '',
        negative_prompt: negative_prompt || '',
        size: size || '1024x1024',
        seed: seed ?? -1,
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
      logger.info({ jobId, model: modelId, prompt: prompt.substring(0, 50) }, 'OpenAI API: Created generation job');

      // Wait for completion (simple polling)
      const MAX_WAIT = 7200; // 2 hours in seconds (3600 * 2)
      const POLL_INTERVAL = 500; // 500ms
      const MAX_ATTEMPTS = (MAX_WAIT * 1000) / POLL_INTERVAL;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        const generation = await getGenerationById(jobId);

        if (generation && generation.status === 'completed') {
          const images = await getImagesByGenerationId(jobId);
          if (images && images.length > 0) {
            logger.info({ jobId, imageCount: images.length }, 'OpenAI API: Generation completed');

            // Return OpenAI-compatible format
            if (response_format === 'b64_json') {
              // Return base64-encoded images
              const imageData = await Promise.all(images.map(async (img) => {
                const fs = await import('fs/promises');
                const imageBuffer = await fs.readFile(img.file_path);
                return {
                  b64_json: imageBuffer.toString('base64'),
                  revised_prompt: img.revised_prompt || null
                };
              }));
              return res.json({
                created: Math.floor(new Date(generation.created_at).getTime() / 1000),
                data: imageData
              });
            } else {
              // Return URLs (default OpenAI behavior)
              return res.json({
                created: Math.floor(new Date(generation.created_at).getTime() / 1000),
                data: images.map(img => ({
                  url: `/api/images/${img.id}`,
                  revised_prompt: img.revised_prompt || null
                }))
              });
            }
          }
        }

        if (generation && generation.status === 'failed') {
          logger.error({ jobId, error: generation.error }, 'OpenAI API: Generation failed');
          return res.status(500).json({
            error: {
              message: generation.error || 'Generation failed',
              type: 'server_error'
            }
          });
        }

        if (generation && generation.status === 'cancelled') {
          logger.warn({ jobId }, 'OpenAI API: Generation cancelled');
          return res.status(500).json({
            error: {
              message: 'Generation was cancelled',
              type: 'server_error'
            }
          });
        }

        attempts++;
      }

      logger.error({ jobId, attempts }, 'OpenAI API: Generation timeout');
      res.status(500).json({ error: { message: 'Generation timeout', type: 'server_error' } });
    } catch (error) {
      logger.error({ error }, 'OpenAI API: Error generating image');
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    }
  });

  /**
   * POST /api/v1/images/edits
   * OpenAI-compatible image editing endpoint (image-to-image with mask)
   */
  app.post('/api/v1/images/edits', authenticateRequest, upload.single('image'), async (req, res) => {
    try {
      const {
        prompt,
        model,
        negative_prompt,
        size,
        n,
        seed,
        response_format,
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: { message: 'Image file is required', type: 'invalid_request_error' } });
      }

      if (!prompt) {
        return res.status(400).json({ error: { message: 'Missing required field: prompt', type: 'invalid_request_error' } });
      }

      // Get default model if not specified
      const modelId = model || modelManager.getDefaultModel()?.id;
      if (!modelId) {
        return res.status(400).json({ error: { message: 'No model specified and no default model configured', type: 'invalid_request_error' } });
      }

      // Validate the model exists
      const modelConfig = modelManager.getModel(modelId);
      if (!modelConfig) {
        return res.status(400).json({
          error: {
            message: `Invalid model: ${modelId}`,
            type: 'invalid_request_error'
          }
        });
      }

      // Save uploaded image to disk
      const { writeFile } = await import('fs/promises');
      const { getInputImagesDir } = await import('../db/database.js');
      const { ensurePngFormat } = await import('../utils/imageUtils.js');

      const inputImagesDir = getInputImagesDir();
      const imageFilename = `${randomUUID()}.png`;
      const imagePath = `${inputImagesDir}/${imageFilename}`;
      const pngBuffer = await ensurePngFormat(req.file.buffer, req.file.mimetype);
      await writeFile(imagePath, pngBuffer);

      // Create generation job in queue
      const jobId = randomUUID();
      const job = {
        id: jobId,
        type: 'edit',
        model: modelId,
        prompt: prompt || '',
        negative_prompt: negative_prompt || '',
        size: size || '1024x1024',
        seed: seed ?? -1,
        n: n || 1,
        status: GenerationStatus.PENDING,
        created_at: new Date().toISOString(),
        input_image_path: imagePath,
        input_image_mime_type: 'image/png',
      };

      await createGeneration(job);
      logger.info({ jobId, model: modelId }, 'OpenAI API: Created edit job');

      // Wait for completion
      const MAX_WAIT = 7200;
      const POLL_INTERVAL = 500;
      const MAX_ATTEMPTS = (MAX_WAIT * 1000) / POLL_INTERVAL;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        const generation = await getGenerationById(jobId);

        if (generation && generation.status === 'completed') {
          const images = await getImagesByGenerationId(jobId);
          if (images && images.length > 0) {
            if (response_format === 'b64_json') {
              const imageData = await Promise.all(images.map(async (img) => {
                const fs = await import('fs/promises');
                const imageBuffer = await fs.readFile(img.file_path);
                return {
                  b64_json: imageBuffer.toString('base64'),
                  revised_prompt: img.revised_prompt || null
                };
              }));
              return res.json({
                created: Math.floor(new Date(generation.created_at).getTime() / 1000),
                data: imageData
              });
            } else {
              return res.json({
                created: Math.floor(new Date(generation.created_at).getTime() / 1000),
                data: images.map(img => ({
                  url: `/api/images/${img.id}`,
                  revised_prompt: img.revised_prompt || null
                }))
              });
            }
          }
        }

        if (generation && generation.status === 'failed') {
          return res.status(500).json({
            error: { message: generation.error || 'Edit failed', type: 'server_error' }
          });
        }

        attempts++;
      }

      res.status(500).json({ error: { message: 'Edit timeout', type: 'server_error' } });
    } catch (error) {
      logger.error({ error }, 'OpenAI API: Error editing image');
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    }
  });

  /**
   * POST /api/v1/images/variations
   * OpenAI-compatible image variation endpoint
   */
  app.post('/api/v1/images/variations', authenticateRequest, upload.single('image'), async (req, res) => {
    try {
      const {
        model,
        prompt,
        negative_prompt,
        size,
        n,
        seed,
        strength,
        response_format,
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ error: { message: 'Image file is required', type: 'invalid_request_error' } });
      }

      // Get default model if not specified
      const modelId = model || modelManager.getDefaultModel()?.id;
      if (!modelId) {
        return res.status(400).json({ error: { message: 'No model specified and no default model configured', type: 'invalid_request_error' } });
      }

      // Validate the model exists
      const modelConfig = modelManager.getModel(modelId);
      if (!modelConfig) {
        return res.status(400).json({
          error: {
            message: `Invalid model: ${modelId}`,
            type: 'invalid_request_error'
          }
        });
      }

      // Save uploaded image to disk
      const { writeFile } = await import('fs/promises');
      const { getInputImagesDir } = await import('../db/database.js');
      const { ensurePngFormat } = await import('../utils/imageUtils.js');

      const inputImagesDir = getInputImagesDir();
      const imageFilename = `${randomUUID()}.png`;
      const imagePath = `${inputImagesDir}/${imageFilename}`;
      const pngBuffer = await ensurePngFormat(req.file.buffer, req.file.mimetype);
      await writeFile(imagePath, pngBuffer);

      // Create generation job in queue
      const jobId = randomUUID();
      const job = {
        id: jobId,
        type: 'variation',
        model: modelId,
        prompt: prompt || '',
        negative_prompt: negative_prompt || '',
        size: size || '1024x1024',
        seed: seed ?? -1,
        n: n || 1,
        status: GenerationStatus.PENDING,
        created_at: new Date().toISOString(),
        input_image_path: imagePath,
        input_image_mime_type: 'image/png',
        strength: parseFloat(strength) || 0.75,
      };

      await createGeneration(job);
      logger.info({ jobId, model: modelId }, 'OpenAI API: Created variation job');

      // Wait for completion
      const MAX_WAIT = 7200;
      const POLL_INTERVAL = 500;
      const MAX_ATTEMPTS = (MAX_WAIT * 1000) / POLL_INTERVAL;
      let attempts = 0;

      while (attempts < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        const generation = await getGenerationById(jobId);

        if (generation && generation.status === 'completed') {
          const images = await getImagesByGenerationId(jobId);
          if (images && images.length > 0) {
            if (response_format === 'b64_json') {
              const imageData = await Promise.all(images.map(async (img) => {
                const fs = await import('fs/promises');
                const imageBuffer = await fs.readFile(img.file_path);
                return {
                  b64_json: imageBuffer.toString('base64'),
                  revised_prompt: img.revised_prompt || null
                };
              }));
              return res.json({
                created: Math.floor(new Date(generation.created_at).getTime() / 1000),
                data: imageData
              });
            } else {
              return res.json({
                created: Math.floor(new Date(generation.created_at).getTime() / 1000),
                data: images.map(img => ({
                  url: `/api/images/${img.id}`,
                  revised_prompt: img.revised_prompt || null
                }))
              });
            }
          }
        }

        if (generation && generation.status === 'failed') {
          return res.status(500).json({
            error: { message: generation.error || 'Variation failed', type: 'server_error' }
          });
        }

        attempts++;
      }

      res.status(500).json({ error: { message: 'Variation timeout', type: 'server_error' } });
    } catch (error) {
      logger.error({ error }, 'OpenAI API: Error creating variation');
      res.status(500).json({ error: { message: error.message, type: 'server_error' } });
    }
  });

  /**
   * GET /api/v1/models
   * OpenAI-compatible models list endpoint
   */
  app.get('/api/v1/models', authenticateRequest, (req, res) => {
    const models = modelManager.getAllModels();
    res.json({
      object: 'list',
      data: models.map(model => ({
        id: model.id,
        object: 'model',
        created: Date.now(),
        owned_by: 'sd-cpp-studio',
        permission: [],
        root: model.id,
        parent: null,
      }))
    });
  });
}

export default registerOpenAIRoutes;
