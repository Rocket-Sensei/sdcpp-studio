/**
 * Upscaler Controller
 *
 * Handles upscaler listing and image upscaling endpoints.
 * SD.next / Automatic1111 compatible API.
 */

import { createLogger } from '../../utils/logger.js';

const logger = createLogger('controllers:upscaler');

/**
 * Register upscaler routes
 * @param {import('express').Express} app - Express app instance
 * @param {Function} authenticateRequest - Authentication middleware
 * @param {Function} upload - Multer upload middleware for file uploads
 */
export function registerUpscalerRoutes(app, authenticateRequest, upload) {
  /**
   * GET /sdapi/v1/upscalers
   * Get list of available upscalers (authenticated)
   * Compatible with SD.next / Automatic1111 API
   */
  app.get('/sdapi/v1/upscalers', authenticateRequest, async (req, res) => {
    try {
      const { getAvailableUpscalers } = await import('../../services/upscalerService.js');
      const upscalers = getAvailableUpscalers();
      res.json(upscalers);
    } catch (error) {
      logger.error({ error }, 'Error fetching upscalers');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /sdapi/v1/extra-single-image
   * Upscale a single image
   * Compatible with SD.next / Automatic1111 API
   * Supports both JSON (base64) and multipart/form-data (file upload)
   */
  app.post('/sdapi/v1/extra-single-image', upload.single('image'), authenticateRequest, async (req, res) => {
    try {
      const { upscaleImage } = await import('../../services/upscalerService.js');

      let image;
      let resize_mode = 0;
      let show_extras_results = true;
      let gfpgan_visibility = 0;
      let codeformer_visibility = 0;
      let codeformer_weight = 0;
      let upscaling_resize = 2.0;
      let upscaling_resize_w = 512;
      let upscaling_resize_h = 512;
      let upscaling_crop = true;
      let upscaler_1 = 'RealESRGAN 4x+';
      let upscaler_2 = 'None';
      let extras_upscaler_2_visibility = 0;

      // Handle both multipart form data (file upload) and JSON (base64)
      if (req.file) {
        // File upload via multipart/form-data
        const { buffer, mimetype } = req.file;
        image = `data:${mimetype};base64,${buffer.toString('base64')}`;

        // Get other fields from req.body (form fields)
        if (req.body) {
          if (req.body.resize_mode !== undefined) resize_mode = parseInt(req.body.resize_mode, 10);
          if (req.body.upscale_factor !== undefined) upscaling_resize = parseFloat(req.body.upscale_factor);
          if (req.body.upscaler) upscaler_1 = req.body.upscaler;
          if (req.body.target_width !== undefined) upscaling_resize_w = parseInt(req.body.target_width, 10);
          if (req.body.target_height !== undefined) upscaling_resize_h = parseInt(req.body.target_height, 10);
        }
      } else {
        // JSON body with base64 image
        ({
          image,
          resize_mode = 0,
          show_extras_results = true,
          gfpgan_visibility = 0,
          codeformer_visibility = 0,
          codeformer_weight = 0,
          upscaling_resize = 2.0,
          upscaling_resize_w = 512,
          upscaling_resize_h = 512,
          upscaling_crop = true,
          upscaler_1 = 'RealESRGAN 4x+',
          upscaler_2 = 'None',
          extras_upscaler_2_visibility = 0
        } = req.body);

        if (!image) {
          return res.status(400).json({ error: 'Missing required field: image' });
        }
      }

      if (!image) {
        return res.status(400).json({ error: 'Missing required field: image' });
      }

      // Upscale the image
      const resultBuffer = await upscaleImage(image, {
        resize_mode,
        upscaling_resize,
        upscaling_resize_w,
        upscaling_resize_h,
        upscaling_crop,
        upscaler_1,
        upscaler_2,
        extras_upscaler_2_visibility,
        gfpgan_visibility,
        codeformer_visibility,
        codeformer_weight
      });

      // Convert to base64
      const base64Image = resultBuffer.toString('base64');

      res.json({
        image: base64Image,
        html_info: `<div>Upscaled with ${upscaler_1}</div>`
      });
    } catch (error) {
      logger.error({ error }, 'Error in extra-single-image');
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /sdapi/v1/extra-batch-images
   * Upscale multiple images in batch
   * Compatible with SD.next / Automatic1111 API
   */
  app.post('/sdapi/v1/extra-batch-images', authenticateRequest, async (req, res) => {
    try {
      const { upscaleImage } = await import('../../services/upscalerService.js');

      const {
        imageList, // Array of { data: base64, name: string }
        resize_mode = 0,
        show_extras_results = true,
        gfpgan_visibility = 0,
        codeformer_visibility = 0,
        codeformer_weight = 0,
        upscaling_resize = 2.0,
        upscaling_resize_w = 512,
        upscaling_resize_h = 512,
        upscaling_crop = true,
        upscaler_1 = 'RealESRGAN 4x+',
        upscaler_2 = 'None',
        extras_upscaler_2_visibility = 0
      } = req.body;

      if (!imageList || !Array.isArray(imageList) || imageList.length === 0) {
        return res.status(400).json({ error: 'Missing required field: imageList (array)' });
      }

      // Upscale all images
      const results = await Promise.all(
        imageList.map(async (img) => {
          try {
            const resultBuffer = await upscaleImage(img.data, {
              resize_mode,
              upscaling_resize,
              upscaling_resize_w,
              upscaling_resize_h,
              upscaling_crop,
              upscaler_1,
              upscaler_2,
              extras_upscaler_2_visibility,
              gfpgan_visibility,
              codeformer_visibility,
              codeformer_weight
            });
            return resultBuffer.toString('base64');
          } catch (err) {
            logger.error({ err, imageName: img.name }, 'Error upscaling image');
            return null;
          }
        })
      );

      res.json({
        images: results.filter(Boolean),
        html_info: `<div>Upscaled ${results.filter(Boolean).length} images with ${upscaler_1}</div>`
      });
    } catch (error) {
      logger.error({ error }, 'Error in extra-batch-images');
      res.status(500).json({ error: error.message });
    }
  });
}
