/**
 * Models Controller
 *
 * Handles endpoints for listing models and managing model options.
 * SD.next / Automatic1111 compatible API.
 */

import { modelManager } from '../../services/modelManager.js';
import { findModelIdByName } from '../../utils/modelHelpers.js';
import { createLogger } from '../../utils/logger.js';
import { getConfig, setConfig } from '../../db/database.js';

const logger = createLogger('controllers:models');

// Config key for cached model selection
const CACHED_MODEL_KEY = 'sdnext_cached_model';

/**
 * Register model-related routes
 * @param {import('express').Express} app - Express app instance
 * @param {Function} authenticateRequest - Authentication middleware
 */
export function registerModelRoutes(app, authenticateRequest) {
  /**
   * GET /sdapi/v1/sd-models
   * List all available models (authenticated)
   */
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

  /**
   * GET /sdapi/v1/options
   * Get current options (including model checkpoint) (authenticated)
   */
  app.get('/sdapi/v1/options', authenticateRequest, (req, res) => {
    try {
      // First check for cached model selection (for SillyTavern integration)
      const cachedModelId = getConfig(CACHED_MODEL_KEY);
      let currentModelName = '';

      if (cachedModelId) {
        const cachedModel = modelManager.getModel(cachedModelId);
        if (cachedModel) {
          currentModelName = cachedModel.name;
        }
      }

      // Fall back to running model or default if no cached selection
      if (!currentModelName) {
        const runningModels = modelManager.getRunningModels();
        const defaultModel = modelManager.getDefaultModel();

        if (runningModels.length > 0) {
          const runningModel = typeof runningModels[0] === 'string'
            ? modelManager.getModel(runningModels[0])
            : runningModels[0];
          currentModelName = runningModel?.name || '';
        } else if (defaultModel) {
          currentModelName = defaultModel.name || '';
        }
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

  /**
   * POST /sdapi/v1/options
   * Set options (for set-model endpoint)
   * Caches the model selection instead of directly loading it.
   * The queue processor will use this cached selection when processing jobs.
   */
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

        // Cache the model selection in the database
        // SillyTavern expects us to remember this selection for subsequent requests
        setConfig(CACHED_MODEL_KEY, modelId);
        logger.info({ modelId, modelName: sd_model_checkpoint }, 'Cached model selection via SD.next API');

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
}
