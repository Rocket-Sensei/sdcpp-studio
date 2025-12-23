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
 */
export function addToQueue(params) {
  const db = getDatabase();
  const id = params.id || randomUUID();

  // Note: model is NOT NULL with DEFAULT 'sd-cpp-local' in the DB schema
  // If params.model is provided and non-null, we need to include it
  // If params.model is null/undefined, the DB will use the DEFAULT value
  // So we need dynamic SQL building

  let sql, queryParams;
  if (params.model !== undefined && params.model !== null) {
    sql = `
      INSERT INTO queue (
        id, type, model, prompt, negative_prompt, size, seed, n,
        quality, style, source_image_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    queryParams = [
      id,
      params.type || 'generate',
      params.model,
      params.prompt || null,
      params.negative_prompt || null,
      params.size || null,
      params.seed || null,
      params.n || 1,
      params.quality || null,
      params.style || null,
      params.source_image_id || null,
      QueueStatus.PENDING
    ];
  } else {
    sql = `
      INSERT INTO queue (
        id, type, prompt, negative_prompt, size, seed, n,
        quality, style, source_image_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    queryParams = [
      id,
      params.type || 'generate',
      params.prompt || null,
      params.negative_prompt || null,
      params.size || null,
      params.seed || null,
      params.n || 1,
      params.quality || null,
      params.style || null,
      params.source_image_id || null,
      QueueStatus.PENDING
    ];
  }

  const dynamicStmt = db.prepare(sql);
  dynamicStmt.run(...queryParams);

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
