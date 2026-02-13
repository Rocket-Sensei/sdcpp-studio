/**
 * SD.next / Automatic1111 compatible API routes
 *
 * These use the standard /sdapi/v1/ path that SillyTavern and other tools expect.
 *
 * Route handlers are extracted into separate controllers in /backend/controllers/sdapi/:
 * - samplersController.js - samplers and schedulers
 * - modelsController.js - models and options
 * - progressController.js - progress and interrupt
 * - txt2imgController.js - text-to-image generation
 * - upscalerController.js - upscaler endpoints
 */

import { registerSamplerRoutes } from '../controllers/sdapi/samplersController.js';
import { registerModelRoutes } from '../controllers/sdapi/modelsController.js';
import { registerProgressRoutes } from '../controllers/sdapi/progressController.js';
import { registerTxt2ImgRoutes } from '../controllers/sdapi/txt2imgController.js';
import { registerUpscalerRoutes } from '../controllers/sdapi/upscalerController.js';
import { upload } from '../middleware/upload.js';
import { authenticateRequest } from '../middleware/auth.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('routes:sdapi');

/**
 * Register all SD API routes
 * @param {import('express').Express} app - Express app instance
 */
export function registerSdApiRoutes(app) {
  logger.info('Registering SD API routes');

  // Register sampler and scheduler routes
  registerSamplerRoutes(app, authenticateRequest);

  // Register model-related routes
  registerModelRoutes(app, authenticateRequest);

  // Register progress and interrupt routes
  registerProgressRoutes(app, authenticateRequest);

  // Register txt2img generation route
  registerTxt2ImgRoutes(app, authenticateRequest);

  // Register upscaler routes
  registerUpscalerRoutes(app, authenticateRequest, upload);

  logger.info('SD API routes registered successfully');
}

export default registerSdApiRoutes;
