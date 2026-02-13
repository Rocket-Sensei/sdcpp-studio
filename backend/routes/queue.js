import { randomUUID } from 'crypto';
import { writeFile } from 'fs/promises';
import path from 'path';
import { createLogger } from '../utils/logger.js';
import {
  createGeneration,
  getGenerationById,
  getAllGenerations,
  getGenerationStats,
  cancelGeneration,
  cancelAllGenerations,
  GenerationStatus
} from '../db/queries.js';
import { ensurePngFormat } from '../utils/imageUtils.js';
import { getInputImagesDir } from '../db/database.js';
import { authenticateRequest } from '../middleware/auth.js';

const logger = createLogger('routes:queue');

/**
 * Queue management routes
 * These endpoints provide a job queue interface for image generation
 */

export function registerQueueRoutes(app, upload) {
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

  // Add job to queue (upscale)
  app.post('/api/queue/upscale', authenticateRequest, upload.single('image'), async (req, res) => {
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
      const resizeMode = parseInt(req.body.resize_mode) || 0;
      const params = {
        id,
        type: 'upscale',
        status: GenerationStatus.PENDING,
        input_image_path: imagePath,
        input_image_mime_type: 'image/png',
        // Upscaler settings
        upscaler: req.body.upscaler || 'RealESRGAN 4x+',
        resize_mode: resizeMode,
        upscale_factor: parseFloat(req.body.upscale_factor) || 2.0,
        // Target dimensions (for resize_mode = 1)
        target_width: resizeMode === 1 ? parseInt(req.body.target_width) || 1024 : null,
        target_height: resizeMode === 1 ? parseInt(req.body.target_height) || 1024 : null,
      };

      await createGeneration(params);
      res.json({ job_id: id, status: GenerationStatus.PENDING });
    } catch (error) {
      logger.error({ error }, 'Error adding upscale to queue');
      res.status(500).json({ error: error.message });
    }
  });

  // Get all jobs in queue (authenticated)
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

  // Get queue statistics (must be before /:id route) (authenticated)
  app.get('/api/queue/stats', authenticateRequest, async (req, res) => {
    try {
      const stats = getGenerationStats();
      res.json(stats);
    } catch (error) {
      logger.error({ error }, 'Error fetching queue stats');
      res.status(500).json({ error: error.message });
    }
  });

  // Get single job (authenticated)
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
}

export default registerQueueRoutes;
