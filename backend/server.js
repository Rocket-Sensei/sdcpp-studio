import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initializeDatabase, getImagesDir } from './db/database.js';
import { generateImage } from './services/imageService.js';
import { getAllGenerations, getGenerationById, getImageById, getImagesByGenerationId } from './db/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Initialize database
initializeDatabase();

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get API config (for client to know the SD API endpoint)
app.get('/api/config', (req, res) => {
  res.json({
    sdApiEndpoint: process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1',
    model: 'sd-cpp-local'
  });
});

// Generate image (text-to-image)
app.post('/api/generate', async (req, res) => {
  try {
    const result = await generateImage(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image edit (image-to-image)
app.post('/api/edit', upload.single('image'), async (req, res) => {
  try {
    const result = await generateImage({
      ...req.body,
      image: req.file
    }, 'edit');
    res.json(result);
  } catch (error) {
    console.error('Error editing image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image variation
app.post('/api/variation', upload.single('image'), async (req, res) => {
  try {
    const result = await generateImage({
      ...req.body,
      image: req.file
    }, 'variation');
    res.json(result);
  } catch (error) {
    console.error('Error creating variation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all generations
app.get('/api/generations', async (req, res) => {
  try {
    const generations = await getAllGenerations();
    res.json(generations);
  } catch (error) {
    console.error('Error fetching generations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single generation
app.get('/api/generations/:id', async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }
    res.json(generation);
  } catch (error) {
    console.error('Error fetching generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get image file by image ID (for thumbnails and specific images)
app.get('/api/images/:imageId', async (req, res) => {
  try {
    const image = getImageById(req.params.imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.set('Content-Type', image.mime_type);
    res.sendFile(image.file_path);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get first image for a generation (for backwards compatibility)
app.get('/api/generations/:id/image', async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation || !generation.images || generation.images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const firstImage = generation.images[0];
    res.set('Content-Type', firstImage.mime_type);
    res.sendFile(firstImage.file_path);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all images for a generation
app.get('/api/generations/:id/images', async (req, res) => {
  try {
    const images = await getImagesByGenerationId(req.params.id);
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete generation
app.delete('/api/generations/:id', async (req, res) => {
  try {
    const { deleteGeneration } = await import('./db/database.js');
    await deleteGeneration(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`SD API endpoint: ${process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1'}`);
});
