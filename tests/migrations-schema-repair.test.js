import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { ensureGenerationsSchema } from '../backend/db/migrations.js';

function getColumns(db) {
  return db.prepare('PRAGMA table_info(generations)').all().map((column) => column.name);
}

describe('ensureGenerationsSchema', () => {
  it('adds missing columns for partially migrated generations tables', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE generations (
        id TEXT PRIMARY KEY,
        prompt TEXT,
        created_at INTEGER DEFAULT 0,
        upscale_enable INTEGER DEFAULT 0
      )
    `);

    const firstPass = ensureGenerationsSchema(db);
    const columns = getColumns(db);

    expect(firstPass.repairedColumns).toBeGreaterThan(0);
    expect(columns).toContain('clip_on_cpu');
    expect(columns).toContain('binary_version');
    expect(columns).toContain('sample_steps');
  });

  it('is idempotent when all required columns already exist', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE generations (
        id TEXT PRIMARY KEY,
        prompt TEXT,
        created_at INTEGER DEFAULT 0,
        strength REAL DEFAULT 0.75,
        model_loading_time_ms INTEGER,
        generation_time_ms INTEGER,
        sample_steps INTEGER,
        cfg_scale REAL,
        sampling_method TEXT,
        clip_skip TEXT,
        upscale_enable INTEGER DEFAULT 0,
        vae_on_cpu INTEGER DEFAULT 0,
        offload_to_cpu INTEGER DEFAULT 0,
        clip_on_cpu INTEGER DEFAULT 0,
        vae_tiling INTEGER DEFAULT 0,
        diffusion_fa INTEGER DEFAULT 0,
        binary_version TEXT
      )
    `);

    const result = ensureGenerationsSchema(db);
    expect(result.repairedColumns).toBe(0);
  });
});
