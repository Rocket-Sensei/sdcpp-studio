import { getDatabase, getImagesDir } from './database.js';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

export async function createGeneration(data) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO generations (
      id, type, model, prompt, negative_prompt, size, seed, n,
      quality, style, response_format, user_id, source_image_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.id,
    data.type,
    data.model || 'sd-cpp-local',
    data.prompt || null,
    data.negative_prompt || null,
    data.size || null,
    data.seed || null,
    data.n || 1,
    data.quality || null,
    data.style || null,
    data.response_format || 'b64_json',
    data.user_id || null,
    data.source_image_id || null
  );
}

export async function createGeneratedImage(data) {
  const db = getDatabase();
  const imagesDir = getImagesDir();

  // Save image file to disk
  const filename = `${data.id}.png`;
  const filePath = join(imagesDir, filename);
  await writeFile(filePath, data.image_data);

  const stmt = db.prepare(`
    INSERT INTO generated_images (
      id, generation_id, index_in_batch, file_path, mime_type,
      width, height, revised_prompt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.id,
    data.generation_id,
    data.index_in_batch || 0,
    filePath,
    data.mime_type || 'image/png',
    data.width || null,
    data.height || null,
    data.revised_prompt || null
  );
}

export function getAllGenerations() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      g.*,
      COUNT(gi.id) as image_count
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `);
  return stmt.all();
}

export function getGenerationById(id) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      g.*,
      COUNT(gi.id) as image_count
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    WHERE g.id = ?
    GROUP BY g.id
  `);
  const generation = stmt.get(id);
  if (!generation) return null;

  // Get images for this generation
  const imagesStmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch');
  generation.images = imagesStmt.all(id);

  return generation;
}

export function getImageById(id) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE id = ?');
  return stmt.get(id);
}

export function getImagesByGenerationId(generationId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch');
  return stmt.all(generationId);
}

export function getFirstImageForGeneration(generationId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM generated_images WHERE generation_id = ? ORDER BY index_in_batch LIMIT 1');
  return stmt.get(generationId);
}

export function getGenerationsByType(type, limit = 50) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT
      g.*,
      COUNT(gi.id) as image_count
    FROM generations g
    LEFT JOIN generated_images gi ON g.id = gi.generation_id
    WHERE g.type = ?
    GROUP BY g.id
    ORDER BY g.created_at DESC
    LIMIT ?
  `);
  return stmt.all(type, limit);
}
