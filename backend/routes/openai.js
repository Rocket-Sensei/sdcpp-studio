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
import { getModelFileStatus } from '../utils/modelHelpers.js';

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
   * OpenAI-compatible models list endpoint (OpenRouter-style format)
   */
  app.get('/api/v1/models', authenticateRequest, async (req, res) => {
    const models = modelManager.getAllModels();
    
    const getModalities = (model) => {
      // Use model's architecture if available
      if (model.architecture?.output_modalities) {
        const inputMods = model.architecture.input_modalities || ['text'];
        const outputMods = model.architecture.output_modalities;
        
        return {
          modality: inputMods.length > 0 && outputMods.length > 0 
            ? `${inputMods.join('+')}->${outputMods.join('+')}`
            : 'text->image',
          input_modalities: inputMods,
          output_modalities: outputMods
        };
      }
      
      // Fallback: derive from capabilities
      const capabilities = model.capabilities;
      const inputMods = [];
      const outputMods = ['image'];
      
      if (capabilities?.includes('text-to-image')) {
        inputMods.push('text');
      }
      if (capabilities?.includes('image-to-image') || capabilities?.includes('imgedit')) {
        inputMods.push('image');
      }
      if (capabilities?.includes('video')) {
        inputMods.push('text');
        outputMods.push('video');
      }
      
      return {
        modality: inputMods.length > 0 && outputMods.length > 0 
          ? `${inputMods.join('+')}+image->${outputMods.join('+')}`
          : 'text->image',
        input_modalities: inputMods.length > 0 ? inputMods : ['text'],
        output_modalities: outputMods
      };
    };

    const modelsWithFileStatus = await Promise.all(
      models.map(async (model) => {
        const fileStatus = await getModelFileStatus(model);
        return { model, fileStatus };
      })
    );

    res.json({
      object: 'list',
      backend_settings: modelManager.backendSettings || {},
      data: modelsWithFileStatus
        .filter(({ model }) => model.enabled !== false)
        .map(({ model, fileStatus }) => {
          const architecture = getModalities(model);
          return {
            id: model.id,
            object: 'model',
            created: Date.now(),
            name: model.name || model.id,
            description: model.description || '',
            quant: model.quant || 'unknown',
            status: model.status || 'stopped',
            architecture,
            context_length: null,
            supported_parameters: ['cfg_scale', 'sample_steps', 'sampling_method', 'width', 'height', 'seed'],
            default_parameters: {
              cfg_scale: model.generation_params?.cfg_scale ?? null,
              sample_steps: model.generation_params?.sample_steps ?? null,
              sampling_method: model.generation_params?.sampling_method ?? null
            },
            fileStatus
          };
        })
    });
  });

  /**
   * POST /api/v1/models/:id/start
   * Start a model process
   * Body: { steps?: number, threads?: number, extraArgs?: string }
   */
  app.post('/api/v1/models/:id/start', authenticateRequest, async (req, res) => {
    try {
      const modelId = req.params.id;
      const { steps, threads, extraArgs } = req.body || {};
      const model = modelManager.getModel(modelId);

      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }

      if (modelManager.isModelRunning(modelId)) {
        return res.status(409).json({
          error: 'Model is already running',
          status: modelManager.getModelStatus(modelId)
        });
      }

      // Build options for startModel
      const options = {};
      if (steps !== undefined || threads !== undefined || extraArgs) {
        options.args = [...(model.args || [])];
        
        // Inject --steps if provided
        if (steps !== undefined) {
          const existingStepsIdx = options.args.findIndex(arg => arg === '--steps');
          if (existingStepsIdx >= 0) {
            options.args[existingStepsIdx + 1] = String(steps);
          } else {
            options.args.push('--steps', String(steps));
          }
        }
        
        // Inject --threads if provided
        if (threads !== undefined) {
          const existingThreadsIdx = options.args.findIndex(arg => arg === '--threads');
          if (existingThreadsIdx >= 0) {
            options.args[existingThreadsIdx + 1] = String(threads);
          } else {
            options.args.push('--threads', String(threads));
          }
        }
        
        // Parse and inject extra args
        if (extraArgs && typeof extraArgs === 'string') {
          const extra = extraArgs.split(/\s+/).filter(Boolean);
          options.args.push(...extra);
        }
      }

      const process = await modelManager.startModel(modelId, options);

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
   * POST /api/v1/models/:id/stop
   * Stop a model process
   */
  app.post('/api/v1/models/:id/stop', authenticateRequest, async (req, res) => {
    try {
      const modelId = req.params.id;
      const model = modelManager.getModel(modelId);

      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }

      if (!modelManager.isModelRunning(modelId)) {
        return res.status(409).json({
          error: 'Model is not running',
          status: modelManager.getModelStatus(modelId)
        });
      }

      await modelManager.stopModel(modelId);

      res.json({
        success: true,
        modelId,
        status: 'stopping',
        message: `Model ${modelId} is stopping`
      });
    } catch (error) {
      logger.error({ error }, 'Error stopping model');
      res.status(500).json({ error: error.message });
    }
  });
}

export default registerOpenAIRoutes;
