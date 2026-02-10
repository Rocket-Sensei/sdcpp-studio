import { getDatabase, getImagesDir } from './database.js';
import { writeFile, unlink } from 'fs/promises';
import { join, basename } from 'path';
import { randomUUID } from 'crypto';
import { createLogger } from '../utils/logger.js';
import { modelManager } from '../services/modelManager.js';
import { generationWaiter } from '../services/generationWaiter.js';

const logger = createLogger('queries');

// Generation status constants (merged from queue)
export const GenerationStatus = {
  PENDING: 'pending',
  MODEL_LOADING: 'model_loading',  // Model is being loaded/prepared
  PROCESSING: 'processing',  // Actively generating image
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Add static_url field to an image object for direct static file serving
 * @param {Object} image - Image object from database
 * @returns {Object} Image object with static_url field
 */
function addStaticUrlToImage(image) {
  if (!image) return image;
  if (image.file_path) {
    // Extract just the filename from the full path
    const filename = basename(image.file_path);
    // Check if it's an input image or generated image
    const isInputImage = image.file_path.includes('/input/');
    const staticPath = isInputImage ? '/static/input' : '/static/images';
    image.static_url = `${staticPath}/${filename}`;
  }
  return image;
}

/**
 * Create a new generation (can be queued or direct)
 * This replaces both createGeneration and addToQueue
 */
export async function createGeneration(data) {
  const db = getDatabase();

  // Use default model if not provided
  if (!data.model) {
    const jobType = data.type || 'generate';
    const defaultModel = modelManager.getDefaultModelForType(jobType);
    if (defaultModel) {
      data.model = defaultModel.id;
      logger.debug({ jobType, defaultModel: data.model }, 'Using default model for generation');
    } else {
      throw new Error('No model specified and no default model configured. Please specify a model ID or configure a default model.');
    }
  }

  // Generate a random seed if not provided (ensures every generation has a seed)
  const seed = data.seed !== undefined && data.seed !== null && data.seed !== ''
    ? data.seed
    : Math.floor(Math.random() * 4294967295);

  const stmt = db.prepare(`
    INSERT INTO generations (
      id, type, model, prompt, negative_prompt, size, seed, n,
      quality, style, response_format, user_id, source_image_id,
      status, progress, error,
      input_image_path, input_image_mime_type,
      mask_image_path, mask_image_mime_type,
      strength, sample_steps, cfg_scale, sampling_method, clip_skip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.id,
    data.type,
    data.model,
    data.prompt || null,
    data.negative_prompt || null,
    data.size || null,
    seed,
    data.n || 1,
    data.quality || null,
    data.style || null,
    data.response_format || 'b64_json',
    data.user_id || null,
    data.source_image_id || null,
    data.status || GenerationStatus.PENDING,
    data.progress || 0,
    data.error || null,
    data.input_image_path || null,
    data.input_image_mime_type || null,
    data.mask_image_path || null,
    data.mask_image_mime_type || null,
    // Strength defaults to 0.75 for img2img (variation) mode if not provided
    data.strength !== undefined ? data.strength : null,
    data.sample_steps || null,
    data.cfg_scale || null,
    data.sampling_method || null,
    data.clip_skip || null
  );
}

export async function createGeneratedImage(data) {
  const db = getDatabase();
  const imagesDir = getImagesDir();

  // Save image file to disk
  const filename = `${data.id}.png`;
  const filePath = join(imagesDir, filename);
  await writeFile(filePath, data.image_data);

  const stmt = db.prepare(`
    INSERT INTO generated_images (
      id, generation_id, index_in_batch, file_path, mime_type,
      width, height, revised_prompt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.id,
    data.generation_id,
    data.index_in_batch || 0,
    filePath,
    data.mime_type || 'image/png',
    data.width || null,
    data.height || null,
    data.revised_prompt || null
  );
}

export function getAllGenerations(options = {}) {
  const { limit, offset } = options;
  const db = getDatabase();

  // Get generations with first image info
  let query = `
    SELECT
      g.*,
      COUNT(gi.id) as image_count,
      (
        SELECT GROUP_CONCAT(id, '|')
        FROM generated_images
        WHERE generation_id = g.id
        ORDER BY index_in_batch
      ) as image_ids,
      (
        SELECT GROUP_CONCAT(file_path, '|')
        FROM generated_images
        WHERE generation_id = g.id
        ORDER BY index_in_batch
      ) as image_paths
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `;

  if (limit) {
    query += ` LIMIT ${parseInt(limit)}`;
  }
  if (offset) {
    query += ` OFFSET ${parseInt(offset)}`;
  }

  const stmt = db.prepare(query);
  const generations = stmt.all();

  // Add first_image_url to each generation
  return generations.map(gen => {
    if (gen.image_ids && gen.image_paths) {
      const ids = gen.image_ids.split('|');
      const paths = gen.image_paths.split('|');
      if (ids.length > 0 && paths.length > 0) {
        const firstImagePath = paths[0];
        const filename = basename(firstImagePath);
        const isInputImage = firstImagePath.includes('/input/');
        const staticPath = isInputImage ? '/static/input' : '/static/images';
        gen.first_image_id = ids[0];
        gen.first_image_url = `${staticPath}/${filename}`;
      }
    }
    delete gen.image_ids;
    delete gen.image_paths;
    return gen;
  });
}

/**
 * Get total count of generations
 */
export function getGenerationsCount() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM generations');
  return stmt.get().count;
}

export function getGenerationById(id) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      g.*,
      COUNT(gi.id) as image_count
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    WHERE g.id = ?
    GROUP BY g.id
  `);
  const generation = stmt.get(id);
  if (!generation) return null;

  // Get images for this generation
  const imagesStmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch');
  generation.images = imagesStmt.all(id);

  return generation;
}

export function getImageById(id) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE id = ?');
  const image = stmt.get(id);
  return addStaticUrlToImage(image);
}

export function getImagesByGenerationId(generationId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch');
  const images = stmt.all(generationId);
  return images.map(addStaticUrlToImage);
}

export function getFirstImageForGeneration(generationId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch LIMIT 1');
  const image = stmt.get(generationId);
  return addStaticUrlToImage(image);
}

export function getGenerationsByType(type, limit = 50) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      g.*,
      COUNT(gi.id) as image_count
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    WHERE g.type = ?
    GROUP BY g.id
    ORDER BY g.created_at DESC
    LIMIT ?
  `);
  return stmt.all(type, limit);
}

// ========== Queue-related functions (now using generations table) ==========

/**
 * Get the next pending generation for processing
 */
export function getNextPendingGeneration() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM generations
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT 1
  `);
  return stmt.get(GenerationStatus.PENDING);
}

/**
 * Atomically get and mark the next pending generation as PROCESSING.
 * This prevents race conditions where multiple queue processors might try to process the same job.
 * Uses UPDATE with RETURNING to atomically find and claim a job in one operation.
 * @returns {Object|null} The claimed generation, or null if no pending jobs exist
 */
export function claimNextPendingGeneration() {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE generations
    SET status = ?
    WHERE id = (
      SELECT id FROM generations
      WHERE status = ?
      ORDER BY created_at ASC
      LIMIT 1
    )
    RETURNING *
  `);
  return stmt.get(GenerationStatus.PROCESSING, GenerationStatus.PENDING);
}

/**
 * Update generation status and related fields
 */
export function updateGenerationStatus(id, status, additionalData = {}) {
  const db = getDatabase();
  const now = Date.now();

  let query = 'UPDATE generations SET status = ?, updated_at = ?';
  const params = [status, now];

  if (status === GenerationStatus.PROCESSING && !additionalData.started_at) {
    query += ', started_at = ?';
    params.push(now);
  } else if (status === GenerationStatus.COMPLETED || status === GenerationStatus.FAILED) {
    query += ', completed_at = ?';
    params.push(now);
  }

  if (additionalData.progress !== undefined) {
    query += ', progress = ?';
    params.push(additionalData.progress);
  }

  if (additionalData.error !== undefined) {
    query += ', error = ?';
    params.push(additionalData.error);
  }

  if (additionalData.model_loading_time_ms !== undefined) {
    query += ', model_loading_time_ms = ?';
    params.push(additionalData.model_loading_time_ms);
  }

  if (additionalData.generation_time_ms !== undefined) {
    query += ', generation_time_ms = ?';
    params.push(additionalData.generation_time_ms);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);

  const updatedGeneration = getGenerationById(id);

  // Notify waiters of terminal states
  if (status === GenerationStatus.COMPLETED) {
    generationWaiter.notifyCompleted(id, updatedGeneration);
  } else if (status === GenerationStatus.FAILED) {
    generationWaiter.notifyFailed(id, updatedGeneration);
  } else if (status === GenerationStatus.CANCELLED) {
    generationWaiter.notifyCancelled(id, updatedGeneration);
  }

  return updatedGeneration;
}

/**
 * Update generation progress
 */
export function updateGenerationProgress(id, progress) {
  return updateGenerationStatus(id, GenerationStatus.PROCESSING, { progress });
}

/**
 * Cancel a generation (only if pending or processing)
 */
export function cancelGeneration(id) {
  const db = getDatabase();
  const generation = getGenerationById(id);

  if (!generation) {
    return null;
  }

  // Only allow cancelling pending or processing jobs
  if (generation.status !== GenerationStatus.PENDING && generation.status !== GenerationStatus.PROCESSING) {
    return null;
  }

  return updateGenerationStatus(id, GenerationStatus.CANCELLED);
}

/**
 * Delete a generation (for cleanup or after cancel)
 */
export function deleteGeneration(id) {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM generations WHERE id = ?');
  return stmt.run(id);
}

/**
 * Delete all generated images for a generation
 */
export async function deleteGeneratedImagesByGenerationId(generationId) {
  const db = getDatabase();
  const images = getImagesByGenerationId(generationId);

  // Delete image files from disk
  for (const image of images) {
    try {
      await unlink(image.file_path);
    } catch (e) {
      logger.warn({ error: e, filePath: image.file_path }, 'Failed to delete image file');
    }
  }

  // Delete from database
  const stmt = db.prepare('DELETE FROM generated_images WHERE generation_id = ?');
  return stmt.run(generationId);
}

/**
 * Get generation statistics (replaces getQueueStats)
 */
export function getGenerationStats() {
  const db = getDatabase();

  const pendingStmt = db.prepare(`SELECT COUNT(*) as count FROM generations WHERE status = ?`);
  const processingStmt = db.prepare(`SELECT COUNT(*) as count FROM generations WHERE status = ?`);
  const completedStmt = db.prepare(`SELECT COUNT(*) as count FROM generations WHERE status = ?`);
  const failedStmt = db.prepare(`SELECT COUNT(*) as count FROM generations WHERE status = ?`);

  return {
    pending: pendingStmt.get(GenerationStatus.PENDING).count,
    processing: processingStmt.get(GenerationStatus.PROCESSING).count,
    completed: completedStmt.get(GenerationStatus.COMPLETED).count,
    failed: failedStmt.get(GenerationStatus.FAILED).count,
  };
}

/**
 * Clear old completed/failed generations
 */
export function clearOldGenerations(olderThanMs = 24 * 60 * 60 * 1000) { // 24 hours default
  const db = getDatabase();
  const cutoff = Date.now() - olderThanMs;

  const stmt = db.prepare(`
    DELETE FROM generations
    WHERE status IN ('completed', 'failed', 'cancelled')
    AND completed_at < ?
  `);

  return stmt.run(cutoff);
}

/**
 * Get generations by status (for queue processor)
 */
export function getGenerationsByStatus(status, limit = 50) {
  const db = getDatabase();

  const stmt = db.prepare(`
    SELECT * FROM generations
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT ?
  `);
  return stmt.all(status, limit);
}

/**
 * Delete all generations (with optional file deletion)
 * @param {boolean} deleteFiles - If true, also delete image files from disk
 * @returns {Promise<{count: number, filesDeleted: number}>}
 */
export async function deleteAllGenerations(deleteFiles = false) {
  const db = getDatabase();
  const imagesDir = getImagesDir();

  let filesDeleted = 0;

  // If deleteFiles is true, delete all image files from disk
  if (deleteFiles) {
    const stmt = db.prepare('SELECT file_path FROM generated_images');
    const images = stmt.all();

    for (const image of images) {
      try {
        await unlink(image.file_path);
        filesDeleted++;
      } catch (e) {
        logger.warn({ error: e, filePath: image.file_path }, 'Failed to delete image file');
      }
    }
  }

  // Delete all generations (cascade will handle generated_images)
  const stmt = db.prepare('DELETE FROM generations');
  const result = stmt.run();

  return {
    count: result.changes,
    filesDeleted
  };
}

/**
 * Cancel all pending and processing generations
 * @returns {number} Number of generations cancelled
 */
export function cancelAllGenerations() {
  const db = getDatabase();

  const stmt = db.prepare(`
    UPDATE generations
    SET status = ?,
        completed_at = ?,
        updated_at = ?
    WHERE status IN (?, ?)
  `);

  const now = Date.now();
  const result = stmt.run(GenerationStatus.CANCELLED, now, now, GenerationStatus.PENDING, GenerationStatus.PROCESSING);

  return result.changes;
}

/**
 * Fail all old queued/processing generations on server startup
 * This is called when the server starts to clean up any stale jobs
 */
export function failOldQueuedGenerations() {
  const db = getDatabase();
  const now = Date.now();

  const stmt = db.prepare(`
    UPDATE generations
    SET status = ?,
        completed_at = ?,
        updated_at = ?,
        error = 'Server restarted - job cancelled'
    WHERE status IN (?, ?)
  `);

  const result = stmt.run(GenerationStatus.FAILED, now, now, GenerationStatus.PENDING, GenerationStatus.PROCESSING);

  if (result.changes > 0) {
    logger.info({
      failed: result.changes,
      pending: GenerationStatus.PENDING,
      processing: GenerationStatus.PROCESSING
    }, `Failed old queued/processing generations on startup`);
  }

  return result;
}
