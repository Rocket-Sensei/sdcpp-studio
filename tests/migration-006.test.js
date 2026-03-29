import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { up } from '../backend/db/migrations/006_add_generation_details_columns.js';

function getGenerationColumnNames(db) {
  const columns = db.prepare('PRAGMA table_info(generations)').all();
  return columns.map((column) => column.name);
}

describe('migration 006 add generation detail columns', () => {
  it('adds missing columns and is idempotent', () => {
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE generations (
        id TEXT PRIMARY KEY,
        prompt TEXT,
        upscale_enable INTEGER DEFAULT 0
      )
    `);

    up(db);

    let columns = getGenerationColumnNames(db);
    expect(columns).toContain('upscale_enable');
    expect(columns).toContain('vae_on_cpu');
    expect(columns).toContain('offload_to_cpu');
    expect(columns).toContain('clip_on_cpu');
    expect(columns).toContain('vae_tiling');
    expect(columns).toContain('diffusion_fa');
    expect(columns).toContain('binary_version');

    up(db);

    columns = getGenerationColumnNames(db);
    expect(columns.filter((name) => name === 'clip_on_cpu')).toHaveLength(1);
    expect(columns.filter((name) => name === 'upscale_enable')).toHaveLength(1);
  });
});
