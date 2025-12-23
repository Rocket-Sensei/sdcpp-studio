import { getNextPendingJob, updateJobStatus, updateJobProgress, deleteJob, QueueStatus } from '../db/queueQueries.js';
import { generateImageDirect } from './imageService.js';
import { createGeneration, createGeneratedImage } from '../db/queries.js';
import { randomUUID } from 'crypto';
import { getModelManager, ExecMode, ModelStatus } from './modelManager.js';
import { cliHandler } from './cliHandler.js';

let isProcessing = false;
let currentJob = null;
let pollInterval = null;

// Initialize model manager singleton
const modelManager = getModelManager();

/**
 * Start the queue processor
 */
export function startQueueProcessor(intervalMs = 1000) {
  if (pollInterval) {
    console.log('Queue processor already running');
    return;
  }

  console.log('Starting queue processor...');

  // Ensure model config is loaded
  try {
    if (!modelManager.configLoaded) {
      modelManager.loadConfig();
    }
  } catch (error) {
    console.warn('Failed to load model config:', error.message);
    // Continue anyway - will handle model lookup failures per job
  }

  processQueue();

  pollInterval = setInterval(processQueue, intervalMs);
}

/**
 * Stop the queue processor
 */
export function stopQueueProcessor() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('Queue processor stopped');
  }
}

/**
 * Get current job being processed
 */
export function getCurrentJob() {
  return currentJob;
}

/**
 * Process the next job in the queue
 */
async function processQueue() {
  // Don't start if already processing a job
  if (isProcessing) {
    return;
  }

  const job = getNextPendingJob();
  if (!job) {
    return;
  }

  isProcessing = true;
  currentJob = job;

  console.log(`Processing job ${job.id}: ${job.prompt?.substring(0, 50)}...`);

  try {
    // Update status to processing
    updateJobStatus(job.id, QueueStatus.PROCESSING);

    // Get model configuration
    const modelId = job.model || modelManager.defaultModelId;
    if (!modelId) {
      throw new Error('No model specified and no default model configured');
    }

    const modelConfig = modelManager.getModel(modelId);
    if (!modelConfig) {
      throw new Error(`Model not found: ${modelId}`);
    }

    console.log(`[QueueProcessor] Using model: ${modelId} (${modelConfig.name})`);

    // Prepare model based on execution mode
    if (modelConfig.exec_mode === ExecMode.SERVER) {
      // For server mode, ensure model is running
      await prepareServerModel(modelId, job.id);
    } else if (modelConfig.exec_mode === ExecMode.CLI) {
      // For CLI mode, we don't need to start a server
      console.log(`[QueueProcessor] Model ${modelId} uses CLI mode`);
    }

    // Process the job based on type
    let result;
    switch (job.type) {
      case 'generate':
        result = await processGenerateJob(job, modelConfig);
        break;
      case 'edit':
        result = await processEditJob(job, modelConfig);
        break;
      case 'variation':
        result = await processVariationJob(job, modelConfig);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    // Update status to completed
    updateJobStatus(job.id, QueueStatus.COMPLETED, {
      generation_id: result.generationId,
    });

    console.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    updateJobStatus(job.id, QueueStatus.FAILED, {
      error: error.message,
    });
  } finally {
    isProcessing = false;
    currentJob = null;
  }
}

/**
 * Prepare a server model for use (start if not running)
 * @param {string} modelId - Model identifier
 * @param {string} jobId - Job ID for progress updates
 * @returns {Promise<void>}
 */
async function prepareServerModel(modelId, jobId) {
  // Check if model is already running
  if (modelManager.isModelRunning(modelId)) {
    console.log(`[QueueProcessor] Model ${modelId} is already running`);
    return;
  }

  console.log(`[QueueProcessor] Model ${modelId} not running, starting...`);
  updateJobProgress(jobId, 0.05, `Starting model: ${modelId}...`);

  try {
    // Start the model
    const processEntry = await modelManager.startModel(modelId);

    // Wait for server to be ready
    updateJobProgress(jobId, 0.1, `Waiting for model server to be ready...`);

    // The startModel already waits for ready, but we'll verify
    const maxWait = 60000; // 60 seconds max
    const startTime = Date.now();
    let checkInterval = 500;

    while (Date.now() - startTime < maxWait) {
      const status = modelManager.getModelStatus(modelId);
      if (status.status === ModelStatus.RUNNING) {
        console.log(`[QueueProcessor] Model ${modelId} is now running on port ${status.port}`);
        return;
      }
      if (status.status === ModelStatus.ERROR) {
        throw new Error(`Model ${modelId} failed to start: ${status.error || 'Unknown error'}`);
      }
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error(`Model ${modelId} failed to start within timeout period`);

  } catch (error) {
    console.error(`[QueueProcessor] Failed to start model ${modelId}:`, error);
    throw new Error(`Model startup failed: ${error.message}`);
  }
}

/**
 * Wait for server to be ready via HTTP health check
 * @param {string} apiUrl - API base URL
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function waitForServerReady(apiUrl, timeout = 30000) {
  const startTime = Date.now();
  const checkInterval = 1000;

  while (Date.now() - startTime < timeout) {
    try {
      // Try to reach a health endpoint or just the base API
      const response = await fetch(apiUrl.replace(/\/v1$/, '') || apiUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        console.log(`[QueueProcessor] Server at ${apiUrl} is ready`);
        return;
      }
    } catch (error) {
      // Connection not ready yet, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }

  throw new Error(`Server at ${apiUrl} did not become ready within ${timeout}ms`);
}

/**
 * Process a text-to-image generation job
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @returns {Promise<Object>} Result with generationId
 */
async function processGenerateJob(job, modelConfig) {
  const modelId = modelConfig.id;

  // Update progress
  updateJobProgress(job.id, 0.15, 'Preparing generation parameters...');

  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n,
    quality: job.quality,
    style: job.style,
  };

  updateJobProgress(job.id, 0.25, 'Generating image...');

  let response;
  const generationId = randomUUID();

  if (modelConfig.exec_mode === ExecMode.CLI) {
    // Use CLI handler for CLI mode models
    console.log(`[QueueProcessor] Using CLI mode for ${modelId}`);
    response = await processCLIGeneration(job, modelConfig, params);
  } else {
    // Use HTTP API for server mode models
    console.log(`[QueueProcessor] Using HTTP API for ${modelId} at ${modelConfig.api}`);
    response = await processHTTPGeneration(job, modelConfig, params);
  }

  updateJobProgress(job.id, 0.7, 'Saving generation record...');

  // Create generation record
  await createGeneration({
    id: generationId,
    type: 'generate',
    model: modelId,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed,
    n: job.n,
    quality: job.quality,
    style: job.style,
    response_format: 'b64_json',
    user_id: job.user_id || null,
    source_image_id: job.source_image_id || null,
  });

  updateJobProgress(job.id, 0.85, 'Saving images...');

  // Save images
  if (response.data && response.data.length > 0) {
    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const imageId = randomUUID();

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        index_in_batch: i,
        image_data: Buffer.from(imageData.b64_json, 'base64'),
        mime_type: 'image/png',
        width: null, // Will be populated if available
        height: null,
        revised_prompt: imageData.revised_prompt,
      });
    }
  }

  return { generationId };
}

/**
 * Process generation using HTTP API (server mode)
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} API response
 */
async function processHTTPGeneration(job, modelConfig, params) {
  // Build the request with model-specific API endpoint
  // Replace localhost with 127.0.0.1 to avoid IPv6 issues with Node.js fetch
  const apiUrl = modelConfig.api.replace('localhost', '127.0.0.1');

  // Parse SD-specific extra args from prompt
  let processedPrompt = params.prompt || '';
  let extraArgs = {};

  const extraArgsMatch = processedPrompt.match(/<sd_cpp_extra_args>(.*?)<\/sd_cpp_extra_args>/s);
  if (extraArgsMatch) {
    try {
      extraArgs = JSON.parse(extraArgsMatch[1]);
      processedPrompt = processedPrompt.replace(/<sd_cpp_extra_args>.*?<\/sd_cpp_extra_args>/s, '').trim();
    } catch (e) {
      console.error('Failed to parse extra args:', e);
    }
  }

  // Generate random seed if not provided
  if (!extraArgs.seed) {
    extraArgs.seed = Math.floor(Math.random() * 4294967295);
  }

  // Reconstruct prompt with extra args
  const finalPrompt = `${processedPrompt}<sd_cpp_extra_args>${JSON.stringify(extraArgs)}</sd_cpp_extra_args>`;

  // Extract negative prompt if present
  let negativePrompt = params.negative_prompt || '';
  const negPromptMatch = processedPrompt.match(/<negative_prompt>(.*?)<\/negative_prompt>/s);
  if (negPromptMatch) {
    negativePrompt = negPromptMatch[1];
  }

  // Build prompt string with negative prompt if present
  let promptString = finalPrompt;
  if (negativePrompt) {
    promptString = `${finalPrompt}<negative_prompt>${negativePrompt}</negative_prompt>`;
  }

  const requestBody = {
    model: modelConfig.id,
    prompt: promptString,
    n: params.n || 1,
    size: params.size || '512x512',
    response_format: 'b64_json'
  };

  // Add optional parameters
  if (params.quality) requestBody.quality = params.quality;
  if (params.style) requestBody.style = params.style;

  const endpoint = `${apiUrl}/images/generations`;

  console.log(`[QueueProcessor] Making request to: ${endpoint}`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

/**
 * Process generation using CLI (CLI mode)
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} Response in same format as HTTP API
 */
async function processCLIGeneration(job, modelConfig, params) {
  try {
    console.log(`[QueueProcessor] Generating with CLI for model: ${modelConfig.id}`);

    // Use CLI handler to generate image
    const imageBuffer = await cliHandler.generateImage(modelConfig.id, params, modelConfig);

    // Convert to same format as HTTP API response
    const b64Json = imageBuffer.toString('base64');

    return {
      created: Math.floor(Date.now() / 1000),
      data: [{
        b64_json: b64Json,
        revised_prompt: null
      }]
    };
  } catch (error) {
    console.error(`[QueueProcessor] CLI generation failed:`, error);
    throw new Error(`CLI generation failed: ${error.message}`);
  }
}

/**
 * Process an image-to-image edit job
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @returns {Promise<Object>} Result with generationId
 */
async function processEditJob(job, modelConfig) {
  const modelId = modelConfig.id;

  // Update progress
  updateJobProgress(job.id, 0.15, 'Preparing edit parameters...');

  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n || 1,
  };

  updateJobProgress(job.id, 0.25, 'Generating edit...');

  let response;
  const generationId = randomUUID();

  // Note: CLI mode support for edit/variation may be limited
  // depending on sdcpp CLI capabilities
  if (modelConfig.exec_mode === ExecMode.CLI) {
    // For CLI mode, fall back to generate for now
    // Full implementation would need CLI-specific edit handling
    console.warn(`[QueueProcessor] Edit mode with CLI not fully supported, using generate`);
    response = await processCLIGeneration(job, modelConfig, params);
  } else {
    // Use HTTP API for server mode models
    console.log(`[QueueProcessor] Using HTTP API for edit at ${modelConfig.api}`);
    response = await processHTTPGeneration(job, modelConfig, params);
  }

  updateJobProgress(job.id, 0.7, 'Saving generation record...');

  await createGeneration({
    id: generationId,
    type: 'edit',
    model: modelId,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed,
    n: params.n,
    quality: job.quality,
    style: job.style,
    response_format: 'b64_json',
    user_id: job.user_id || null,
    source_image_id: job.source_image_id || null,
  });

  updateJobProgress(job.id, 0.85, 'Saving images...');

  if (response.data && response.data.length > 0) {
    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const imageId = randomUUID();

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        index_in_batch: i,
        image_data: Buffer.from(imageData.b64_json, 'base64'),
        mime_type: 'image/png',
        width: null,
        height: null,
        revised_prompt: imageData.revised_prompt,
      });
    }
  }

  return { generationId };
}

/**
 * Process a variation job
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @returns {Promise<Object>} Result with generationId
 */
async function processVariationJob(job, modelConfig) {
  const modelId = modelConfig.id;

  // Update progress
  updateJobProgress(job.id, 0.15, 'Preparing variation parameters...');

  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n || 1,
  };

  updateJobProgress(job.id, 0.25, 'Generating variation...');

  let response;
  const generationId = randomUUID();

  // Note: CLI mode support for edit/variation may be limited
  // depending on sdcpp CLI capabilities
  if (modelConfig.exec_mode === ExecMode.CLI) {
    // For CLI mode, fall back to generate for now
    // Full implementation would need CLI-specific variation handling
    console.warn(`[QueueProcessor] Variation mode with CLI not fully supported, using generate`);
    response = await processCLIGeneration(job, modelConfig, params);
  } else {
    // Use HTTP API for server mode models
    console.log(`[QueueProcessor] Using HTTP API for variation at ${modelConfig.api}`);
    response = await processHTTPGeneration(job, modelConfig, params);
  }

  updateJobProgress(job.id, 0.7, 'Saving generation record...');

  await createGeneration({
    id: generationId,
    type: 'variation',
    model: modelId,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed,
    n: params.n,
    quality: job.quality,
    style: job.style,
    response_format: 'b64_json',
    user_id: job.user_id || null,
    source_image_id: job.source_image_id || null,
  });

  updateJobProgress(job.id, 0.85, 'Saving images...');

  if (response.data && response.data.length > 0) {
    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const imageId = randomUUID();

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        index_in_batch: i,
        image_data: Buffer.from(imageData.b64_json, 'base64'),
        mime_type: 'image/png',
        width: null,
        height: null,
        revised_prompt: imageData.revised_prompt,
      });
    }
  }

  return { generationId };
}
