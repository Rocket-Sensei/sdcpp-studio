import { createLogger } from '../utils/logger.js';
import { modelManager } from '../services/modelManager.js';
import { processTracker } from '../services/processTracker.js';
import { modelDownloader } from '../services/modelDownloader.js';
import { getModelFileStatus, findModelIdByName } from '../utils/modelHelpers.js';
import { getGpuInfo } from '../services/gpuService.js';
import { calculateMemoryForModel } from '../services/memoryCalculator.js';
import { fileURLToPath } from 'url';
import { resolve, dirname, basename, join } from 'path';
import { authenticateRequest } from '../middleware/auth.js';

const logger = createLogger('routes:models');

/**
 * Model management routes
 * These endpoints provide model listing, status, start/stop, and download functionality
 */

export function registerModelRoutes(app) {
  /**
   * GET /api/settings
   * Get global settings including backend enablement
   */
  app.get('/api/settings', authenticateRequest, async (req, res) => {
    try {
      res.json({
        backend_settings: modelManager.backendSettings || {},
        default_autostop: modelManager.defaultAutostop,
        supports_negative_prompt: modelManager.defaultSupportsNegativePrompt,
        default_model: modelManager.defaultModelId,
        default_models: modelManager.defaultModels
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching settings');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/gpu-info
   * Get detected GPU information
   */
  app.get('/api/gpu-info', authenticateRequest, async (req, res) => {
    try {
      const gpuInfo = await getGpuInfo();
      res.json(gpuInfo);
    } catch (error) {
      logger.error({ error }, 'Error fetching GPU info');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/memory/estimate
   * Estimate VRAM usage for a model + settings combination
   */
  app.get('/api/memory/estimate', authenticateRequest, async (req, res) => {
    try {
      const { modelId, width: widthStr, height: heightStr } = req.query;
      
      if (!modelId) {
        return res.status(400).json({ error: 'modelId is required' });
      }

      const model = modelManager.getModel(modelId);
      if (!model) {
        return res.status(404).json({ error: `Model not found: ${modelId}` });
      }

      const width = parseInt(widthStr) || 1024;
      const height = parseInt(heightStr) || 1024;

      // Build flags from query params or use model's effective flags
      const effectiveFlags = modelManager.getEffectiveMemoryFlags(modelId);
      const flags = {
        offloadToCpu: req.query.offloadToCpu !== undefined ? req.query.offloadToCpu === '1' : effectiveFlags.offload_to_cpu,
        clipOnCpu: req.query.clipOnCpu !== undefined ? req.query.clipOnCpu === '1' : effectiveFlags.clip_on_cpu,
        vaeOnCpu: req.query.vaeOnCpu !== undefined ? req.query.vaeOnCpu === '1' : effectiveFlags.vae_on_cpu,
        vaeTiling: req.query.vaeTiling !== undefined ? req.query.vaeTiling === '1' : effectiveFlags.vae_tiling,
        diffusionFlashAttn: req.query.diffusionFa !== undefined ? req.query.diffusionFa === '1' : effectiveFlags.diffusion_fa,
      };

      // Get GPU info for VRAM budget
      const gpuInfo = await getGpuInfo();
      const gpuVramMB = gpuInfo.vramTotalMB || null;

      // Calculate memory usage
      const result = calculateMemoryForModel(model, width, height, flags, gpuVramMB);
      
      if (!result) {
        return res.json({
          modelId,
          error: 'Could not determine model architecture for memory estimation',
          gpuVramMB,
        });
      }

      res.json({
        modelId,
        ...result,
        gpuVramMB,
        flags,
      });
    } catch (error) {
      logger.error({ error }, 'Error estimating memory');
      res.status(500).json({ error: error.message });
    }
  });

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
      // Also filter out technical fields (args, exec_mode) and add computed fields
      const modelsWithFileStatus = await Promise.all(
        models.map(async (model) => {
          const fileStatus = await getModelFileStatus(model);
          const { args, exec_mode, ...modelWithoutSensitive } = model;
          return {
            ...modelWithoutSensitive,
            execMode: exec_mode,
            defaultSteps: model.generation_params?.sample_steps || null,
            fileStatus
          };
        })
      );

      const defaultModel = modelManager.getDefaultModel();
      const filteredDefault = defaultModel ? (({ args, exec_mode, ...rest }) => ({
        ...rest,
        execMode: exec_mode,
        defaultSteps: defaultModel.generation_params?.sample_steps || null
      }))(defaultModel) : null;

      res.json({
        models: modelsWithFileStatus,
        default: filteredDefault,
        default_models: modelManager.defaultModels,
        backend_settings: modelManager.backendSettings || {}
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
   * GET /api/models/:id/memory-components
   * Get component list with memory placement for a model
   * NOTE: This route must be defined BEFORE /api/models/:id to avoid "memory-components" being treated as a model ID
   */
  app.get('/api/models/:id/memory-components', authenticateRequest, async (req, res) => {
    try {
      const modelId = req.params.id;
      const model = modelManager.getModel(modelId);

      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }

      // Get effective memory flags for this model
      const effectiveFlags = modelManager.getEffectiveMemoryFlags(modelId);

      // Detect components from model args
      const FILE_FLAGS = {
        '--diffusion-model': 'diffusion-model',
        '--model': 'diffusion-model',
        '-m': 'diffusion-model',
        '--vae': 'vae',
        '--llm': 'llm',
        '--llm_vision': 'llm-vision',
        '--clip_l': 'clip-l',
        '--t5xxl': 't5-xxl',
        '--clip': 'clip',
        '--clip_g': 'clip-g',
        '--clip_vision': 'clip-vision',
        '--qwen2vl': 'qwen2vl',
        '--text_encoder': 'text-encoder',
        '--mmdit': 'mmdit',
      };

      const components = [];
      const args = model.args || [];

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const componentName = FILE_FLAGS[arg];
        if (componentName && i + 1 < args.length) {
          const filePath = args[i + 1];
          
          // Determine placement based on memory flags
          let placement, color;
          
          if (componentName === 'diffusion-model' || componentName === 'mmdit') {
            if (effectiveFlags.offload_to_cpu) {
              placement = 'offload';
              color = 'yellow';
            } else {
              placement = 'gpu';
              color = 'green';
            }
          } else if (componentName === 'vae') {
            if (effectiveFlags.vae_on_cpu) {
              placement = 'cpu';
              color = 'orange';
            } else if (effectiveFlags.offload_to_cpu) {
              placement = 'offload';
              color = 'yellow';
            } else {
              placement = 'gpu';
              color = 'green';
            }
          } else if (['clip-l', 't5-xxl', 'clip', 'clip-g', 'llm', 'qwen2vl', 'text-encoder'].includes(componentName)) {
            if (effectiveFlags.clip_on_cpu) {
              placement = 'cpu';
              color = 'orange';
            } else if (effectiveFlags.offload_to_cpu) {
              placement = 'offload';
              color = 'yellow';
            } else {
              placement = 'gpu';
              color = 'green';
            }
          } else {
            placement = effectiveFlags.offload_to_cpu ? 'offload' : 'gpu';
            color = effectiveFlags.offload_to_cpu ? 'yellow' : 'green';
          }

          components.push({
            name: componentName,
            flag: arg,
            file: filePath,
            placement,
            color,
          });
        }
      }

      res.json({
        modelId,
        components,
        memoryFlags: effectiveFlags,
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching memory components');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/models/:id/memory-flags
   * Set memory flags override for a model (triggers restart if running)
   */
  app.post('/api/models/:id/memory-flags', authenticateRequest, async (req, res) => {
    try {
      const modelId = req.params.id;
      const model = modelManager.getModel(modelId);

      if (!model) {
        return res.status(404).json({ error: 'Model not found' });
      }

      const { offloadToCpu, clipOnCpu, vaeOnCpu, vaeTiling, diffusionFa } = req.body;

      // Build memory_overrides from request body
      const overrides = {};
      if (offloadToCpu !== undefined) overrides.offload_to_cpu = !!offloadToCpu;
      if (clipOnCpu !== undefined) overrides.clip_on_cpu = !!clipOnCpu;
      if (vaeOnCpu !== undefined) overrides.vae_on_cpu = !!vaeOnCpu;
      if (vaeTiling !== undefined) overrides.vae_tiling = !!vaeTiling;
      if (diffusionFa !== undefined) overrides.diffusion_fa = !!diffusionFa;

      // Store overrides on the model config
      model.memory_overrides = { ...(model.memory_overrides || {}), ...overrides };

      // Check if model is currently running - restart will be needed
      const isRunning = modelManager.isModelRunning(modelId);

      res.json({
        success: true,
        modelId,
        memoryFlags: modelManager.getEffectiveMemoryFlags(modelId),
        restartRequired: isRunning,
        message: isRunning
          ? 'Memory flags updated. Model will use new flags on next restart.'
          : 'Memory flags updated. Will apply on next model start.',
      });
    } catch (error) {
      logger.error({ error }, 'Error updating memory flags');
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

    // Filter out sensitive fields
    const { args, exec_mode, ...modelWithoutSensitive } = model;

    res.json({
      id: modelId,
      ...modelWithoutSensitive,
      execMode: exec_mode,
      defaultSteps: model.generation_params?.sample_steps || null,
      fileStatus,
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
      const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

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
}

export default registerModelRoutes;
