import { getDatabase, getImagesDir } from './database.js';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// Generation status constants (merged from queue)
export const GenerationStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Create a new generation (can be queued or direct)
 * This replaces both createGeneration and addToQueue
 */
export async function createGeneration(data) {
  const db = getDatabase();

  // Model is required - use default from modelManager if not provided
  if (!data.model) {
    throw new Error('Model is required for generation. Please specify a model ID.');
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
      mask_image_path, mask_image_mime_type
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    data.mask_image_mime_type || null
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

export function getAllGenerations() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      g.*,
      COUNT(gi.id) as image_count
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `);
  return stmt.all();
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
  return stmt.get(id);
}

export function getImagesByGenerationId(generationId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch');
  return stmt.all(generationId);
}

export function getFirstImageForGeneration(generationId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch LIMIT 1');
  return stmt.get(generationId);
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

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);

  return getGenerationById(id);
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
      console.error(`Failed to delete image file: ${image.file_path}`, e);
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
