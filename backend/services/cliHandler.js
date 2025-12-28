/**
 * CLI Handler Service
 *
 * Handles image generation using SD-CPP in CLI mode (one-shot process per image).
 * This is useful for models that don't support server mode or for resource-constrained systems.
 *
 * @module backend/services/cliHandler
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { logCliCommand, logCliOutput, logCliError, createLogger, getSdCppLogger } from '../utils/logger.js';

const logger = createLogger('cliHandler');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '../..');  // Project root (two levels up from backend/services/)

/**
 * Generate a random seed for image generation
 * @returns {number} Random seed between 0 and 2^32-1
 */
function generateRandomSeed() {
  return Math.floor(Math.random() * 4294967295);
}

/**
 * Parse size string to width and height
 * @param {string} size - Size string in format "WxH" (e.g., "1024x1024")
 * @returns {{width: number, height: number}} Parsed dimensions
 */
function parseSize(size) {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

/**
 * Map quality parameter to sampling steps
 * @param {string} quality - Quality level (low, medium, high, ultra)
 * @returns {number} Number of sampling steps
 */
function mapQualityToSteps(quality) {
  const qualityMap = {
    low: 10,
    medium: 20,
    high: 30,
    ultra: 50,
    standard: 20,
  };
  return qualityMap[quality] || 20;
}

/**
 * Map style parameter to style preset
 * @param {string} style - Style name
 * @returns {string[]} CLI style arguments
 */
function mapStyleToArgs(style) {
  // Style presets can be expanded based on model capabilities
  const styleArgs = [];

  switch (style) {
    case 'cinematic':
      styleArgs.push('--style', 'cinematic');
      break;
    case 'anime':
      styleArgs.push('--style', 'anime');
      break;
    case 'photographic':
      styleArgs.push('--style', 'photographic');
      break;
    case 'digital-art':
      styleArgs.push('--style', 'digital-art');
      break;
    case 'fantasy-art':
      styleArgs.push('--style', 'fantasy-art');
      break;
    default:
      // No style-specific args
      break;
  }

  return styleArgs;
}

/**
 * CLI Handler class for managing SD-CPP CLI mode image generation
 */
class CLIHandler {
  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'cli-output');
    this.ensureTempDir();
  }

  /**
   * Ensure the temporary output directory exists
   * @private
   */
  async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      logger.error({ error }, 'Failed to create temp directory');
    }
  }

  /**
   * Generate a single image/video using CLI mode
   * @param {string} modelId - Model identifier
   * @param {Object} params - Generation parameters
   * @param {string} params.prompt - Text prompt for generation
   * @param {string} [params.negative_prompt] - Negative prompt
   * @param {string} [params.size='1024x1024'] - Image size (WxH format)
   * @param {number} [params.seed] - Random seed (random if not provided)
   * @param {number} [params.n=1] - Number of images to generate
   * @param {string} [params.quality='medium'] - Quality level
   * @param {string} [params.style] - Style preset
   * @param {string} [params.type] - Generation type ('generate', 'edit', 'variation', 'video')
   * @param {string} [params.input_image_path] - Path to input image for img2img/video
   * @param {number} [params.strength=0.75] - Strength for img2img (variation)
   * @param {number} [params.video_frames] - Number of video frames
   * @param {number} [params.video_fps] - Video FPS
   * @param {number} [params.flow_shift] - Flow shift value for Wan models
   * @param {string} [params.end_image_path] - Path to end image for FLF2V
   * @param {Object} modelConfig - Model configuration from models.yml
   * @param {string} [generationId] - Optional generation ID for logging
   * @returns {Promise<Buffer>} Generated image/video as a Buffer
   */
  async generateImage(modelId, params, modelConfig, generationId = null) {
    // Build the CLI command
    const command = this.buildCommand(modelConfig, params);

    // Determine output extension based on type
    const type = params.type || 'generate';
    const isVideo = type === 'video' || modelConfig.model_type === 'video';
    const fileExtension = isVideo ? 'avi' : 'png';

    // Generate unique output path
    const outputFileName = `img_${modelId}_${randomUUID()}.${fileExtension}`;
    const outputPath = path.join(this.tempDir, outputFileName);

    // Add output path to command
    command.push('-o', outputPath);

    logger.debug({ command: command.join(' ') }, 'Executing command');

    // Log the CLI command with generation ID
    const [cmd, ...args] = command;
    logCliCommand(cmd, args, { cwd: PROJECT_ROOT }, generationId);

    try {
      // Execute the CLI command
      const result = await this.executeCommand(command, generationId);

      // Parse output to get the actual image path
      const imagePath = this.parseOutput(result, outputPath);

      // Read the generated image
      const imageBuffer = await fs.readFile(imagePath);

      // Clean up temporary file
      await fs.unlink(imagePath).catch(err => {
        logger.warn({ error: err }, 'Failed to delete temp file');
      });

      return imageBuffer;
    } catch (error) {
      logCliError(error, generationId);
      logger.error({ error }, 'Image generation failed');
      throw new Error(`CLI generation failed: ${error.message}`);
    }
  }

  /**
   * Build CLI command array from model configuration and parameters
   * @param {Object} modelConfig - Model configuration
   * @param {string} modelConfig.command - Command to execute (e.g., "./build/bin/sd")
   * @param {string[]} [modelConfig.args] - Base arguments from config
   * @param {string} [modelConfig.model_type] - Model type ('image', 'video', etc.)
   * @param {Object} params - Generation parameters
   * @returns {string[]} Command and arguments array
   */
  buildCommand(modelConfig, params) {
    const cmd = [modelConfig.command];

    // Add base arguments from model configuration
    if (modelConfig.args && Array.isArray(modelConfig.args)) {
      cmd.push(...modelConfig.args);
    }

    // Parse and validate parameters
    const prompt = params.prompt || '';
    const negativePrompt = params.negative_prompt || '';
    const size = params.size || '1024x1024';
    const seed = params.seed ?? generateRandomSeed();
    const quality = params.quality; // Don't default to 'medium' - let sample_steps or model default take precedence
    const style = params.style;
    const n = params.n || 1;
    const type = params.type || 'generate'; // 'generate', 'edit', 'variation', 'video'
    const isVideo = type === 'video' || modelConfig.model_type === 'video';

    // Parse dimensions
    const { width, height } = parseSize(size);

    // Video-specific parameters
    if (isVideo) {
      // Video frames (default 33 for ~1 second at 24fps)
      const videoFrames = params.video_frames ?? 33;
      cmd.push('--video-frames', videoFrames.toString());

      // Video FPS (default 24)
      const videoFps = params.video_fps ?? 24;
      cmd.push('--fps', videoFps.toString());

      // Flow shift (Wan-specific)
      if (params.flow_shift !== undefined) {
        cmd.push('--flow-shift', params.flow_shift.toString());
      }

      // End image for FLF2V (First-Last Frame to Video)
      if (params.end_image_path) {
        cmd.push('--end-img', params.end_image_path);
      }
    }

    // For img2img (variation) mode or video with init image, add input image and strength
    if ((type === 'variation' || type === 'edit') || (isVideo && params.input_image_path)) {
      if (params.input_image_path) {
        cmd.push('--init-img', params.input_image_path);

        // Add strength parameter for variation mode (not for video)
        if (type === 'variation') {
          const strength = params.strength !== undefined ? params.strength : 0.75;
          cmd.push('--strength', String(strength));
        }
      }
    }

    // Build CLI arguments
    // Note: Argument format depends on SD-CPP version and model type
    // These are common arguments for SD-CPP CLI

    // Prompt argument
    if (prompt) {
      cmd.push('-p', prompt);
    }

    // Negative prompt
    if (negativePrompt) {
      cmd.push('-n', negativePrompt);
    }

    // Output dimensions
    cmd.push('-W', width.toString());
    cmd.push('-H', height.toString());

    // Seed
    cmd.push('--seed', seed.toString());

    // Determine sampling steps:
    // 1. If sample_steps is explicitly provided, use it
    // 2. Otherwise, if quality is provided, map quality to steps
    // 3. Otherwise, use default (undefined, let SD.cpp decide)
    let steps;
    if (params.sample_steps !== undefined) {
      steps = params.sample_steps;
    } else if (quality !== undefined && quality !== null && quality !== '') {
      steps = mapQualityToSteps(quality);
    }
    // Only add --steps if we have a value
    if (steps !== undefined) {
      cmd.push('--steps', steps.toString());
    }

    // Number of images
    if (n > 1) {
      cmd.push('--count', n.toString());
    }

    // Style preset
    if (style) {
      const styleArgs = mapStyleToArgs(style);
      cmd.push(...styleArgs);
    }

    // SD.cpp Advanced Settings (use params if provided, otherwise use defaults)
    const cfgScale = params.cfg_scale ?? 7.0;
    cmd.push('--cfg-scale', cfgScale.toString());

    const samplingMethod = params.sampling_method ?? 'euler';
    cmd.push('--sampling-method', samplingMethod);

    // CLIP skip (if provided)
    if (params.clip_skip !== undefined && params.clip_skip !== -1) {
      cmd.push('--clip-skip', params.clip_skip.toString());
    }

    return cmd;
  }

  /**
   * Execute a CLI command and capture output
   * @param {string[]} command - Command array
   * @param {string} [generationId] - Optional generation ID for logging
   * @returns {Promise<string>} Combined stdout and stderr output
   * @private
   */
  executeCommand(command, generationId = null) {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command;

      // Get SD.cpp logger with generation context
      const sdCppLogger = getSdCppLogger(generationId);

      const child = spawn(cmd, args, {
        cwd: PROJECT_ROOT,  // Set working directory to project root so relative paths resolve correctly
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      // Log each line of stdout with generation_id
      child.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;

        // Log each line with generation_id
        const lines = text.split('\n').filter(line => line.trim());
        for (const line of lines) {
          sdCppLogger.info({ stdout: line }, line);
        }
      });

      // Log each line of stderr with generation_id
      child.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;

        // Log each line with generation_id
        const lines = text.split('\n').filter(line => line.trim());
        for (const line of lines) {
          sdCppLogger.warn({ stderr: line }, line);
        }
      });

      child.on('close', (code) => {
        // Log CLI output with generation ID (summary)
        logCliOutput(stdout, stderr, code, generationId);

        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          reject(new Error(
            `Command failed with exit code ${code}\n` +
            `Command: ${command.join(' ')}\n` +
            `stderr: ${stderr}`
          ));
        }
      });

      child.on('error', (error) => {
        logCliError(error, generationId);
        reject(new Error(
          `Failed to spawn command: ${error.message}\n` +
          `Command: ${command.join(' ')}`
        ));
      });

      // Set timeout for command execution (default 5 minutes)
      const timeout = 5 * 60 * 1000;
      const timeoutHandle = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timeout after ${timeout}ms`));
      }, timeout);

      child.on('close', () => {
        clearTimeout(timeoutHandle);
      });
    });
  }

  /**
   * Parse CLI output to extract the generated image/video path
   * @param {string} output - Combined stdout/stderr from CLI
   * @param {string} fallbackPath - Default path if parsing fails
   * @returns {string} Path to the generated image/video
   */
  parseOutput(output, fallbackPath) {
    // SD-CPP CLI typically outputs the image/video path in various formats:
    // - "Saved image to: /path/to/image.png"
    // - "Output: /path/to/image.png"
    // - "/path/to/image.png"
    // - "Writing to /path/to/image.png"
    // - For video: .avi extension

    const patterns = [
      /Saved image to:\s*(.+?)(?:\r?\n|$)/i,
      /Output:\s*(.+?)(?:\r?\n|$)/i,
      /Writing to\s+(.+?)(?:\r?\n|$)/i,
      /Generated:\s*(.+?)(?:\r?\n|$)/i,
      // Last resort: any absolute path ending in .png, .avi, .mp4, .webm
      /^(\/.+?\.(?:png|avi|mp4|webm))$/m,
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        const outputPath = match[1].trim();
        logger.debug({ outputPath }, 'Parsed output path');
        return outputPath;
      }
    }

    // If no pattern matches, use the fallback path
    logger.warn({ fallbackPath }, 'Could not parse output path from output, using fallback');
    return fallbackPath;
  }

  /**
   * Generate multiple images using CLI mode (for n > 1)
   * @param {string} modelId - Model identifier
   * @param {Object} params - Generation parameters
   * @param {Object} modelConfig - Model configuration
   * @returns {Promise<Buffer[]>} Array of generated images as Buffers
   */
  async generateMultipleImages(modelId, params, modelConfig) {
    const n = params.n || 1;
    const images = [];

    // For CLI mode, we may need to run multiple commands
    // or use the --count parameter if supported
    if (n > 1) {
      // Try using count parameter first
      try {
        const result = await this.generateImage(modelId, { ...params, n }, modelConfig);

        // If the CLI generated multiple files, handle them here
        // For now, return single image
        images.push(result);
      } catch (error) {
        logger.error({ error }, 'Batch generation failed');
        throw error;
      }
    } else {
      const image = await this.generateImage(modelId, params, modelConfig);
      images.push(image);
    }

    return images;
  }

  /**
   * Check if CLI is available for a given model
   * @param {Object} modelConfig - Model configuration
   * @returns {Promise<boolean>} True if CLI command is executable
   */
  async isCLIAvailable(modelConfig) {
    const [cmd] = modelConfig.command.split(' ');

    return new Promise((resolve) => {
      const child = spawn(cmd, ['--version'], {
        stdio: 'ignore',
        env: process.env,
      });

      child.on('close', (code) => {
        resolve(code === 0);
      });

      child.on('error', () => {
        resolve(false);
      });

      // Timeout after 2 seconds
      setTimeout(() => {
        child.kill();
        resolve(false);
      }, 2000);
    });
  }

  /**
   * Get CLI version information
   * @param {Object} modelConfig - Model configuration
   * @returns {Promise<string>} Version string or error message
   */
  async getCLIVersion(modelConfig) {
    return new Promise((resolve) => {
      const [cmd, ...args] = modelConfig.command.split(' ');

      const child = spawn(cmd, [...args, '--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', () => {
        resolve(stdout || stderr || 'Unknown version');
      });

      child.on('error', (error) => {
        resolve(`Error: ${error.message}`);
      });

      setTimeout(() => {
        child.kill();
        resolve('Timeout');
      }, 5000);
    });
  }
}

// Export singleton instance
export const cliHandler = new CLIHandler();

// Export class for testing
export default CLIHandler;
