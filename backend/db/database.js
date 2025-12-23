import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync, existsSync, unlinkSync } from 'fs';

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

  // Create input images directory for edit/variation uploads
  const inputImagesDir = `${__dirname}/../data/input`;
  if (!existsSync(inputImagesDir)) {
    mkdirSync(inputImagesDir, { recursive: true });
  }

  // Create queue table for async job processing
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

  // Create models table
  db.exec(`
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      command TEXT NOT NULL,
      args TEXT,
      api TEXT,
      mode TEXT DEFAULT 'on_demand',
      exec_mode TEXT DEFAULT 'server',
      port INTEGER,
      huggingface_repo TEXT,
      huggingface_files TEXT,
      downloaded BOOLEAN DEFAULT 0,
      download_path TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);

  // Create model_processes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_processes (
      model_id TEXT PRIMARY KEY,
      pid INTEGER,
      port INTEGER,
      exec_mode TEXT,
      status TEXT,
      started_at INTEGER,
      last_heartbeat_at INTEGER,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    )
  `);

  // Create model_downloads table
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_downloads (
      id TEXT PRIMARY KEY,
      model_id TEXT,
      repo TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      bytes_downloaded INTEGER DEFAULT 0,
      total_bytes INTEGER,
      error TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      completed_at INTEGER,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    )
  `);

  // Create model_download_files table for tracking individual file downloads
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_download_files (
      id TEXT PRIMARY KEY,
      download_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      destination_path TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      downloaded INTEGER DEFAULT 0,
      progress REAL DEFAULT 0,
      complete BOOLEAN DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      completed_at INTEGER,
      FOREIGN KEY (download_id) REFERENCES model_downloads(id) ON DELETE CASCADE
    )
  `);

  // Create indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_generated_images_generation_id ON generated_images(generation_id);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_queue_created_at ON queue(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_model_downloads_status ON model_downloads(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_model_downloads_model_id ON model_downloads(model_id);
    CREATE INDEX IF NOT EXISTS idx_model_download_files_download_id ON model_download_files(download_id);
  `);

  console.log(`Database initialized at ${dbPath}`);
  console.log(`Images directory: ${imagesDir}`);
  console.log(`Input images directory: ${inputImagesDir}`);
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

export function getInputImagesDir() {
  const inputDir = `${__dirname}/../data/input`;
  if (!existsSync(inputDir)) {
    mkdirSync(inputDir, { recursive: true });
  }
  return inputDir;
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
      if (existsSync(image.file_path)) {
        unlinkSync(image.file_path);
      }
    } catch (e) {
      console.error('Failed to delete image file:', e);
    }
  }

  // Delete from database (cascade will handle generated_images)
  const stmt = database.prepare('DELETE FROM generations WHERE id = ?');
  return stmt.run(id);
}
