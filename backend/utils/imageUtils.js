/**
 * Image Utility Functions
 * Provides image conversion utilities for sdcpp compatibility
 */

import sharp from 'sharp';

/**
 * Convert an image buffer to PNG format
 * sdcpp has limited format support for edit operations, specifically webp may fail
 * @param {Buffer} inputBuffer - Input image buffer
 * @param {string} inputFormat - Input format hint (optional, for optimization)
 * @returns {Promise<Buffer>} PNG format buffer
 */
export async function convertToPng(inputBuffer, inputFormat = null) {
  try {
    let pipeline = sharp(inputBuffer);

    // If we know the input format, we can optimize
    if (inputFormat) {
      pipeline = pipeline.toFormat(inputFormat);
    }

    // Convert to PNG
    const pngBuffer = await pipeline.png().toBuffer();
    return pngBuffer;
  } catch (error) {
    throw new Error(`Failed to convert image to PNG: ${error.message}`);
  }
}

/**
 * Detect if a buffer is a webp image
 * @param {Buffer} buffer - Image buffer
 * @returns {boolean} True if buffer is webp format
 */
export function isWebpBuffer(buffer) {
  if (!buffer || buffer.length < 12) return false;
  // WebP magic bytes: RIFF....WEBP
  return buffer[0] === 0x52 && buffer[1] === 0x49 &&
         buffer[2] === 0x46 && buffer[3] === 0x46 &&
         buffer[8] === 0x57 && buffer[9] === 0x45 &&
         buffer[10] === 0x42 && buffer[11] === 0x50;
}

/**
 * Convert buffer to PNG if it's webp, otherwise return as-is
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimetype - Original mimetype hint
 * @returns {Promise<Buffer>} PNG buffer or original buffer
 */
export async function ensurePngFormat(buffer, mimetype = null) {
  // Check mimetype hint first
  if (mimetype === 'image/webp' || isWebpBuffer(buffer)) {
    return await convertToPng(buffer);
  }
  return buffer;
}

/**
 * Get image metadata using sharp
 * @param {Buffer} buffer - Image buffer
 * @returns {Promise<Object>} Image metadata (width, height, format, etc.)
 */
export async function getImageMetadata(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: buffer.length
    };
  } catch (error) {
    return null;
  }
}

/**
 * Resize image to fit within max dimensions while maintaining aspect ratio
 * @param {Buffer} buffer - Input image buffer
 * @param {number} maxWidth - Maximum width
 * @param {number} maxHeight - Maximum height
 * @returns {Promise<Buffer>} Resized image buffer as PNG
 */
export async function resizeImage(buffer, maxWidth, maxHeight) {
  try {
    return await sharp(buffer)
      .resize(maxWidth, maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .png()
      .toBuffer();
  } catch (error) {
    throw new Error(`Failed to resize image: ${error.message}`);
  }
}
