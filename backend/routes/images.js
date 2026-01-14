import path from 'path';
import { getImageById } from '../db/queries.js';
import { createLogger } from '../utils/logger.js';
import { authenticateRequest } from '../middleware/auth.js';

const logger = createLogger('routes:images');

/**
 * Image serving routes
 */

export function registerImageRoutes(app) {
  // Get image file by image ID (serves original full-resolution image) - authenticated
  // Supports optional ?size=thumbnail query param for future thumbnail support
  app.get('/api/images/:imageId', authenticateRequest, async (req, res) => {
    try {
      const image = getImageById(req.params.imageId);
      if (!image) {
        return res.status(404).json({ error: 'Image not found' });
      }
      res.set('Content-Type', image.mime_type);
      // Cache images for 1 hour
      res.set('Cache-Control', 'public, max-age=3600, immutable');
      // Ensure the path is absolute before sending
      const absolutePath = path.isAbsolute(image.file_path)
        ? image.file_path
        : path.resolve(process.cwd(), image.file_path);
      res.sendFile(absolutePath, (err) => {
        if (err) {
          logger.error({ error: err, filePath: absolutePath }, 'Error sending image file');
          if (!res.headersSent) {
            res.status(404).json({ error: 'Image file not found on disk' });
          }
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching image');
      res.status(500).json({ error: error.message });
    }
  });

  // Get first image for a generation (for backwards compatibility) - authenticated
  app.get('/api/generations/:id/image', authenticateRequest, async (req, res) => {
    try {
      const { getGenerationById } = await import('../db/queries.js');
      const generation = await getGenerationById(req.params.id);
      if (!generation || !generation.images || generation.images.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }
      const firstImage = generation.images[0];
      res.set('Content-Type', firstImage.mime_type);
      // Cache images for 1 hour
      res.set('Cache-Control', 'public, max-age=3600, immutable');
      // Ensure the path is absolute before sending
      const absolutePath = path.isAbsolute(firstImage.file_path)
        ? firstImage.file_path
        : path.resolve(process.cwd(), firstImage.file_path);
      res.sendFile(absolutePath, (err) => {
        if (err) {
          logger.error({ error: err, filePath: absolutePath }, 'Error sending image file');
          if (!res.headersSent) {
            res.status(404).json({ error: 'Image file not found on disk' });
          }
        }
      });
    } catch (error) {
      logger.error({ error }, 'Error fetching image');
      res.status(500).json({ error: error.message });
    }
  });

  // Get all images for a generation (authenticated)
  app.get('/api/generations/:id/images', authenticateRequest, async (req, res) => {
    try {
      const { getImagesByGenerationId } = await import('../db/queries.js');
      const images = await getImagesByGenerationId(req.params.id);
      res.json(images);
    } catch (error) {
      logger.error({ error }, 'Error fetching images');
      res.status(500).json({ error: error.message });
    }
  });
}

export default registerImageRoutes;
