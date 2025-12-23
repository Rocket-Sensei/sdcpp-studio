import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = process.env.DB_PATH || `${__dirname}/../data/sd-webui.db`;
const dbDir = dirname(dbPath);
const imagesDir = process.env.IMAGES_DIR || `${__dirname}/../data/images`;

let db;

export function initializeDatabase() {
  // Ensure data directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Ensure images directory exists
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  // Create generations table
  db.exec(`
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

  // Create generated_images table - now stores file path instead of blob
  db.exec(`
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

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_images_generation_id ON generated_images(generation_id);
  `);

  console.log(`Database initialized at ${dbPath}`);
  console.log(`Images directory: ${imagesDir}`);
}

export function getDatabase() {
  if (!db) {
    initializeDatabase();
  }
  return db;
}

export function getImagesDir() {
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true });
  }
  return imagesDir;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

export function deleteGeneration(id) {
  const database = getDatabase();

  // Get images to delete files
  const imagesStmt = database.prepare('SELECT file_path FROM generated_images WHERE generation_id = ?');
  const images = imagesStmt.all(id);

  // Delete image files
  for (const image of images) {
    try {
      const fs = await import('fs');
      if (existsSync(image.file_path)) {
        fs.unlinkSync(image.file_path);
      }
    } catch (e) {
      console.error('Failed to delete image file:', e);
    }
  }

  // Delete from database (cascade will handle generated_images)
  const stmt = database.prepare('DELETE FROM generations WHERE id = ?');
  return stmt.run(id);
}
