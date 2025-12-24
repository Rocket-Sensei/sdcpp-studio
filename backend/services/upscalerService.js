import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Upscaler Service
 * Handles image upscaling operations using various upscalers
 */

// Get project root
const projectRoot = resolve(process.cwd(), '..');

/**
 * Get list of available upscalers
 */
export function getAvailableUpscalers() {
  return [
    {
      name: 'RealESRGAN 4x+',
      model_name: 'RealESRGAN',
      model_path: join(projectRoot, 'models/RealESRGAN_x4plus.pth'),
      model_url: null,
      scale: 4
    },
    {
      name: 'Resize Lanczos',
      model_name: 'Resize',
      model_path: null,
      model_url: null,
      scale: 1
    },
    {
      name: 'Resize Bicubic',
      model_name: 'Resize',
      model_path: null,
      model_url: null,
      scale: 1
    },
    {
      name: 'Resize Nearest',
      model_name: 'Resize',
      model_path: null,
      model_url: null,
      scale: 1
    }
  ];
}

/**
 * Find upscaler by name
 */
export function findUpscalerByName(name) {
  const upscalers = getAvailableUpscalers();
  return upscalers.find(u => u.name === name);
}

/**
 * Get upscaler info by name
 */
export function getUpscalerInfo(name) {
  const upscaler = findUpscalerByName(name);
  if (!upscaler) {
    return null;
  }
  return {
    name: upscaler.name,
    model_name: upscaler.model_name,
    model_path: upscaler.model_path,
    model_url: upscaler.model_url,
    scale: upscaler.scale
  };
}

/**
 * Upscale an image using the specified upscaler
 * @param {Buffer|string} imageInput - Buffer or base64 string of the image
 * @param {Object} options - Upscaling options
 * @returns {Promise<Buffer>} Upscaled image buffer
 */
export async function upscaleImage(imageInput, options = {}) {
  const {
    upscaler_1 = 'RealESRGAN 4x+',
    upscaler_2 = 'None',
    extras_upscaler_2_visibility = 0,
    resize_mode = 0, // 0 = by factor, 1 = to specific dimensions
    upscaling_resize = 2.0,
    upscaling_resize_w = 512,
    upscaling_resize_h = 512,
    upscaling_crop = true,
    gfpgan_visibility = 0,
    codeformer_visibility = 0,
    codeformer_weight = 0
  } = options;

  // Handle image input
  let imageBuffer;
  if (typeof imageInput === 'string') {
    // Assume base64 string, potentially with data URL prefix
    const base64Data = imageInput.includes('base64,')
      ? imageInput.split('base64,')[1]
      : imageInput;
    imageBuffer = Buffer.from(base64Data, 'base64');
  } else if (Buffer.isBuffer(imageInput)) {
    imageBuffer = imageInput;
  } else {
    throw new Error('Invalid image input: must be Buffer or base64 string');
  }

  // Get upscaler info
  const upscaler1 = findUpscalerByName(upscaler_1);

  if (!upscaler1) {
    throw new Error(`Upscaler not found: ${upscaler_1}`);
  }

  // Determine target dimensions
  let targetWidth, targetHeight;

  if (resize_mode === 0) {
    // Upscale by factor - need to get original dimensions first
    const dims = await getImageDimensions(imageBuffer);
    targetWidth = Math.round(dims.width * upscaling_resize);
    targetHeight = Math.round(dims.height * upscaling_resize);
  } else {
    // Use specific dimensions
    targetWidth = upscaling_resize_w;
    targetHeight = upscaling_resize_h;
  }

  // Perform upscaling based on upscaler type
  let resultBuffer;

  if (upscaler1.model_name === 'RealESRGAN') {
    resultBuffer = await upscaleWithRealESRGAN(imageBuffer, targetWidth, targetHeight, upscaler1.model_path);
  } else if (upscaler1.model_name === 'Resize') {
    const method = upscaler1.name.toLowerCase().includes('lanczos') ? 'lanczos'
      : upscaler1.name.toLowerCase().includes('bicubic') ? 'bicubic'
      : 'nearest';
    resultBuffer = await resizeImage(imageBuffer, targetWidth, targetHeight, method);
  } else {
    throw new Error(`Unsupported upscaler type: ${upscaler1.model_name}`);
  }

  // Apply second upscaler if specified
  if (upscaler_2 !== 'None' && extras_upscaler_2_visibility > 0) {
    const upscaler2 = findUpscalerByName(upscaler_2);
    if (upscaler2) {
      const secondPassBuffer = await upscaleImage(resultBuffer, {
        ...options,
        upscaler_1: upscaler2.name,
        upscaler_2: 'None',
        resize_mode,
        upscaling_resize: 1, // Second pass at same size
        upscaling_resize_w: targetWidth,
        upscaling_resize_h: targetHeight
      });

      // Blend based on visibility
      resultBuffer = await blendImages(resultBuffer, secondPassBuffer, extras_upscaler_2_visibility);
    }
  }

  return resultBuffer;
}

/**
 * Get image dimensions from buffer
 */
async function getImageDimensions(buffer) {
  // Simple PNG dimension extraction
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  // Simple JPEG dimension extraction
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
    let i = 2;
    while (i < buffer.length) {
      if (buffer[i] === 0xFF && buffer[i + 1] >= 0xC0 && buffer[i + 1] <= 0xCF && buffer[i + 1] !== 0xC4 && buffer[i + 1] !== 0xC8) {
        const height = buffer.readUInt16BE(i + 5);
        const width = buffer.readUInt16BE(i + 7);
        return { width, height };
      }
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }
  // Default fallback
  return { width: 512, height: 512 };
}

/**
 * Upscale image using RealESRGAN via Python
 */
async function upscaleWithRealESRGAN(imageBuffer, targetWidth, targetHeight, modelPath) {
  const { writeFile, unlink } = await import('fs/promises');
  const { tmpdir } = await import('os');
  const { join } = await import('path');

  const tempInputPath = join(tmpdir(), `upscale_input_${Date.now()}.png`);
  const tempOutputPath = join(tmpdir(), `upscale_output_${Date.now()}.png`);

  try {
    // Write input image
    await writeFile(tempInputPath, imageBuffer);

    // Resolve model path relative to project root
    const resolvedModelPath = resolve(projectRoot, 'models/RealESRGAN_x4plus.pth');

    // Use Python subprocess to call RealESRGAN
    // Check if we have the RealESRGAN script available
    const pythonScript = `
import sys
sys.path.insert(0, './sd-next')
from basicsr.archs.rrdbnet_arch import RRDBNet
from realesrgan import RealESRGANer
from cv2 import imread, imwrite, IMREAD_UNCHANGED
import numpy as np

# Initialize model
model = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=4)
upsampler = RealESRGANer(
    scale=4,
    model_path='${resolvedModelPath}',
    model=model,
    tile=0,
    tile_pad=10,
    pre_pad=0,
    half=False
)

# Read and upscale image
img = imread('${tempInputPath}', IMREAD_UNCHANGED)
output, _ = upsampler.enhance(img, outscale=${targetWidth / 512})
imwrite('${tempOutputPath}', output)
`;

    const scriptPath = join(tmpdir(), `upscale_script_${Date.now()}.py`);
    await writeFile(scriptPath, pythonScript);

    try {
      await execAsync(`python3 ${scriptPath}`);
      const result = await readFile(tempOutputPath);
      return result;
    } catch (execError) {
      // If RealESRGAN is not available, fall back to basic resize
      console.warn('RealESRGAN not available, falling back to resize:', execError.message);
      return await resizeImage(imageBuffer, targetWidth, targetHeight, 'lanczos');
    }
  } finally {
    // Cleanup temp files
    try {
      const { unlink } = await import('fs/promises');
      await unlink(tempInputPath);
      await unlink(tempOutputPath);
      await unlink(scriptPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Resize image using basic interpolation
 */
async function resizeImage(imageBuffer, targetWidth, targetHeight, method = 'lanczos') {
  const sharp = (await import('sharp')).default;
  const kernelMap = {
    'lanczos': 'lanczos3',
    'bicubic': 'bicubic',
    'nearest': 'nearest'
  };

  return await sharp(imageBuffer)
    .resize(targetWidth, targetHeight, {
      kernel: kernelMap[method] || 'lanczos3'
    })
    .png()
    .toBuffer();
}

/**
 * Blend two images together
 */
async function blendImages(image1Buffer, image2Buffer, opacity) {
  const sharp = (await import('sharp')).default;

  const img1 = sharp(image1Buffer);
  const img2 = sharp(image2Buffer);
  const { width, height } = await img1.metadata();

  const img1Resized = await img1.resize(width, height).raw().toBuffer();
  const img2Resized = await img2.resize(width, height).raw().toBuffer();

  // Create blended buffer
  const blended = Buffer.from(img1Resized);
  for (let i = 0; i < blended.length; i++) {
    blended[i] = Math.round(
      img1Resized[i] * (1 - opacity) + img2Resized[i] * opacity
    );
  }

  return await sharp(blended, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
}
