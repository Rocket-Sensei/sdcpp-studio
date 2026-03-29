/**
 * Migration: Add image columns to queue table
 * Version: 001
 *
 * Adds support for storing uploaded images for edit/variation jobs.
 * Images are saved to disk and the path is stored in the database.
 */

import { createLogger } from '../../utils/logger.js';

export const description = 'add_image_columns_to_queue_table';

const logger = createLogger('migration:001');

export function up(db) {
  // Get existing columns
  const existingColumns = db.prepare("PRAGMA table_info(queue)").all();
  const columnNames = existingColumns.map(c => c.name);

  // Add columns only if they don't exist
  if (!columnNames.includes('input_image_path')) {
    db.exec(`ALTER TABLE queue ADD COLUMN input_image_path TEXT;`);
    logger.info('Added input_image_path column');
  } else {
    logger.info('Column input_image_path already exists, skipping');
  }

  if (!columnNames.includes('input_image_mime_type')) {
    db.exec(`ALTER TABLE queue ADD COLUMN input_image_mime_type TEXT;`);
    logger.info('Added input_image_mime_type column');
  } else {
    logger.info('Column input_image_mime_type already exists, skipping');
  }

  if (!columnNames.includes('mask_image_path')) {
    db.exec(`ALTER TABLE queue ADD COLUMN mask_image_path TEXT;`);
    logger.info('Added mask_image_path column');
  } else {
    logger.info('Column mask_image_path already exists, skipping');
  }

  if (!columnNames.includes('mask_image_mime_type')) {
    db.exec(`ALTER TABLE queue ADD COLUMN mask_image_mime_type TEXT;`);
    logger.info('Added mask_image_mime_type column');
  } else {
    logger.info('Column mask_image_mime_type already exists, skipping');
  }
}

export function down(db) {
  // SQLite doesn't support DROP COLUMN directly
  // To rollback, you would need to:
  // 1. Create a new table without the columns
  // 2. Copy data from old table to new table
  // 3. Drop old table
  // 4. Rename new table to old table

  // For now, we'll just note that rollback requires recreating the table
  logger.warn('Rollback not supported - requires table recreation');
}
