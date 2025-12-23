import { getDatabase } from './database.js';
import { randomUUID } from 'crypto';

// Queue status constants
export const QueueStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Add a job to the queue
 * @param {Object} params - Job parameters
 * @param {string} params.model - Model ID (uses DEFAULT from DB if not specified)
 * @param {string} params.input_image_path - Path to uploaded input image (for edit/variation)
 * @param {string} params.input_image_mime_type - MIME type of input image
 * @param {string} params.mask_image_path - Path to uploaded mask image (optional)
 * @param {string} params.mask_image_mime_type - MIME type of mask image
 */
export function addToQueue(params) {
  const db = getDatabase();
  const id = params.id || randomUUID();

  // Build the SQL dynamically based on which parameters are provided
  const columns = ['id', 'type', 'status'];
  const placeholders = ['?', '?', '?'];
  const values = [id, params.type || 'generate', QueueStatus.PENDING];

  // Add model if provided (otherwise uses DB default)
  if (params.model !== undefined && params.model !== null) {
    columns.push('model');
    placeholders.push('?');
    values.push(params.model);
  }

  // Add standard params if provided
  if (params.prompt !== undefined) {
    columns.push('prompt');
    placeholders.push('?');
    values.push(params.prompt);
  }
  if (params.negative_prompt !== undefined) {
    columns.push('negative_prompt');
    placeholders.push('?');
    values.push(params.negative_prompt);
  }
  if (params.size !== undefined) {
    columns.push('size');
    placeholders.push('?');
    values.push(params.size);
  }
  if (params.seed !== undefined) {
    columns.push('seed');
    placeholders.push('?');
    values.push(params.seed);
  }
  if (params.n !== undefined) {
    columns.push('n');
    placeholders.push('?');
    values.push(params.n);
  }
  if (params.quality !== undefined) {
    columns.push('quality');
    placeholders.push('?');
    values.push(params.quality);
  }
  if (params.style !== undefined) {
    columns.push('style');
    placeholders.push('?');
    values.push(params.style);
  }
  if (params.source_image_id !== undefined) {
    columns.push('source_image_id');
    placeholders.push('?');
    values.push(params.source_image_id);
  }

  // Add image paths for edit/variation
  if (params.input_image_path) {
    columns.push('input_image_path');
    placeholders.push('?');
    values.push(params.input_image_path);
  }
  if (params.input_image_mime_type) {
    columns.push('input_image_mime_type');
    placeholders.push('?');
    values.push(params.input_image_mime_type);
  }
  if (params.mask_image_path) {
    columns.push('mask_image_path');
    placeholders.push('?');
    values.push(params.mask_image_path);
  }
  if (params.mask_image_mime_type) {
    columns.push('mask_image_mime_type');
    placeholders.push('?');
    values.push(params.mask_image_mime_type);
  }

  const sql = `INSERT INTO queue (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
  const stmt = db.prepare(sql);
  stmt.run(...values);

  return getJobById(id);
}

/**
 * Get a job by ID
 */
export function getJobById(id) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM queue WHERE id = ?');
  return stmt.get(id);
}

/**
 * Get all jobs, optionally filtered by status
 */
export function getJobs(status = null, limit = 50) {
  const db = getDatabase();

  if (status) {
    const stmt = db.prepare(`
      SELECT * FROM queue
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    return stmt.all(status, limit);
  }

  const stmt = db.prepare(`
    SELECT * FROM queue
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}

/**
 * Get the next pending job
 */
export function getNextPendingJob() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM queue
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT 1
  `);
  return stmt.get(QueueStatus.PENDING);
}

/**
 * Update job status
 */
export function updateJobStatus(id, status, additionalData = {}) {
  const db = getDatabase();
  const now = Date.now();

  let query = 'UPDATE queue SET status = ?, updated_at = ?';
  const params = [status, now];

  if (status === QueueStatus.PROCESSING && !additionalData.started_at) {
    query += ', started_at = ?';
    params.push(now);
  } else if (status === QueueStatus.COMPLETED || status === QueueStatus.FAILED) {
    query += ', completed_at = ?';
    params.push(now);
  }

  if (additionalData.progress !== undefined) {
    query += ', progress = ?';
    params.push(additionalData.progress);
  }

  if (additionalData.error) {
    query += ', error = ?';
    params.push(additionalData.error);
  }

  if (additionalData.generation_id) {
    query += ', generation_id = ?';
    params.push(additionalData.generation_id);
  }

  query += ' WHERE id = ?';
  params.push(id);

  const stmt = db.prepare(query);
  stmt.run(...params);

  return getJobById(id);
}

/**
 * Update job progress
 */
export function updateJobProgress(id, progress) {
  return updateJobStatus(id, QueueStatus.PROCESSING, { progress });
}

/**
 * Delete a job from the queue
 */
export function deleteJob(id) {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM queue WHERE id = ?');
  return stmt.run(id);
}

/**
 * Clear old completed/failed jobs
 */
export function clearOldJobs(olderThanMs = 24 * 60 * 60 * 1000) { // 24 hours default
  const db = getDatabase();
  const cutoff = Date.now() - olderThanMs;

  const stmt = db.prepare(`
    DELETE FROM queue
    WHERE status IN ('completed', 'failed')
    AND completed_at < ?
  `);

  return stmt.run(cutoff);
}

/**
 * Cancel a job
 */
export function cancelJob(id) {
  const db = getDatabase();
  const job = getJobById(id);

  if (!job) {
    return null;
  }

  // Only allow cancelling pending or processing jobs
  if (job.status !== QueueStatus.PENDING && job.status !== QueueStatus.PROCESSING) {
    return null;
  }

  return updateJobStatus(id, QueueStatus.CANCELLED);
}

/**
 * Get queue statistics
 */
export function getQueueStats() {
  const db = getDatabase();

  const pendingStmt = db.prepare(`SELECT COUNT(*) as count FROM queue WHERE status = ?`);
  const processingStmt = db.prepare(`SELECT COUNT(*) as count FROM queue WHERE status = ?`);
  const completedStmt = db.prepare(`SELECT COUNT(*) as count FROM queue WHERE status = ?`);
  const failedStmt = db.prepare(`SELECT COUNT(*) as count FROM queue WHERE status = ?`);

  return {
    pending: pendingStmt.get(QueueStatus.PENDING).count,
    processing: processingStmt.get(QueueStatus.PROCESSING).count,
    completed: completedStmt.get(QueueStatus.COMPLETED).count,
    failed: failedStmt.get(QueueStatus.FAILED).count,
  };
}
