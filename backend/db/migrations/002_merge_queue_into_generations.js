/**
 * Migration: Merge queue into generations table
 * Version: 002
 *
 * Merges the queue table into the generations table to create a unified view
 * of all generation requests (queued, processing, completed, failed).
 * After this migration, generations will have:
 * - status: pending, processing, completed, failed, cancelled
 * - progress: 0.0 to 1.0
 * - error: error message if failed
 * - started_at, completed_at: timestamps
 * - input_image_path, input_image_mime_type: for edit/variation
 * - mask_image_path, mask_image_mime_type: for edit with mask
 */

import { createLogger } from '../../utils/logger.js';

export const description = 'merge_queue_into_generations';

const logger = createLogger('migration:002');

export function up(db) {
  logger.info('Starting migration: merge queue into generations');

  // Step 1: Add new columns to generations table
  const existingColumns = db.prepare("PRAGMA table_info(generations)").all();
  const columnNames = existingColumns.map(c => c.name);

  const columnsToAdd = [
    'status TEXT DEFAULT \'pending\'',
    'progress REAL DEFAULT 0',
    'error TEXT',
    'started_at INTEGER',
    'completed_at INTEGER',
    'input_image_path TEXT',
    'input_image_mime_type TEXT',
    'mask_image_path TEXT',
    'mask_image_mime_type TEXT'
  ];

  for (const columnDef of columnsToAdd) {
    const colName = columnDef.split(' ')[0];
    if (!columnNames.includes(colName)) {
      db.exec(`ALTER TABLE generations ADD COLUMN ${columnDef};`);
      logger.info({ column: colName }, 'Added column to generations');
    } else {
      logger.info({ column: colName }, 'Column already exists in generations, skipping');
    }
  }

  // Step 2: Migrate queue data to generations
  // For queue items that have a generation_id, update that generation with queue status
  // For queue items without generation_id (pending/processing), create new generation records

  const queueItems = db.prepare(`
    SELECT * FROM queue
    ORDER BY created_at DESC
  `).all();

  logger.info({ count: queueItems.length }, 'Found queue items to migrate');

  for (const item of queueItems) {
    if (item.generation_id) {
      // Queue item has an associated generation - update it with status
      db.prepare(`
        UPDATE generations
        SET status = ?,
            progress = ?,
            error = ?,
            started_at = ?,
            completed_at = ?
        WHERE id = ?
      `).run(
        item.status,
        item.progress || 0,
        item.error || null,
        item.started_at || null,
        item.completed_at || null,
        item.generation_id
      );
      logger.info({ generationId: item.generation_id, status: item.status }, 'Updated generation from queue item');
    } else {
      // Queue item without generation - create new generation record
      // This preserves pending/processing jobs in the generations table
      db.prepare(`
        INSERT INTO generations (
          id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
          source_image_id, response_format, user_id,
          status, progress, error,
          input_image_path, input_image_mime_type,
          mask_image_path, mask_image_mime_type,
          created_at, updated_at, started_at, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id,
        item.type,
        item.model,
        item.prompt,
        item.negative_prompt,
        item.size,
        item.seed,
        item.n,
        item.quality,
        item.style,
        item.source_image_id,
        'b64_json',
        null,
        item.status,
        item.progress || 0,
        item.error || null,
        item.input_image_path || null,
        item.input_image_mime_type || null,
        item.mask_image_path || null,
        item.mask_image_mime_type || null,
        item.created_at,
        item.updated_at,
        item.started_at || null,
        item.completed_at || null
      );
      logger.info({ queueId: item.id, status: item.status }, 'Migrated queue item as generation');
    }
  }

  // Step 3: Drop the queue table (data is now in generations)
  db.exec(`DROP TABLE IF EXISTS queue;`);
  logger.info('Dropped queue table');

  logger.info('Migration complete: queue merged into generations');
}

export function down(db) {
  // Rollback: Recreate queue table and move data back
  logger.info('Rolling back: split generations back into queue and generations');

  // Recreate queue table
  db.exec(`
    CREATE TABLE IF NOT EXISTS queue (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'sd-cpp-local',
      prompt TEXT,
      negative_prompt TEXT,
      size TEXT,
      seed TEXT,
      n INTEGER DEFAULT 1,
      quality TEXT,
      style TEXT,
      source_image_id TEXT,
      input_image_path TEXT,
      input_image_mime_type TEXT,
      mask_image_path TEXT,
      mask_image_mime_type TEXT,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      error TEXT,
      generation_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE SET NULL
    )
  `);

  // Move non-completed generations back to queue
  db.prepare(`
    INSERT INTO queue (
      id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
      source_image_id, input_image_path, input_image_mime_type,
      mask_image_path, mask_image_mime_type,
      status, progress, error,
      created_at, updated_at, started_at, completed_at
    )
    SELECT
      id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
      source_image_id, input_image_path, input_image_mime_type,
      mask_image_path, mask_image_mime_type,
      status, progress, error,
      created_at, updated_at, started_at, completed_at
    FROM generations
    WHERE status IN ('pending', 'processing', 'failed', 'cancelled')
  `).run();

  // Remove queue-specific columns from completed generations
  // We'll keep the columns but clear them for completed items
  db.prepare(`
    UPDATE generations
    SET status = NULL,
        progress = NULL,
        error = NULL,
        started_at = NULL,
        completed_at = NULL,
        input_image_path = NULL,
        input_image_mime_type = NULL,
        mask_image_path = NULL,
        mask_image_mime_type = NULL
    WHERE status = 'completed'
  `).run();

  logger.info('Rollback complete');
}
