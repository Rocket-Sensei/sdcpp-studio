/**
 * Text-to-Image Controller
 *
 * Handles the txt2img generation endpoint using the GenerationWaiter
 * for efficient event-based waiting instead of polling.
 * SD.next / Automatic1111 compatible API.
 */

import { randomUUID } from 'crypto';
import { modelManager } from '../../services/modelManager.js';
import { generationWaiter } from '../../services/generationWaiter.js';
import {
  getGenerationById,
  getImagesByGenerationId,
  createGeneration
} from '../../db/queries.js';
import { findModelIdByName } from '../../utils/modelHelpers.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('controllers:txt2img');

// Default timeout: 1 hour
const DEFAULT_TIMEOUT_MS = 3600000;

/**
 * Register txt2img routes
 * @param {import('express').Express} app - Express app instance
 * @param {Function} authenticateRequest - Authentication middleware
 */
export function registerTxt2ImgRoutes(app, authenticateRequest) {
  /**
   * POST /sdapi/v1/txt2img
   * Text to image generation
   */
  app.post('/sdapi/v1/txt2img', authenticateRequest, async (req, res) => {
    const jobId = randomUUID();

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

      // Determine model ID from request
      // Priority: override_settings.sd_model_checkpoint > sd_model_checkpoint > running model > default
      let modelId = null;

      // Check override_settings first (SD.next API standard for per-request override)
      if (override_settings && override_settings.sd_model_checkpoint) {
        modelId = findModelIdByName(override_settings.sd_model_checkpoint, modelManager);
      }
      // Check direct sd_model_checkpoint
      else if (sd_model_checkpoint) {
        modelId = findModelIdByName(sd_model_checkpoint, modelManager);
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
      logger.info({ jobId, modelId, prompt: prompt?.substring(0, 50) }, '[txt2img] Generation queued');

      // Wait for completion using GenerationWaiter (event-based, no polling)
      const generation = await generationWaiter.waitForGeneration(jobId, DEFAULT_TIMEOUT_MS);

      if (!generation) {
        return res.status(500).json({ error: 'Generation not found' });
      }

      // Get the generated images
      const images = await getImagesByGenerationId(jobId);
      if (!images || images.length === 0) {
        return res.status(500).json({ error: 'No images generated' });
      }

      // Read and encode images
      const fs = await import('fs/promises');
      const imagesData = await Promise.all(images.map(async (img) => {
        try {
          const buffer = await fs.readFile(img.file_path);
          return buffer.toString('base64');
        } catch (err) {
          logger.error({ err, imgId: img.id }, '[txt2img] Failed to read image');
          return null;
        }
      }));

      const validImages = imagesData.filter(Boolean);
      if (validImages.length === 0) {
        return res.status(500).json({ error: 'Failed to read generated images' });
      }

      logger.info({ jobId, imageCount: validImages.length }, '[txt2img] Generation completed');

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

    } catch (error) {
      logger.error({ error, jobId }, '[txt2img] Generation failed');

      // Check if this is a timeout error
      if (error.message.includes('timeout')) {
        return res.status(500).json({ error: 'Generation timeout - the model may still be processing' });
      }

      res.status(500).json({ error: error.message });
    }
  });
}
