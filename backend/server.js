import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from 'dotenv';
import http from 'http';

// Load environment variables from .env file BEFORE importing database module
// Skip .env loading in test mode - tests use environment variables set by test runner
const envResult = process.env.NODE_ENV === 'test'
  ? { error: new Error('Skipping .env in test mode') }
  : config({
      path: path.join(dirname(fileURLToPath(import.meta.url)), '.env')
    });

import { initializeDatabase, closeDatabase } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { failOldQueuedGenerations } from './db/queries.js';
import { startQueueProcessor } from './services/queueProcessor.js';
import { modelManager } from './services/modelManager.js';
import { getDownloadMethod } from './services/modelDownloader.js';
import { initializeWebSocket } from './services/websocket.js';
import { createLogger } from './utils/logger.js';
import { authenticateRequest } from './middleware/auth.js';

// Middleware
import { requestLogging } from './middleware/logging.js';
import { configureStaticFiles } from './middleware/static.js';
import upload from './middleware/upload.js';

// Routes
import registerHealthRoutes from './routes/health.js';
import registerConfigRoutes from './routes/config.js';
import registerGenerationRoutes from './routes/generations.js';
import registerQueueRoutes from './routes/queue.js';
import registerModelRoutes from './routes/models.js';
import registerSdApiRoutes from './routes/sdapi.js';
import registerImageRoutes from './routes/images.js';
import registerLogRoutes from './routes/logs.js';

// Create logger for server module
const logger = createLogger('server');

// Check for dotenv config error (already called above)
if (envResult.error) {
  // .env file is optional, log but don't fail
  logger.info('Note: .env file not found, using environment variables');
}

// Log HuggingFace token status
if (process.env.HF_TOKEN) {
  logger.info('HuggingFace token configured for authenticated downloads');
} else {
  logger.info('No HuggingFace token found (HF_TOKEN not set)');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';  // Default to all interfaces

// ============================================================================
// Middleware Configuration
// ============================================================================

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging middleware
app.use(requestLogging);

// Static file serving
configureStaticFiles(app);

// ============================================================================
// Database Initialization
// ============================================================================

initializeDatabase();
await runMigrations();

// ============================================================================
// Route Registration
// ============================================================================

// Health and config endpoints (no auth required)
registerHealthRoutes(app);
registerConfigRoutes(app);

// Image serving routes (auth required)
registerImageRoutes(app);

// Log retrieval routes (auth required)
registerLogRoutes(app);

// Queue management routes (auth required)
registerQueueRoutes(app, upload);

// Model management routes (auth required)
registerModelRoutes(app);

// Synchronous generation API routes (auth required)
registerGenerationRoutes(app, upload);

// SD.next API compatibility endpoints (auth required)
registerSdApiRoutes(app);

// ============================================================================
// Frontend Fallback
// ============================================================================

// 404 handler for static routes that didn't match
// Must come before the catch-all route
app.use('/static', (req, res) => {
  res.status(404).json({ error: 'File not found' });
});

// Serve frontend for all other routes (catch-all)
// Using middleware instead of app.get() for Express 5.x compatibility
app.use((req, res, next) => {
  // Skip if already handled by other routes
  if (req.path.startsWith('/api') || req.path.startsWith('/sdapi') || req.path.startsWith('/ws')) {
    return res.status(404).json({ error: 'Not found' });
  }
  // Serve frontend index.html
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// ============================================================================
// Server Initialization
// ============================================================================

// Create HTTP server and attach WebSocket
const server = http.createServer(app);

// Initialize WebSocket server
const wsServer = initializeWebSocket(server);

// Graceful shutdown handler
function gracefulShutdown(signal) {
  logger.info({ signal }, `Received ${signal}, closing server gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');

    // Close database connection
    try {
      closeDatabase();
      logger.info('Database connection closed');
    } catch (error) {
      logger.error({ error }, 'Error closing database');
    }

    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, HOST, async () => {
  logger.info(`Server running on http://${HOST}:${PORT}`);
  logger.info(`SD API endpoint: ${process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1231/v1'}`);
  logger.info(`WebSocket server initialized at ws://${HOST}:${PORT}/ws`);

  // Fail old queued/processing generations from previous server run
  try {
    failOldQueuedGenerations();
  } catch (error) {
    logger.error(`Failed to fail old queued generations: ${error.message}`);
  }

  // Initialize model manager
  try {
    modelManager.loadConfig();
    const allModels = modelManager.getAllModels();
    const defaultModel = modelManager.getDefaultModel();
    logger.info({ count: allModels.length }, `Model manager initialized`);
    logger.info({ defaultModel: defaultModel?.id || defaultModel?.name || 'none' }, `Default model`);
  } catch (error) {
    logger.error(`Failed to load model configuration: ${error.message}`);
  }

  // Start the queue processor
  startQueueProcessor(2000);
  logger.info(`Queue processor started (polling every 2 seconds)`);

  // Log download method info
  const downloadMethod = await getDownloadMethod();
  logger.info({ downloadMethod }, `Download method`);

  // Log HuggingFace cache directories
  logger.info({ hfHubCache: process.env.HF_HUB_CACHE || process.env.HUGGINGFACE_HUB_CACHE || './models/hf_cache/hub' }, `Python HF Hub cache`);
  logger.info({ nodeCache: process.env.NODE_HF_CACHE || './models/hf_cache/node' }, `Node.js cache`);
  logger.info({ modelsDir: process.env.MODELS_DIR || './models' }, `Models directory`);
});

export { app, server, wsServer };
