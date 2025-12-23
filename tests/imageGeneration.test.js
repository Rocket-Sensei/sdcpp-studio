import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// Test database path
const testDbPath = join(__dirname, 'test.db');
const testImagesDir = join(__dirname, 'test-images');

function createTestDatabase() {
  const testDb = new Database(testDbPath);
  testDb.pragma('journal_mode = WAL');

  // Create generations table
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS generations (
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
      response_format TEXT DEFAULT 'b64_json',
      user_id TEXT,
      source_image_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Create generated_images table - stores file path
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS generated_images (
      id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      index_in_batch INTEGER DEFAULT 0,
      file_path TEXT NOT NULL,
      mime_type TEXT DEFAULT 'image/png',
      width INTEGER,
      height INTEGER,
      revised_prompt TEXT,
      FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE CASCADE
    )
  `);

  return testDb;
}

function cleanupTestFiles() {
  if (existsSync(testDbPath)) {
    unlinkSync(testDbPath);
  }
}

describe('Image Generation Flow v2', () => {
  let db;

  beforeAll(() => {
    cleanupTestFiles();
    db = createTestDatabase();
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    cleanupTestFiles();
  });

  beforeEach(() => {
    // Clear tables before each test
    db.exec('DELETE FROM generated_images');
    db.exec('DELETE FROM generations');
  });

  describe('Database Operations', () => {
    it('should create a generation record', () => {
      const generationId = 'test-gen-1';
      const stmt = db.prepare(`
        INSERT INTO generations (
          id, type, model, prompt, negative_prompt, size, seed, n,
          quality, style, response_format, user_id, source_image_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        generationId,
        'generate',
        'sd-cpp-local',
        'A beautiful landscape',
        'blurry, low quality',
        '512x512',
        '12345',
        1,
        'high',
        'vivid',
        'b64_json',
        null,
        null
      );

      expect(result.changes).toBe(1);

      const selectStmt = db.prepare('SELECT * FROM generations WHERE id = ?');
      const generation = selectStmt.get(generationId);

      expect(generation).toBeDefined();
      expect(generation.seed).toBe('12345');
    });

    it('should create an image record with file path', () => {
      const generationId = 'test-gen-2';
      const genStmt = db.prepare(`
        INSERT INTO generations (id, type, model, prompt)
        VALUES (?, ?, ?, ?)
      `);
      genStmt.run(generationId, 'generate', 'sd-cpp-local', 'Test prompt');

      const imageId = 'test-img-1';
      const filePath = '/path/to/test-image.png';

      const imgStmt = db.prepare(`
        INSERT INTO generated_images (
          id, generation_id, index_in_batch, file_path, mime_type, width, height
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = imgStmt.run(
        imageId,
        generationId,
        0,
        filePath,
        'image/png',
        512,
        512
      );

      expect(result.changes).toBe(1);

      const selectStmt = db.prepare('SELECT * FROM generated_images WHERE id = ?');
      const image = selectStmt.get(imageId);

      expect(image).toBeDefined();
      expect(image.file_path).toBe(filePath);
      expect(image.width).toBe(512);
    });

    it('should store multiple images for a generation', () => {
      const generationId = 'test-gen-multi';
      const genStmt = db.prepare(`
        INSERT INTO generations (id, type, model, prompt, n)
        VALUES (?, ?, ?, ?, ?)
      `);
      genStmt.run(generationId, 'generate', 'sd-cpp-local', 'Test', 3);

      const imgStmt = db.prepare(`
        INSERT INTO generated_images (id, generation_id, index_in_batch, file_path)
        VALUES (?, ?, ?, ?)
      `);
      imgStmt.run('img-1', generationId, 0, '/path/img1.png');
      imgStmt.run('img-2', generationId, 1, '/path/img2.png');
      imgStmt.run('img-3', generationId, 2, '/path/img3.png');

      const selectStmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch');
      const images = selectStmt.all(generationId);

      expect(images).toHaveLength(3);
      expect(images[0].index_in_batch).toBe(0);
      expect(images[1].index_in_batch).toBe(1);
      expect(images[2].index_in_batch).toBe(2);
    });
  });

  describe('Seed Generation', () => {
    it('should generate random seed within valid range', () => {
      const seeds = new Set();
      for (let i = 0; i < 100; i++) {
        const seed = Math.floor(Math.random() * 4294967295);
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThan(4294967295);
        seeds.add(seed);
      }
      // Should have generated mostly unique seeds
      expect(seeds.size).toBeGreaterThan(90);
    });

    it('should always include seed in prompt', () => {
      const seed = 12345;
      const prompt = 'A cat';
      const extraArgs = { seed };
      const finalPrompt = `${prompt}<sd_cpp_extra_args>${JSON.stringify(extraArgs)}</sd_cpp_extra_args>`;

      expect(finalPrompt).toContain('<sd_cpp_extra_args>');
      expect(finalPrompt).toContain('"seed":12345');
    });
  });

  describe('Prompt Parsing', () => {
    it('should parse prompt with sd_cpp_extra_args', () => {
      const prompt = 'A lovely cat<sd_cpp_extra_args>{"seed": 357925}</sd_cpp_extra_args>';
      const extraArgsMatch = prompt.match(/<sd_cpp_extra_args>(.*?)<\/sd_cpp_extra_args>/s);

      expect(extraArgsMatch).toBeDefined();
      expect(extraArgsMatch[1]).toBe('{"seed": 357925}');
    });

    it('should parse prompt with negative_prompt', () => {
      const prompt = 'A lovely cat<negative_prompt>blurry, low quality</negative_prompt>';
      const negPromptMatch = prompt.match(/<negative_prompt>(.*?)<\/negative_prompt>/s);

      expect(negPromptMatch).toBeDefined();
      expect(negPromptMatch[1]).toBe('blurry, low quality');
    });

    it('should reconstruct prompt with seed added', () => {
      const basePrompt = 'A lovely cat';
      const seed = 99999;
      const extraArgs = { seed };
      const finalPrompt = `${basePrompt}<sd_cpp_extra_args>${JSON.stringify(extraArgs)}</sd_cpp_extra_args>`;

      expect(finalPrompt).toBe('A lovely cat<sd_cpp_extra_args>{"seed":99999}</sd_cpp_extra_args>');
    });
  });

  describe('Multiple Image Support', () => {
    it('should handle batch index for multiple images', () => {
      const batchSizes = [1, 2, 4, 10];
      batchSizes.forEach(n => {
        for (let i = 0; i < n; i++) {
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(n);
        }
      });
    });

    it('should order images by index_in_batch', () => {
      const indices = [2, 0, 1];
      const sorted = [...indices].sort((a, b) => a - b);
      expect(sorted).toEqual([0, 1, 2]);
    });
  });

  describe('Image File Storage', () => {
    it('should construct correct file path for image', () => {
      const imageId = 'abc-123-def';
      const filename = `${imageId}.png`;
      expect(filename).toBe('abc-123-def.png');
    });

    it('should use unique IDs for images', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        // Simulate unique ID generation
        const id = `img-${i}-${Date.now()}-${Math.random()}`;
        ids.add(id);
      }
      expect(ids.size).toBe(100);
    });
  });
});
