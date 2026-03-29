/**
 * Migration: Add strength column to generations table
 * Version: 003
 *
 * Adds the strength parameter for img2img (variation) mode.
 * Strength controls how much the original image is preserved during variation.
 * - 0.0 = mostly noise (very different from original)
 * - 1.0 = mostly original (very similar to original)
 * - Default: 0.75 (balanced variation)
 */

import { createLogger } from '../../utils/logger.js';

export const description = 'add_strength_column';

const logger = createLogger('migration:003');

export function up(db) {
  logger.info('Starting migration: add strength column to generations');

  // Check if column already exists
  const existingColumns = db.prepare("PRAGMA table_info(generations)").all();
  const columnNames = existingColumns.map(c => c.name);

  if (!columnNames.includes('strength')) {
    db.exec(`ALTER TABLE generations ADD COLUMN strength REAL DEFAULT 0.75;`);
    logger.info('Added strength column to generations table (default: 0.75)');
  } else {
    logger.info('Column strength already exists in generations, skipping');
  }

  logger.info('Migration complete: strength column added');
}

export function down(db) {
  // Rollback: Remove strength column
  // Note: SQLite doesn't support DROP COLUMN directly, need to recreate table
  logger.info('Rolling back: remove strength column');

  // Check if column exists
  const existingColumns = db.prepare("PRAGMA table_info(generations)").all();
  const columnNames = existingColumns.map(c => c.name);

  if (!columnNames.includes('strength')) {
    logger.info('Column strength does not exist, skipping rollback');
    return;
  }

  // SQLite doesn't support ALTER TABLE DROP COLUMN
  // Need to recreate table without the column
  db.exec(`
    CREATE TABLE generations_backup (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT,
      negative_prompt TEXT,
      size TEXT,
      seed TEXT,
      n INTEGER DEFAULT 1,
      quality TEXT,
      style TEXT,
      response_format TEXT DEFAULT 'b64_json',
      user_id TEXT,
      source_image_id TEXT,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      error TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      started_at INTEGER,
      completed_at INTEGER,
      input_image_path TEXT,
      input_image_mime_type TEXT,
      mask_image_path TEXT,
      mask_image_mime_type TEXT
    )
  `);

  // Copy data (excluding strength column)
  db.exec(`
    INSERT INTO generations_backup (
      id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
      response_format, user_id, source_image_id, status, progress, error,
      created_at, updated_at, started_at, completed_at,
      input_image_path, input_image_mime_type, mask_image_path, mask_image_mime_type
    )
    SELECT
      id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
      response_format, user_id, source_image_id, status, progress, error,
      created_at, updated_at, started_at, completed_at,
      input_image_path, input_image_mime_type, mask_image_path, mask_image_mime_type
    FROM generations
  `);

  // Drop old table and rename backup
  db.exec(`DROP TABLE generations;`);
  db.exec(`ALTER TABLE generations_backup RENAME TO generations;`);

  // Recreate indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
  `);

  logger.info('Rollback complete: strength column removed');
}
