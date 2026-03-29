/**
 * Migration: Add generation details columns
 * Version: 006
 */

export const description = 'Add generation details columns for modal display';

export function up(db) {
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
    db.exec(`ALTER TABLE generations ADD COLUMN ${col.name} ${col.sql}`);
  }
}

export function down(db) {
  // SQLite has limited ALTER TABLE support for dropping columns
  // We would need to recreate the table without these columns
  // Note: We don't remove the columns since SQLite doesn't support DROP COLUMN
  // The columns will remain but be ignored
}
