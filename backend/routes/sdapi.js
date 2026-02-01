import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { modelManager } from '../services/modelManager.js';
import {
  getGenerationById,
  getImagesByGenerationId,
  getAllGenerations,
  getGenerationStats,
  cancelGeneration,
  createGeneration,
  GenerationStatus
} from '../db/queries.js';
import { SD_SAMPLERS, findModelIdByName } from '../utils/modelHelpers.js';
import { authenticateRequest } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const logger = createLogger('routes:sdapi');

/**
 * SD.next / Automatic1111 compatible API endpoints
 * These use the standard /sdapi/v1/ path that SillyTavern and other tools expect
 */

export function registerSdApiRoutes(app) {
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
        // Map model name to ID
        const modelId = findModelIdByName(sd_model_checkpoint, modelManager);
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
        const generation = await getGenerationById(jobId);

        if (generation && generation.status === 'completed') {
          const images = await getImagesByGenerationId(jobId);
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
      const { getAvailableUpscalers } = await import('../services/upscalerService.js');
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
   * Supports both JSON (base64) and multipart/form-data (file upload)
   */
  app.post('/sdapi/v1/extra-single-image', upload.single('image'), authenticateRequest, async (req, res) => {
    try {
      const { upscaleImage } = await import('../services/upscalerService.js');

      let image;
      let resize_mode = 0;
      let show_extras_results = true;
      let gfpgan_visibility = 0;
      let codeformer_visibility = 0;
      let codeformer_weight = 0;
      let upscaling_resize = 2.0;
      let upscaling_resize_w = 512;
      let upscaling_resize_h = 512;
      let upscaling_crop = true;
      let upscaler_1 = 'RealESRGAN 4x+';
      let upscaler_2 = 'None';
      let extras_upscaler_2_visibility = 0;

      // Handle both multipart form data (file upload) and JSON (base64)
      if (req.file) {
        // File upload via multipart/form-data
        const { buffer, mimetype } = req.file;
        image = `data:${mimetype};base64,${buffer.toString('base64')}`;

        // Get other fields from req.body (form fields)
        if (req.body) {
          if (req.body.resize_mode !== undefined) resize_mode = parseInt(req.body.resize_mode, 10);
          if (req.body.upscale_factor !== undefined) upscaling_resize = parseFloat(req.body.upscale_factor);
          if (req.body.upscaler) upscaler_1 = req.body.upscaler;
          if (req.body.target_width !== undefined) upscaling_resize_w = parseInt(req.body.target_width, 10);
          if (req.body.target_height !== undefined) upscaling_resize_h = parseInt(req.body.target_height, 10);
        }
      } else {
        // JSON body with base64 image
        ({
          image,
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
        } = req.body);

        if (!image) {
          return res.status(400).json({ error: 'Missing required field: image' });
        }
      }

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
      const { upscaleImage } = await import('../services/upscalerService.js');

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
}

export default registerSdApiRoutes;
