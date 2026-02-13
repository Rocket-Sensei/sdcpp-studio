import { claimNextPendingGeneration, claimNextPendingGenerationWithModelAffinity, updateGenerationStatus, updateGenerationProgress, deleteGeneration, GenerationStatus, createGeneratedImage } from '../db/queries.js';
import { generateImageDirect } from './imageService.js';
import { randomUUID } from 'crypto';
import { getModelManager, ExecMode, ModelStatus } from './modelManager.js';
import { cliHandler } from './cliHandler.js';
import { readFile } from 'fs/promises';
import { loggedFetch, createLogger, createGenerationLogger } from '../utils/logger.js';
import { broadcastQueueEvent, broadcastGenerationComplete } from './websocket.js';
import { upscaleImage } from './upscalerService.js';

const logger = createLogger('queueProcessor');

let isProcessing = false;
let currentJob = null;
let currentModelId = null; // Track the model being used for the current job
let currentModelLoadingStartTime = null; // Track when model loading started for current job
let lastRunningModelId = null; // Track the last successfully running model for affinity
let pollInterval = null;

// Initialize model manager singleton
const modelManager = getModelManager();

/**
 * Handle model process exit/crash during generation
 * Fails the current job if the model crashes while processing
 * NOTE: This should NOT reset isProcessing - let the finally block in processQueue handle that
 * to prevent race conditions where a new job starts before the current one is fully cleaned up.
 */
function handleModelProcessExit(modelId, code, signal) {
  logger.warn({ modelId, code, signal }, 'Model process exited');

  // Check if we're currently processing a job with this model
  if (!isProcessing || !currentJob || !currentModelId || currentModelId !== modelId) {
    return;
  }

  // The model crashed during generation - fail the job
  const errorMsg = signal
    ? `Model process crashed (${signal})`
    : `Model process exited unexpectedly (code: ${code || 'unknown'})`;

  logger.error({ jobId: currentJob.id, modelId, error: errorMsg }, 'Failing generation due to model crash');

  // Update job status to failed - this is synchronous, so it will complete before we return
  updateGenerationStatus(currentJob.id, GenerationStatus.FAILED, { error: errorMsg });
  broadcastQueueEvent({ ...currentJob, status: GenerationStatus.FAILED, error: errorMsg }, 'job_failed');

  // Mark that this job should be skipped in the finally block
  // We set currentJob to null to signal that cleanup has already been handled
  currentJob = null;
}

/**
 * Handle model process error
 * NOTE: This should NOT reset isProcessing - let the finally block in processQueue handle that
 * to prevent race conditions where a new job starts before the current one is fully cleaned up.
 */
function handleModelProcessError(modelId, error) {
  logger.error({ modelId, error: error.message }, 'Model process error');

  // Check if we're currently processing a job with this model
  if (!isProcessing || !currentJob || !currentModelId || currentModelId !== modelId) {
    return;
  }

  // The model had an error during generation - fail the job
  const errorMsg = `Model process error: ${error.message}`;

  logger.error({ jobId: currentJob.id, modelId, error: errorMsg }, 'Failing generation due to model error');

  // Update job status to failed - this is synchronous, so it will complete before we return
  updateGenerationStatus(currentJob.id, GenerationStatus.FAILED, { error: errorMsg });
  broadcastQueueEvent({ ...currentJob, status: GenerationStatus.FAILED, error: errorMsg }, 'job_failed');

  // Mark that this job should be skipped in the finally block
  // We set currentJob to null to signal that cleanup has already been handled
  currentJob = null;
}

// Register callbacks with model manager
modelManager.onProcessExit = handleModelProcessExit;
modelManager.onProcessError = handleModelProcessError;

/**
 * Start the queue processor
 */
export function startQueueProcessor(intervalMs = 1000) {
  if (pollInterval) {
    logger.info('Queue processor already running');
    return;
  }

  logger.info('Starting queue processor...');

  // Ensure model config is loaded
  try {
    if (!modelManager.configLoaded) {
      modelManager.loadConfig();
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to load model config');
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
    logger.info('Queue processor stopped');
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

  // Atomically claim the next pending job (marks it as PROCESSING immediately)
  const job = claimNextPendingGeneration();
  if (!job) {
    return;
  }

  isProcessing = true;
  currentJob = job;
  currentModelId = null; // Will be set when model is determined
  currentModelLoadingStartTime = null; // Reset model loading start time
  const startTime = Date.now();
  let modelLoadingTimeMs = 0; // Will be set when model is prepared

  // Create generation-specific logger for this job
  const genLogger = createGenerationLogger(job.id, 'queueProcessor');

  logger.info({ jobId: job.id, prompt: job.prompt?.substring(0, 50) }, 'Processing job');
  genLogger.info({ prompt: job.prompt?.substring(0, 50) }, 'Starting generation');

  try {
    // Process the job based on type
    let result;

    // Upscale jobs don't need model preparation - handle separately
    if (job.type === 'upscale') {
      updateGenerationStatus(job.id, GenerationStatus.PROCESSING, { progress: 0 });
      broadcastQueueEvent({ ...job, status: GenerationStatus.PROCESSING }, 'job_updated');
      result = await processUpscaleJob(job, genLogger);
    } else {
      // Get model configuration
      // Use type-specific default if no model specified
      let modelId = job.model;
      if (!modelId || modelId === 'none') {
        const defaultModel = modelManager.getDefaultModelForType(job.type);
        modelId = defaultModel?.id || modelManager.defaultModelId;
      }
      if (!modelId || modelId === 'none') {
        throw new Error('No model specified and no default model configured');
      }

      const modelConfig = modelManager.getModel(modelId);
      if (!modelConfig) {
        throw new Error(`Model not found: ${modelId}`);
      }

      // Track the current model ID for crash detection
      currentModelId = modelId;

      logger.info({ modelId, modelName: modelConfig.name, execMode: modelConfig.exec_mode }, 'Using model');
      genLogger.info({ modelId, modelName: modelConfig.name, execMode: modelConfig.exec_mode }, 'Using model');

      // Update to MODEL_LOADING state when starting to load the model
      updateGenerationStatus(job.id, GenerationStatus.MODEL_LOADING, {
        progress: 0,
      });
      broadcastQueueEvent({
        ...job,
        status: GenerationStatus.MODEL_LOADING,
        modelId,
        modelName: modelConfig.name
      }, 'job_updated');

      // Prepare model based on execution mode
      if (modelConfig.exec_mode === ExecMode.SERVER) {
        // For server mode, stop conflicting servers and start the required one
        const prepareResult = await prepareModelForJob(modelId, job.id);
        if (!prepareResult) {
          throw new Error(`Failed to prepare model ${modelId}: prepareModelForJob returned undefined`);
        }
        modelLoadingTimeMs = prepareResult.loadingTimeMs;
      } else if (modelConfig.exec_mode === ExecMode.CLI) {
        // For CLI mode, stop any running servers (they're not needed)
        await stopAllServerModels();
        // CLI mode doesn't have model loading overhead (model loads per generation)
        modelLoadingTimeMs = 0;
        logger.info({ modelId }, 'Model uses CLI mode');
        genLogger.info({ modelId }, 'Model uses CLI mode');
      } else if (modelConfig.exec_mode === ExecMode.API) {
        // For API mode, stop any running servers (external API is used)
        await stopAllServerModels();
        // API mode uses external service, no local model loading
        modelLoadingTimeMs = 0;
        logger.info({ modelId }, 'Model uses external API mode');
        genLogger.info({ modelId }, 'Model uses external API mode');
      } else {
        throw new Error(`Unknown or invalid execution mode: ${modelConfig.exec_mode} for model ${modelId}`);
      }

      // Update to PROCESSING state when model is ready and we're about to generate
      updateGenerationStatus(job.id, GenerationStatus.PROCESSING, {
        progress: 0,
      });
      broadcastQueueEvent({
        ...job,
        status: GenerationStatus.PROCESSING,
        modelId,
        modelName: modelConfig.name
      }, 'job_updated');

      // For other job types, proceed with model-based generation
      switch (job.type) {
        case 'generate':
          result = await processGenerateJob(job, modelConfig, genLogger);
          break;
        case 'edit':
          result = await processEditJob(job, modelConfig, genLogger);
          break;
        case 'variation':
          result = await processVariationJob(job, modelConfig, genLogger);
          break;
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }
    }

    // Validate that images were actually generated before marking as completed
    const imageCount = result?.imageCount || 0;
    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;
    const generationTimeMs = totalTimeMs - modelLoadingTimeMs;
    const generationTimeSec = (generationTimeMs / 1000).toFixed(2);

    if (imageCount === 0) {
      // No images were generated - mark as failed
      const errorMsg = 'Generation completed but no images were produced';
      logger.error({
        jobId: job.id,
        imageCount,
        modelLoadingTimeMs,
        generationTimeSec,
        generationTimeMs,
        totalTimeMs,
      }, 'Job failed: no images generated');
      genLogger.error({
        error: errorMsg,
        imageCount,
        modelLoadingTimeMs,
        generationTimeSec,
        generationTimeMs,
        totalTimeMs,
        result: 'failed',
      }, 'Generation failed: no images produced');

      updateGenerationStatus(job.id, GenerationStatus.FAILED, {
        error: errorMsg,
        model_loading_time_ms: modelLoadingTimeMs,
        generation_time_ms: generationTimeMs,
      });
      broadcastQueueEvent({ ...job, status: GenerationStatus.FAILED, error: errorMsg }, 'job_failed');
      return;
    }

    // Update status to completed (generation_id is now the same as job.id)
    updateGenerationStatus(job.id, GenerationStatus.COMPLETED, {
      model_loading_time_ms: modelLoadingTimeMs,
      generation_time_ms: generationTimeMs,
      // Update sample_steps with the actual value used (from model args for server mode, from request for CLI mode)
      sample_steps: result?.actualSteps,
    });

    // Broadcast completion events
    broadcastQueueEvent({ ...job, status: GenerationStatus.COMPLETED }, 'job_completed');
    broadcastGenerationComplete({
      id: job.id,
      status: GenerationStatus.COMPLETED,
      type: job.type,
      prompt: job.prompt,
      created_at: job.created_at,
      imageCount,
    });

    logger.info({
      jobId: job.id,
      imageCount,
      modelLoadingTimeMs,
      generationTimeSec,
      generationTimeMs,
      totalTimeMs,
    }, 'Job completed successfully');
    genLogger.info({
      imageCount,
      modelLoadingTimeMs,
      generationTimeSec,
      generationTimeMs,
      totalTimeMs,
      result: 'completed',
    }, 'Generation completed successfully');
  } catch (error) {
    // Check if the callback already handled the failure (by setting currentJob to null)
    // This prevents double-updating the status
    if (currentJob !== null) {
      // Calculate timing even for failures
      const endTime = Date.now();
      const totalTimeMs = endTime - startTime;
      const generationTimeMs = totalTimeMs - modelLoadingTimeMs;
      const generationTimeSec = (generationTimeMs / 1000).toFixed(2);

      logger.error({
        error: error.message,
        jobId: job.id,
        modelLoadingTimeMs,
        generationTimeSec,
        generationTimeMs,
        totalTimeMs,
      }, 'Job failed');
      genLogger.error({
        error: error.message,
        stack: error.stack,
        modelLoadingTimeMs,
        generationTimeSec,
        generationTimeMs,
        totalTimeMs,
        result: 'failed',
      }, 'Generation failed');

      updateGenerationStatus(job.id, GenerationStatus.FAILED, {
        error: error.message,
        model_loading_time_ms: modelLoadingTimeMs,
        generation_time_ms: generationTimeMs,
      });
      broadcastQueueEvent({ ...job, status: GenerationStatus.FAILED, error: error.message }, 'job_failed');
    }
  } finally {
    // Always reset isProcessing at the end, even if callback handled the failure
    // This ensures the queue can continue processing
    isProcessing = false;
    currentJob = null;
    currentModelId = null;
    currentModelLoadingStartTime = null;
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

  logger.info({ count: runningModels.length }, 'Stopping running server model(s)');

  for (const model of runningModels) {
    try {
      logger.info({ modelId: model.id }, 'Stopping model');
      await modelManager.stopModel(model.id);
    } catch (error) {
      logger.warn({ error, modelId: model.id }, 'Failed to stop model');
    }
  }

  logger.info('All server models stopped');
}

/**
 * Prepare a model for a job - stop conflicting servers and start the required one
 * @param {string} modelId - Model identifier to prepare
 * @param {string} jobId - Job ID for progress updates
 * @returns {Promise<{wasAlreadyRunning: boolean, loadingTimeMs: number}>} Object indicating if model was already running and loading time
 */
async function prepareModelForJob(modelId, jobId) {
  // Check if model is already running
  if (modelManager.isModelRunning(modelId)) {
    logger.info({ modelId }, 'Model is already running');
    return { wasAlreadyRunning: true, loadingTimeMs: 0 };
  }

  // Stop any other running server models (only one server at a time)
  await stopAllServerModels();

  // Double-check after stopping other models - it might have been started by another process
  if (modelManager.isModelRunning(modelId)) {
    logger.info({ modelId }, 'Model became running while stopping others');
    return { wasAlreadyRunning: true, loadingTimeMs: 0 };
  }

  logger.info({ modelId }, 'Model not running, starting...');
  updateGenerationProgress(jobId, 0.05, `Starting model: ${modelId}...`);

  // Record model loading start time
  currentModelLoadingStartTime = Date.now();

  try {
    // Start the model - this waits for the model to be ready via _waitForServerReady
    updateGenerationProgress(jobId, 0.1, `Starting model server: ${modelId}...`);
    const processEntry = await modelManager.startModel(modelId);

    // Verify the model is actually running (defensive check)
    if (!processEntry) {
      throw new Error('startModel returned undefined processEntry');
    }

    // If we get here, the model is running (startModel would have thrown otherwise)
    const loadingTimeMs = Date.now() - currentModelLoadingStartTime;
    logger.info({ modelId, port: processEntry.port, loadingTimeMs }, 'Model is now running');
    return { wasAlreadyRunning: false, loadingTimeMs };

  } catch (error) {
    logger.error({ error, modelId }, 'Failed to start model');
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
          logger.info({ apiUrl, count: data.data.length }, 'Server is ready');
        } else {
          logger.info({ apiUrl }, 'Server is ready');
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
 * @param {Object} genLogger - Generation-specific logger
 * @returns {Promise<Object>} Result with generationId
 */
async function processGenerateJob(job, modelConfig, genLogger) {
  const modelId = modelConfig.id;

  // Update progress
  updateGenerationProgress(job.id, 0.15, 'Preparing generation parameters...');
  genLogger.debug({ progress: 0.15 }, 'Preparing generation parameters');

  // Get model-specific default parameters (if any)
  const modelParams = modelManager.getModelGenerationParams(modelId);

  // For server mode models, parse steps from command line args since they cannot be set via API
  // Server mode SD.cpp requires --steps to be specified at startup, not in HTTP requests
  let actualSteps = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
  if (modelConfig.exec_mode === ExecMode.SERVER) {
    const stepsFromArgs = modelManager.getModelStepsFromArgs(modelId);
    if (stepsFromArgs !== null) {
      actualSteps = stepsFromArgs;
      genLogger.debug({ steps: actualSteps, source: 'command_line_args' }, 'Using steps from model config args for server mode');
    }
  }

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
    sample_steps: actualSteps,
    clip_skip: job.clip_skip ?? modelParams?.clip_skip ?? undefined,
  };

  updateGenerationProgress(job.id, 0.25, 'Generating image...');
  genLogger.info({ params: { ...params, prompt: params.prompt?.substring(0, 50) + '...' } }, 'Starting image generation');

  let response;
  // Use job.id as generation_id since queue is now merged into generations
  const generationId = job.id;

  if (modelConfig.exec_mode === ExecMode.CLI) {
    // Use CLI handler for CLI mode models
    logger.debug({ modelId, execMode: 'CLI' }, 'Using CLI mode for model');
    genLogger.debug({ modelId, execMode: 'CLI' }, 'Using CLI mode for model');
    response = await processCLIGeneration(job, modelConfig, params, genLogger);
  } else if (modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.API) {
    // Use HTTP API for server mode (local) or API mode (external)
    const apiType = modelConfig.exec_mode === ExecMode.API ? 'external' : 'local';
    logger.debug({ modelId, execMode: apiType, api: modelConfig.api }, `Using ${apiType} HTTP API for model`);
    genLogger.debug({ modelId, execMode: apiType, api: modelConfig.api }, `Using ${apiType} HTTP API`);
    response = await processHTTPGeneration(job, modelConfig, params, genLogger);
  } else {
    throw new Error(`Unknown execution mode: ${modelConfig.exec_mode}`);
  }

  updateGenerationProgress(job.id, 0.7, 'Saving generation record...');
  genLogger.debug({ progress: 0.7 }, 'Saving generation record');
  // Generation record already exists (created when queued), just save images
  updateGenerationProgress(job.id, 0.85, 'Saving images...');
  genLogger.debug({ progress: 0.85 }, 'Saving images');

  let imageCount = 0;

  // Save images
  if (response.data && response.data.length > 0) {
    imageCount = response.data.length;
    genLogger.info({ imageCount }, 'Saving generated images');
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

  return { generationId, imageCount, actualSteps };
}

/**
 * Process generation using HTTP API (server mode)
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @param {Object} params - Generation parameters
 * @param {Object} genLogger - Generation-specific logger
 * @returns {Promise<Object>} API response
 */
async function processHTTPGeneration(job, modelConfig, params, genLogger) {
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
      logger.error({ error: e }, 'Failed to parse extra args');
      genLogger.error({ error: e }, 'Failed to parse extra args');
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

  // Add SD.cpp advanced settings to request body
  // These are passed as separate JSON fields for the sd-server API
  if (params.cfg_scale !== undefined) requestBody.cfg_scale = params.cfg_scale;
  if (params.sampling_method !== undefined) requestBody.sampling_method = params.sampling_method;
  if (params.sample_steps !== undefined) requestBody.steps = params.sample_steps; // Note: sd-server uses 'steps' not 'sample_steps'
  if (params.clip_skip !== undefined && params.clip_skip !== -1) requestBody.clip_skip = params.clip_skip;

  const endpoint = `${apiUrl}/images/generations`;

  logger.debug({ endpoint }, 'Making request to API');
  genLogger.debug({ endpoint, modelName }, 'Making HTTP API request');

  // Build headers - add API key if configured
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add Authorization header if API key is configured
  if (modelConfig.api_key) {
    headers['Authorization'] = `Bearer ${modelConfig.api_key}`;
    logger.debug('Using API key for authentication');
    genLogger.debug('Using API key for authentication');
  }

  const response = await loggedFetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    genLogger.error({ status: response.status, error: errorText }, 'API request failed');
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  genLogger.info('HTTP API request completed successfully');
  return await response.json();
}

/**
 * Process generation using CLI (CLI mode)
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @param {Object} params - Generation parameters
 * @param {Object} genLogger - Generation-specific logger
 * @returns {Promise<Object>} Response in same format as HTTP API
 */
async function processCLIGeneration(job, modelConfig, params, genLogger) {
  try {
    logger.info({ modelId: modelConfig.id }, 'Generating with CLI');
    genLogger.info({ modelId: modelConfig.id }, 'Starting CLI generation');

    // Use CLI handler to generate image, passing generation ID for logging
    const imageBuffer = await cliHandler.generateImage(modelConfig.id, params, modelConfig, job.id);

    // Convert to same format as HTTP API response
    const b64Json = imageBuffer.toString('base64');

    genLogger.info('CLI generation completed successfully');
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{
        b64_json: b64Json,
        revised_prompt: null
      }]
    };
  } catch (error) {
    logger.error({ error }, 'CLI generation failed');
    genLogger.error({ error: error.message, stack: error.stack }, 'CLI generation failed');
    throw new Error(`CLI generation failed: ${error.message}`);
  }
}

/**
 * Process an image-to-image edit job
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @param {Object} genLogger - Generation-specific logger
 * @returns {Promise<Object>} Result with generationId
 */
async function processEditJob(job, modelConfig, genLogger) {
  const modelId = modelConfig.id;

  // Check if input image path is provided
  if (!job.input_image_path) {
    throw new Error('Edit job requires input_image_path');
  }

  // Update progress
  updateGenerationProgress(job.id, 0.15, 'Loading input image...');
  genLogger.debug({ progress: 0.15 }, 'Loading input image for edit');

  // Load the input image from disk
  const imageBuffer = await readFile(job.input_image_path);

  // Get model-specific default parameters (if any)
  const modelParams = modelManager.getModelGenerationParams(modelId);

  // For server mode models, parse steps from command line args since they cannot be set via API
  let actualSteps = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
  if (modelConfig.exec_mode === ExecMode.SERVER) {
    const stepsFromArgs = modelManager.getModelStepsFromArgs(modelId);
    if (stepsFromArgs !== null) {
      actualSteps = stepsFromArgs;
      genLogger.debug({ steps: actualSteps, source: 'command_line_args' }, 'Using steps from model config args for server mode');
    }
  }

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
    sample_steps: actualSteps,
    clip_skip: job.clip_skip ?? modelParams?.clip_skip ?? undefined,
  };

  // Load mask if provided
  if (job.mask_image_path) {
    params.mask = {
      buffer: await readFile(job.mask_image_path),
      mimetype: job.mask_image_mime_type || 'image/png'
    };
    genLogger.debug('Loaded mask image for edit');
  }

  updateGenerationProgress(job.id, 0.25, 'Generating edit...');
  genLogger.info({ hasMask: !!job.mask_image_path }, 'Starting image edit');

  let response;
  // Use job.id as generation_id since queue is now merged into generations
  const generationId = job.id;

  // Note: CLI mode support for edit/variation may be limited
  // depending on sdcpp CLI capabilities
  if (modelConfig.exec_mode === ExecMode.CLI) {
    // For CLI mode, fall back to generate for now
    // Full implementation would need CLI-specific edit handling
    logger.warn('Edit mode with CLI not fully supported, using generate');
    genLogger.warn('Edit mode with CLI not fully supported, using generate');
    // Add type and input_image_path for CLI mode
    params.type = 'edit';
    params.input_image_path = job.input_image_path;
    response = await processCLIGeneration(job, modelConfig, params, genLogger);
  } else if (modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.API) {
    // Use generateImageDirect for edit mode with FormData
    const apiType = modelConfig.exec_mode === ExecMode.API ? 'external' : 'local';
    logger.info({ apiType, api: modelConfig.api }, 'Using HTTP API for edit');
    genLogger.info({ apiType, api: modelConfig.api }, 'Using HTTP API for edit');
    response = await generateImageDirect(params, 'edit');
  } else {
    throw new Error(`Unknown execution mode: ${modelConfig.exec_mode}`);
  }

  updateGenerationProgress(job.id, 0.7, 'Saving generation record...');
  genLogger.debug({ progress: 0.7 }, 'Saving generation record');
  // Generation record already exists (created when queued), just save images
  updateGenerationProgress(job.id, 0.85, 'Saving images...');
  genLogger.debug({ progress: 0.85 }, 'Saving images');

  let imageCount = 0;

  if (response.data && response.data.length > 0) {
    imageCount = response.data.length;
    genLogger.info({ imageCount }, 'Saving edited images');
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

  return { generationId, imageCount, actualSteps };
}

/**
 * Process a variation job
 * @param {Object} job - Queue job object
 * @param {Object} modelConfig - Model configuration
 * @param {Object} genLogger - Generation-specific logger
 * @returns {Promise<Object>} Result with generationId
 */
async function processVariationJob(job, modelConfig, genLogger) {
  const modelId = modelConfig.id;

  // Check if input image path is provided
  if (!job.input_image_path) {
    throw new Error('Variation job requires input_image_path');
  }

  // Update progress
  updateGenerationProgress(job.id, 0.15, 'Loading input image...');
  genLogger.debug({ progress: 0.15 }, 'Loading input image for variation');

  // Load the input image from disk
  const imageBuffer = await readFile(job.input_image_path);

  // Get model-specific default parameters (if any)
  const modelParams = modelManager.getModelGenerationParams(modelId);

  // For server mode models, parse steps from command line args since they cannot be set via API
  let actualSteps = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
  if (modelConfig.exec_mode === ExecMode.SERVER) {
    const stepsFromArgs = modelManager.getModelStepsFromArgs(modelId);
    if (stepsFromArgs !== null) {
      actualSteps = stepsFromArgs;
      genLogger.debug({ steps: actualSteps, source: 'command_line_args' }, 'Using steps from model config args for server mode');
    }
  }

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
    // Strength parameter for img2img (variation) - controls how much the original image is preserved
    // Default: 0.75 (balanced variation)
    strength: job.strength !== undefined ? job.strength : 0.75,
    // SD.cpp Advanced Settings - use job values, fallback to model defaults, then undefined
    cfg_scale: job.cfg_scale ?? modelParams?.cfg_scale ?? undefined,
    sampling_method: job.sampling_method ?? modelParams?.sampling_method ?? undefined,
    sample_steps: actualSteps,
    clip_skip: job.clip_skip ?? modelParams?.clip_skip ?? undefined,
  };

  updateGenerationProgress(job.id, 0.25, 'Generating variation...');
  genLogger.info({ strength: params.strength }, 'Starting image variation');

  let response;
  // Use job.id as generation_id since queue is now merged into generations
  const generationId = job.id;

  // Note: CLI mode support for edit/variation may be limited
  // depending on sdcpp CLI capabilities
  if (modelConfig.exec_mode === ExecMode.CLI) {
    // For CLI mode, fall back to generate for now
    // Full implementation would need CLI-specific variation handling
    logger.warn('Variation mode with CLI not fully supported, using generate');
    genLogger.warn('Variation mode with CLI not fully supported, using generate');
    // Add type and input_image_path for CLI mode
    params.type = 'variation';
    params.input_image_path = job.input_image_path;
    response = await processCLIGeneration(job, modelConfig, params, genLogger);
  } else if (modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.API) {
    // Use generateImageDirect for variation mode with FormData
    const apiType = modelConfig.exec_mode === ExecMode.API ? 'external' : 'local';
    logger.info({ apiType, api: modelConfig.api, strength: params.strength }, 'Using HTTP API for variation');
    genLogger.info({ apiType, api: modelConfig.api, strength: params.strength }, 'Using HTTP API for variation');
    response = await generateImageDirect(params, 'variation');
  } else {
    throw new Error(`Unknown execution mode: ${modelConfig.exec_mode}`);
  }

  updateGenerationProgress(job.id, 0.7, 'Saving generation record...');
  genLogger.debug({ progress: 0.7 }, 'Saving generation record');
  // Generation record already exists (created when queued), just save images
  updateGenerationProgress(job.id, 0.85, 'Saving images...');
  genLogger.debug({ progress: 0.85 }, 'Saving images');

  let imageCount = 0;

  if (response.data && response.data.length > 0) {
    imageCount = response.data.length;
    genLogger.info({ imageCount }, 'Saving variation images');
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

  return { generationId, imageCount, actualSteps };
}

/**
 * Process an upscale job
 * Upscale jobs don't require model loading - they use the upscaler service directly
 * @param {Object} job - Queue job object
 * @param {Object} genLogger - Generation-specific logger
 * @returns {Promise<Object>} Result with generationId and imageCount
 */
async function processUpscaleJob(job, genLogger) {
  // Check if input image path is provided
  if (!job.input_image_path) {
    throw new Error('Upscale job requires input_image_path');
  }

  // Update progress
  updateGenerationProgress(job.id, 0.1, 'Loading image for upscaling...');
  genLogger.debug({ progress: 0.1 }, 'Loading image for upscaling');

  // Load the input image from disk
  const imageBuffer = await readFile(job.input_image_path);

  updateGenerationProgress(job.id, 0.25, 'Upscaling image...');
  genLogger.info({
    upscaler: job.upscaler,
    resizeMode: job.resize_mode,
    factor: job.upscale_factor
  }, 'Starting image upscaling');

  // Call the upscaler service
  const resultBuffer = await upscaleImage(imageBuffer, {
    upscaler_1: job.upscaler || 'RealESRGAN 4x+',
    resize_mode: job.resize_mode || 0,
    upscaling_resize: job.upscale_factor || 2.0,
    upscaling_resize_w: job.target_width,
    upscaling_resize_h: job.target_height,
  });

  updateGenerationProgress(job.id, 0.85, 'Saving upscaled image...');
  genLogger.debug({ progress: 0.85 }, 'Saving upscaled image');

  // Save the upscaled image
  const generationId = job.id;
  const imageId = randomUUID();

  await createGeneratedImage({
    id: imageId,
    generation_id: generationId,
    index_in_batch: 0,
    image_data: resultBuffer,
    mime_type: 'image/png',
    width: null,
    height: null,
  });

  genLogger.info('Upscale completed successfully');
  return { generationId, imageCount: 1 };
}
