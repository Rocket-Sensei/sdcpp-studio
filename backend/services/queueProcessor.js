import { getNextPendingGeneration, updateGenerationStatus, updateGenerationProgress, deleteGeneration, GenerationStatus, createGeneratedImage } from '../db/queries.js';
import { generateImageDirect } from './imageService.js';
import { randomUUID } from 'crypto';
import { getModelManager, ExecMode, ModelStatus } from './modelManager.js';
import { cliHandler } from './cliHandler.js';
import { readFile } from 'fs/promises';
import { loggedFetch } from '../utils/logger.js';
import { broadcastQueueEvent, broadcastGenerationComplete } from './websocket.js';

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

  const job = getNextPendingGeneration();
  if (!job) {
    return;
  }

  isProcessing = true;
  currentJob = job;

  console.log(`Processing job ${job.id}: ${job.prompt?.substring(0, 50)}...`);

  try {
    // Update status to processing
    updateGenerationStatus(job.id, GenerationStatus.PROCESSING);
    broadcastQueueEvent({ ...job, status: GenerationStatus.PROCESSING }, 'job_updated');

    // Get model configuration
    // Use type-specific default if no model specified
    let modelId = job.model;
    if (!modelId) {
      const defaultModel = modelManager.getDefaultModelForType(job.type);
      modelId = defaultModel?.id || modelManager.defaultModelId;
    }
    if (!modelId) {
      throw new Error('No model specified and no default model configured');
    }

    const modelConfig = modelManager.getModel(modelId);
    if (!modelConfig) {
      throw new Error(`Model not found: ${modelId}`);
    }

    console.log(`[QueueProcessor] Using model: ${modelId} (${modelConfig.name}), exec_mode: ${modelConfig.exec_mode}`);

    // Prepare model based on execution mode
    if (modelConfig.exec_mode === ExecMode.SERVER) {
      // For server mode, stop conflicting servers and start the required one
      await prepareModelForJob(modelId, job.id);
    } else if (modelConfig.exec_mode === ExecMode.CLI) {
      // For CLI mode, stop any running servers (they're not needed)
      await stopAllServerModels();
      console.log(`[QueueProcessor] Model ${modelId} uses CLI mode`);
    } else if (modelConfig.exec_mode === ExecMode.API) {
      // For API mode, stop any running servers (external API is used)
      await stopAllServerModels();
      console.log(`[QueueProcessor] Model ${modelId} uses external API mode`);
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

    // Update status to completed (generation_id is now the same as job.id)
    updateGenerationStatus(job.id, GenerationStatus.COMPLETED);

    // Broadcast completion events
    broadcastQueueEvent({ ...job, status: GenerationStatus.COMPLETED }, 'job_completed');
    broadcastGenerationComplete({
      id: job.id,
      status: GenerationStatus.COMPLETED,
      type: job.type,
      prompt: job.prompt,
      created_at: job.created_at,
      imageCount: result?.imageCount || 0,
    });

    console.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    updateGenerationStatus(job.id, GenerationStatus.FAILED, {
      error: error.message,
    });
    broadcastQueueEvent({ ...job, status: GenerationStatus.FAILED, error: error.message }, 'job_failed');
  } finally {
    isProcessing = false;
    currentJob = null;
  }
}

/**
 * Stop all running server models
 * Used when switching to CLI or API mode, or when a conflicting server is running
 * @returns {Promise<void>}
 */
async function stopAllServerModels() {
  const runningModels = modelManager.getRunningModels();
  if (runningModels.length === 0) {
    return;
  }

  console.log(`[QueueProcessor] Stopping ${runningModels.length} running server model(s)...`);

  for (const model of runningModels) {
    try {
      console.log(`[QueueProcessor] Stopping model: ${model.id}`);
      await modelManager.stopModel(model.id);
    } catch (error) {
      console.warn(`[QueueProcessor] Failed to stop model ${model.id}:`, error.message);
    }
  }

  console.log(`[QueueProcessor] All server models stopped`);
}

/**
 * Prepare a model for a job - stop conflicting servers and start the required one
 * @param {string} modelId - Model identifier to prepare
 * @param {string} jobId - Job ID for progress updates
 * @returns {Promise<void>}
 */
async function prepareModelForJob(modelId, jobId) {
  // Check if model is already running
  if (modelManager.isModelRunning(modelId)) {
    console.log(`[QueueProcessor] Model ${modelId} is already running`);
    return;
  }

  // Stop any other running server models (only one server at a time)
  await stopAllServerModels();

  console.log(`[QueueProcessor] Model ${modelId} not running, starting...`);
  updateGenerationProgress(jobId, 0.05, `Starting model: ${modelId}...`);

  try {
    // Start the model
    const processEntry = await modelManager.startModel(modelId);

    // Wait for server to be ready
    updateGenerationProgress(jobId, 0.1, `Waiting for model server to be ready...`);

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
 * Checks /v1/models endpoint to verify the model is loaded and server is ready
 * @param {string} apiUrl - API base URL (e.g., http://127.0.0.1:1236/v1)
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<void>}
 */
async function waitForServerReady(apiUrl, timeout = 30000) {
  const startTime = Date.now();
  const checkInterval = 1000;

  // Build the models endpoint URL
  const modelsUrl = apiUrl.endsWith('/') ? `${apiUrl}models` : `${apiUrl}/models`;

  while (Date.now() - startTime < timeout) {
    try {
      // Check /v1/models endpoint - sdcpp returns list of models when loaded
      const response = await loggedFetch(modelsUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        // Optionally verify response contains model data
        const data = await response.json();
        if (data.object === 'list' && Array.isArray(data.data)) {
          console.log(`[QueueProcessor] Server at ${apiUrl} is ready (${data.data.length} model(s) available)`);
        } else {
          console.log(`[QueueProcessor] Server at ${apiUrl} is ready`);
        }
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
  updateGenerationProgress(job.id, 0.15, 'Preparing generation parameters...');

  // Get model-specific default parameters (if any)
  const modelParams = modelManager.getModelGenerationParams(modelId);

  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n,
    quality: job.quality,
    style: job.style,
    // SD.cpp Advanced Settings - use job values, fallback to model defaults, then undefined
    cfg_scale: job.cfg_scale ?? modelParams?.cfg_scale ?? undefined,
    sampling_method: job.sampling_method ?? modelParams?.sampling_method ?? undefined,
    sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
    clip_skip: job.clip_skip ?? modelParams?.clip_skip ?? undefined,
  };

  updateGenerationProgress(job.id, 0.25, 'Generating image...');

  let response;
  // Use job.id as generation_id since queue is now merged into generations
  const generationId = job.id;

  if (modelConfig.exec_mode === ExecMode.CLI) {
    // Use CLI handler for CLI mode models
    console.log(`[QueueProcessor] Using CLI mode for ${modelId}`);
    response = await processCLIGeneration(job, modelConfig, params);
  } else if (modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.API) {
    // Use HTTP API for server mode (local) or API mode (external)
    const apiType = modelConfig.exec_mode === ExecMode.API ? 'external' : 'local';
    console.log(`[QueueProcessor] Using ${apiType} HTTP API for ${modelId} at ${modelConfig.api}`);
    response = await processHTTPGeneration(job, modelConfig, params);
  } else {
    throw new Error(`Unknown execution mode: ${modelConfig.exec_mode}`);
  }

  updateGenerationProgress(job.id, 0.7, 'Saving generation record...');
  // Generation record already exists (created when queued), just save images
  updateGenerationProgress(job.id, 0.85, 'Saving images...');

  let imageCount = 0;

  // Save images
  if (response.data && response.data.length > 0) {
    imageCount = response.data.length;
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

  return { generationId, imageCount };
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

  // Add SD.cpp advanced settings from params if not already in extraArgs
  if (params.cfg_scale !== undefined && extraArgs.cfg_scale === undefined) {
    extraArgs.cfg_scale = params.cfg_scale;
  }
  if (params.sampling_method !== undefined && extraArgs.sampling_method === undefined) {
    extraArgs.sampling_method = params.sampling_method;
  }
  if (params.sample_steps !== undefined && extraArgs.sample_steps === undefined) {
    extraArgs.sample_steps = params.sample_steps;
  }
  if (params.clip_skip !== undefined && extraArgs.clip_skip === undefined) {
    extraArgs.clip_skip = params.clip_skip;
  }
  // Use seed from params if provided, otherwise use existing extraArgs.seed, or generate random
  if (params.seed !== null && params.seed !== undefined) {
    extraArgs.seed = params.seed;
  } else if (!extraArgs.seed) {
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

  // For API mode, use the actual model name for external API
  // For server mode, use the internal ID
  const modelName = modelConfig.exec_mode === ExecMode.API
    ? modelConfig.name
    : modelConfig.id;

  const requestBody = {
    model: modelName,
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

  // Build headers - add API key if configured
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add Authorization header if API key is configured
  if (modelConfig.api_key) {
    headers['Authorization'] = `Bearer ${modelConfig.api_key}`;
    console.log(`[QueueProcessor] Using API key for authentication`);
  }

  const response = await loggedFetch(endpoint, {
    method: 'POST',
    headers,
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

  // Check if input image path is provided
  if (!job.input_image_path) {
    throw new Error('Edit job requires input_image_path');
  }

  // Update progress
  updateGenerationProgress(job.id, 0.15, 'Loading input image...');

  // Load the input image from disk
  const imageBuffer = await readFile(job.input_image_path);

  // Get model-specific default parameters (if any)
  const modelParams = modelManager.getModelGenerationParams(modelId);

  // Prepare params for generateImageDirect
  const params = {
    model: modelId,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n || 1,
    image: {
      buffer: imageBuffer,
      mimetype: job.input_image_mime_type || 'image/png'
    },
    // SD.cpp Advanced Settings - use job values, fallback to model defaults, then undefined
    cfg_scale: job.cfg_scale ?? modelParams?.cfg_scale ?? undefined,
    sampling_method: job.sampling_method ?? modelParams?.sampling_method ?? undefined,
    sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
    clip_skip: job.clip_skip ?? modelParams?.clip_skip ?? undefined,
  };

  // Load mask if provided
  if (job.mask_image_path) {
    params.mask = {
      buffer: await readFile(job.mask_image_path),
      mimetype: job.mask_image_mime_type || 'image/png'
    };
  }

  updateGenerationProgress(job.id, 0.25, 'Generating edit...');

  let response;
  // Use job.id as generation_id since queue is now merged into generations
  const generationId = job.id;

  // Note: CLI mode support for edit/variation may be limited
  // depending on sdcpp CLI capabilities
  if (modelConfig.exec_mode === ExecMode.CLI) {
    // For CLI mode, fall back to generate for now
    // Full implementation would need CLI-specific edit handling
    console.warn(`[QueueProcessor] Edit mode with CLI not fully supported, using generate`);
    response = await processCLIGeneration(job, modelConfig, params);
  } else if (modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.API) {
    // Use generateImageDirect for edit mode with FormData
    const apiType = modelConfig.exec_mode === ExecMode.API ? 'external' : 'local';
    console.log(`[QueueProcessor] Using ${apiType} HTTP API for edit at ${modelConfig.api}`);
    response = await generateImageDirect(params, 'edit');
  } else {
    throw new Error(`Unknown execution mode: ${modelConfig.exec_mode}`);
  }

  updateGenerationProgress(job.id, 0.7, 'Saving generation record...');
  // Generation record already exists (created when queued), just save images
  updateGenerationProgress(job.id, 0.85, 'Saving images...');

  let imageCount = 0;

  if (response.data && response.data.length > 0) {
    imageCount = response.data.length;
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

  return { generationId, imageCount };
}

/**
 * Process a variation job
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @returns {Promise<Object>} Result with generationId
 */
async function processVariationJob(job, modelConfig) {
  const modelId = modelConfig.id;

  // Check if input image path is provided
  if (!job.input_image_path) {
    throw new Error('Variation job requires input_image_path');
  }

  // Update progress
  updateGenerationProgress(job.id, 0.15, 'Loading input image...');

  // Load the input image from disk
  const imageBuffer = await readFile(job.input_image_path);

  // Get model-specific default parameters (if any)
  const modelParams = modelManager.getModelGenerationParams(modelId);

  // Prepare params for generateImageDirect
  const params = {
    model: modelId,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n || 1,
    image: {
      buffer: imageBuffer,
      mimetype: job.input_image_mime_type || 'image/png'
    },
    // SD.cpp Advanced Settings - use job values, fallback to model defaults, then undefined
    cfg_scale: job.cfg_scale ?? modelParams?.cfg_scale ?? undefined,
    sampling_method: job.sampling_method ?? modelParams?.sampling_method ?? undefined,
    sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
    clip_skip: job.clip_skip ?? modelParams?.clip_skip ?? undefined,
  };

  updateGenerationProgress(job.id, 0.25, 'Generating variation...');

  let response;
  // Use job.id as generation_id since queue is now merged into generations
  const generationId = job.id;

  // Note: CLI mode support for edit/variation may be limited
  // depending on sdcpp CLI capabilities
  if (modelConfig.exec_mode === ExecMode.CLI) {
    // For CLI mode, fall back to generate for now
    // Full implementation would need CLI-specific variation handling
    console.warn(`[QueueProcessor] Variation mode with CLI not fully supported, using generate`);
    response = await processCLIGeneration(job, modelConfig, params);
  } else if (modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.API) {
    // Use generateImageDirect for variation mode with FormData
    const apiType = modelConfig.exec_mode === ExecMode.API ? 'external' : 'local';
    console.log(`[QueueProcessor] Using ${apiType} HTTP API for variation at ${modelConfig.api}`);
    response = await generateImageDirect(params, 'variation');
  } else {
    throw new Error(`Unknown execution mode: ${modelConfig.exec_mode}`);
  }

  updateGenerationProgress(job.id, 0.7, 'Saving generation record...');
  // Generation record already exists (created when queued), just save images
  updateGenerationProgress(job.id, 0.85, 'Saving images...');

  let imageCount = 0;

  if (response.data && response.data.length > 0) {
    imageCount = response.data.length;
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

  return { generationId, imageCount };
}
