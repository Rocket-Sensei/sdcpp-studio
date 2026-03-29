/**
 * Migration: Add generation details columns
 * Version: 006
 */

import { createLogger } from '../../utils/logger.js';

export const description = 'Add generation details columns for modal display';

const logger = createLogger('migration:006');

export function up(db) {
  logger.info('Running migration 006: add generation detail columns');

  const existingColumns = db.prepare('PRAGMA table_info(generations)').all();
  const existingColumnNames = new Set(existingColumns.map((column) => column.name));

  const columnsToAdd = [
    { name: 'upscale_enable', sql: 'INTEGER DEFAULT 0' },
    { name: 'vae_on_cpu', sql: 'INTEGER DEFAULT 0' },
    { name: 'offload_to_cpu', sql: 'INTEGER DEFAULT 0' },
    { name: 'clip_on_cpu', sql: 'INTEGER DEFAULT 0' },
    { name: 'vae_tiling', sql: 'INTEGER DEFAULT 0' },
    { name: 'diffusion_fa', sql: 'INTEGER DEFAULT 0' },
    { name: 'binary_version', sql: 'TEXT' },
  ];

  for (const col of columnsToAdd) {
    if (!existingColumnNames.has(col.name)) {
      db.exec(`ALTER TABLE generations ADD COLUMN ${col.name} ${col.sql}`);
      logger.info({ column: col.name }, 'Added generation detail column');
      existingColumnNames.add(col.name);
    } else {
      logger.info({ column: col.name }, 'Generation detail column already exists, skipping');
    }
  }
}

export function down(db) {
  // SQLite has limited ALTER TABLE support for dropping columns
  // We would need to recreate the table without these columns
  // Note: We don't remove the columns since SQLite doesn't support DROP COLUMN
  // The columns will remain but be ignored
  logger.warn('Rollback for migration 006 is not supported without table recreation');
}
