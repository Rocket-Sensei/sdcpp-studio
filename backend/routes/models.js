import { createLogger } from '../utils/logger.js';
import { modelManager } from '../services/modelManager.js';
import { processTracker } from '../services/processTracker.js';
import { modelDownloader } from '../services/modelDownloader.js';
import { getModelFileStatus, findModelIdByName } from '../utils/modelHelpers.js';
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
