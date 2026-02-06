import { readFile, writeFile, unlink } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { createLogger } from '../utils/logger.js';

const execAsync = promisify(exec);
const logger = createLogger('upscalerService');

/**
 * Upscaler Service
 * Handles image upscaling operations using SD.cpp's built-in RealESRGAN
 * SD.cpp includes a pure C++ implementation of RealESRGAN - no Python needed
 */

// Get paths - backend directory is where this service runs
const backendDir = dirname(new URL(import.meta.url).pathname);
const projectRoot = resolve(backendDir, '../..');
const sdCliPath = join(projectRoot, 'sdcpp', 'bin', 'sd-cli');

/**
 * Get list of available upscalers
 * Returns upscalers compatible with SD.next API format
 */
export function getAvailableUpscalers() {
  const upscalers = [];

  // Check for RealESRGAN models in the models directory
  const modelsDir = join(projectRoot, 'models');

  // RealESRGAN_x4plus.pth - the standard 4x upscaler
  if (existsSync(join(modelsDir, 'RealESRGAN_x4plus.pth'))) {
    upscalers.push({
      name: 'RealESRGAN 4x+',
      model_name: 'RealESRGAN',
      model_path: join(modelsDir, 'RealESRGAN_x4plus.pth'),
      model_url: null,
      scale: 4
    });
  }

  // RealESRGAN_x2plus.pth - 2x upscaler
  if (existsSync(join(modelsDir, 'RealESRGAN_x2plus.pth'))) {
    upscalers.push({
      name: 'RealESRGAN 2x+',
      model_name: 'RealESRGAN',
      model_path: join(modelsDir, 'RealESRGAN_x2plus.pth'),
      model_url: null,
      scale: 2
    });
  }

  // Anime upscaler
  if (existsSync(join(modelsDir, 'RealESRGAN_x4plus_anime_6B.pth'))) {
    upscalers.push({
      name: 'RealESRGAN 4x Anime',
      model_name: 'RealESRGAN',
      model_path: join(modelsDir, 'RealESRGAN_x4plus_anime_6B.pth'),
      model_url: null,
      scale: 4
    });
  }

  // Always add resize options (basic interpolation via sharp)
  upscalers.push(
    {
      name: 'Resize Lanczos',
      model_name: 'Resize',
      model_path: null,
      model_url: null,
      scale: 1 // Variable scale
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
  );

  return upscalers;
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
    resultBuffer = await upscaleWithSDcpp(imageBuffer, upscaler1.model_path);
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
 * Upscale image using SD.cpp's built-in RealESRGAN
 * SD.cpp has a pure C++ implementation - no Python needed
 *
 * Command: sd-cli -M upscale --upscale-model <model> --init-img <input> -o <output>
 */
async function upscaleWithSDcpp(imageBuffer, modelPath) {
  const { tmpdir } = await import('os');
  const timestamp = Date.now();
  const tempInputPath = join(tmpdir(), `sd_upscale_input_${timestamp}.png`);
  const tempOutputPath = join(tmpdir(), `sd_upscale_output_${timestamp}.png`);

  try {
    // Write input image
    await writeFile(tempInputPath, imageBuffer);

    // Check if sd-cli exists
    if (!existsSync(sdCliPath)) {
      logger.warn({ sdCliPath }, 'SD.cpp CLI not found, falling back to resize');
      const dims = await getImageDimensions(imageBuffer);
      return await resizeImage(imageBuffer, dims.width * 4, dims.height * 4, 'lanczos');
    }

    // Build SD.cpp command
    // sd-cli -M upscale --upscale-model <model> --init-img <input> -o <output> [options]
    const args = [
      '-M', 'upscale',
      '--upscale-model', modelPath,
      '--init-img', tempInputPath,
      '-o', tempOutputPath,
      '--upscale-tile-size', '128' // Default tile size for memory efficiency
    ];

    const command = `"${sdCliPath}" ${args.join(' ')}`;
    logger.debug({ command }, 'Running SD.cpp upscaler');

    const { stdout, stderr } = await execAsync(command, {
      cwd: join(projectRoot, 'sdcpp'),
      timeout: 120000 // 2 minute timeout
    });

    if (stderr && !stderr.includes('warning')) {
      logger.warn({ stderr }, 'SD.cpp stderr output');
    }

    // Read the output image
    if (!existsSync(tempOutputPath)) {
      throw new Error('SD.cpp upscaling failed - no output file generated');
    }

    const result = await readFile(tempOutputPath);
    logger.debug({ size: result.length }, 'Upscaled image size');
    return result;

  } catch (execError) {
    logger.error({ error: execError }, 'SD.cpp upscaling error');

    // Fallback to basic resize on error
    const dims = await getImageDimensions(imageBuffer);
    logger.info('Falling back to Lanczos resize');
    return await resizeImage(imageBuffer, dims.width * 4, dims.height * 4, 'lanczos');
  } finally {
    // Cleanup temp files
    try {
      await unlink(tempInputPath);
      await unlink(tempOutputPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Resize image using basic interpolation (via sharp)
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
  const metadata1 = await img1.metadata();
  const metadata2 = await img2.metadata();

  const width = metadata1.width || 512;
  const height = metadata1.height || 512;
  const channels1 = metadata1.channels || 4;
  const channels2 = metadata2.channels || 4;

  const img1Raw = await img1.raw().toBuffer();
  const img2Raw = await img2.resize(width, height).raw().toBuffer();

  // Create blended buffer
  const blended = Buffer.from(img1Raw);
  const minChannels = Math.min(channels1, channels2);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount; i++) {
    for (let c = 0; c < minChannels; c++) {
      const idx = i * Math.max(channels1, channels2) + c;
      blended[idx] = Math.round(
        img1Raw[idx] * (1 - opacity) + img2Raw[idx] * opacity
      );
    }
  }

  return await sharp(blended, {
    raw: { width, height, channels: channels1 }
  }).png().toBuffer();
}
