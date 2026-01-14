import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getImagesDir, getInputImagesDir } from '../db/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configure static file serving
 * @param {import('express').Express} app - Express app instance
 */
export function configureStaticFiles(app) {
  // Serve static files from frontend build
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));

  // Serve static images from images directory (respects IMAGES_DIR env var for tests)
  // These are generated images that can be served directly without going through the API
  app.use('/static/images', express.static(getImagesDir()));

  // Serve static input images from input directory (respects INPUT_DIR env var for tests)
  // These are uploaded/input images used for img2img
  app.use('/static/input', express.static(getInputImagesDir()));
}

export default configureStaticFiles;
