import { loggedFetch, createLogger } from '../utils/logger.js';
import { generateImageDirect } from './imageService.js';
import { randomUUID } from 'crypto';
import { getModelManager, ExecMode } from './modelManager.js';

const logger = createLogger('studioHordeClient');

const modelManager = getModelManager();

const HORDE_API_BASE = process.env.HORDE_API_BASE || 'http://localhost:3000';
const HORDE_API_KEY = process.env.HORDE_API_KEY || 'studio-worker-key';
const POLL_INTERVAL_MS = parseInt(process.env.HORDE_POLL_INTERVAL_MS || '5000');
const WORKER_NAME = process.env.HORDE_WORKER_NAME || 'sd-cpp-studio';
const MAX_BATCH_SIZE = parseInt(process.env.HORDE_MAX_BATCH_SIZE || '1');

let isRunning = false;
let pollInterval = null;
let currentJob = null;

/**
 * Get worker capabilities based on available models
 */
function getWorkerCapabilities() {
  const models = modelManager.getAllModels();
  const maxPixelsPerModel = {};

  for (const model of models) {
    if (model.port) {
      maxPixelsPerModel[model.id] = 1024 * 1024;
    }
  }

  const allModelNames = models.map(m => m.id.toLowerCase());
  const maxPixelsSupported = 1024 * 1024;

  return {
    name: WORKER_NAME,
    models: allModelNames,
    max_pixels: maxPixelsSupported,
    nsfw: false,
    threads: 1,
    allow_img2img: true,
    allow_painting: true,
    allow_controlnet: false,
    allow_lora: false,
    allow_post_processing: false,
    blacklist: [],
    bridge_version: 24,
    bridge_agent: `SD-CPP-Studio-Horde-Client:1.0.0`,
    priority_usernames: [],
    require_upfront_kudos: false,
    extra_slow_worker: false,
    limit_max_steps: false
  };
}

/**
 * Pop a job from the Horde queue
 */
async function popJob() {
  const capabilities = getWorkerCapabilities();

  logger.info({ url: `${HORDE_API_BASE}/api/v2/generate/pop`, capabilities: { name: capabilities.name, models: capabilities.models.length } }, 'Polling for Horde job');

  try {
    const response = await loggedFetch(`${HORDE_API_BASE}/api/v2/generate/pop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': HORDE_API_KEY
      },
      body: JSON.stringify(capabilities),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Failed to pop job from Horde');
      return null;
    }

    const data = await response.json();

    if (data.skipped) {
      logger.debug({ skipped: data.skipped }, 'No job available (skipped)');
      return null;
    }

    if (!data.id && !data.ids) {
      logger.debug('No job available');
      return null;
    }

    const jobId = data.id || data.ids[0];

    logger.info({ jobId, model: data.model }, 'Popped Horde job');

    return {
      id: jobId,
      model: data.model,
      payload: data.payload,
      source_image: data.source_image,
      source_processing: data.source_processing,
      source_mask: data.source_mask,
      r2_uploads: data.r2_uploads || [],
      ttl: data.ttl
    };
  } catch (error) {
    logger.error({ error: error.message }, 'Error popping job from Horde');
    return null;
  }
}

/**
 * Execute a Horde job using the local SD.cpp model
 */
async function executeJob(hordeJob) {
  logger.info({ jobId: hordeJob.id, model: hordeJob.model, prompt: hordeJob.payload.prompt?.substring(0, 50) }, 'Executing Horde job');

  currentJob = hordeJob;

  try {
    let modelId = hordeJob.model;

    if (!modelManager.getModel(modelId)) {
      const defaultModel = modelManager.getDefaultModel();
      if (defaultModel) {
        logger.warn({ requestedModel: modelId, usingModel: defaultModel.id }, 'Requested model not found, using default');
        modelId = defaultModel.id;
      } else {
        throw new Error(`Model not found: ${modelId} and no default available`);
      }
    }

    const modelConfig = modelManager.getModel(modelId);
    if (!modelConfig) {
      throw new Error(`Model config not found: ${modelId}`);
    }

    const payload = hordeJob.payload;
    const size = payload.width && payload.height ? `${payload.width}x${payload.height}` : '512x512';

    const params = {
      prompt: payload.prompt,
      negative_prompt: '',
      size: size,
      seed: payload.seed || Math.floor(Math.random() * 4294967295),
      n: payload.n_iter || 1,
      cfg_scale: payload.cfg_scale,
      sampling_method: payload.sampler_name,
      sample_steps: payload.ddim_steps || payload.steps,
      clip_skip: payload.clip_skip
    };

    let response;

    if (hordeJob.source_processing === 'img2img' && hordeJob.source_image) {
      logger.info({ jobId: hordeJob.id }, 'Processing img2img job');

      const img2imgParams = {
        ...params,
        image: {
          buffer: Buffer.from(hordeJob.source_image, 'base64'),
          mimetype: 'image/png'
        },
        strength: payload.denoising_strength
      };

      if (modelConfig.exec_mode === ExecMode.CLI) {
        response = await processCLIGeneration(img2imgParams, modelConfig);
      } else {
        response = await generateImageDirect(img2imgParams, 'edit');
      }
    } else {
      logger.info({ jobId: hordeJob.id }, 'Processing txt2img job');

      if (modelConfig.exec_mode === ExecMode.CLI) {
        response = await processCLIGeneration(params, modelConfig);
      } else {
        response = await generateImageDirect(params, 'generate');
      }
    }

    const imageData = response?.data?.[0];
    if (!imageData) {
      throw new Error('No image generated');
    }

    const seed = imageData.seed || params.seed;

    logger.info({ jobId: hordeJob.id, seed }, 'Horde job completed successfully');

    currentJob = null;

    return {
      success: true,
      image_base64: imageData.b64_json,
      seed: seed,
      state: 'ok',
      censored: false
    };
  } catch (error) {
    logger.error({ jobId: hordeJob.id, error: error.message }, 'Horde job failed');
    currentJob = null;

    return {
      success: false,
      state: 'faulted',
      seed: -1,
      error: error.message
    };
  }
}

/**
 * Process generation using CLI mode
 */
async function processCLIGeneration(params, modelConfig) {
  const { cliHandler } = await import('./cliHandler.js');
  const mergedArgs = modelManager._mergeMemoryFlags(modelConfig.args || [], modelConfig);
  const configWithMemoryFlags = { ...modelConfig, args: mergedArgs };

  const imageBuffer = await cliHandler.generateImage(configWithMemoryFlags.id, params, configWithMemoryFlags);

  const b64Json = imageBuffer.toString('base64');

  return {
    created: Math.floor(Date.now() / 1000),
    data: [{
      b64_json: b64Json,
      revised_prompt: null
    }]
  };
}

/**
 * Submit job result to Horde
 */
async function submitJob(hordeJob, result) {
  logger.info({ jobId: hordeJob.id, state: result.state, success: result.success }, 'Submitting Horde job result');

  try {
    const submitPayload = {
      id: hordeJob.id,
      generation: result.success ? result.image_base64 : 'faulted',
      state: result.state,
      seed: result.seed,
      censored: result.censored || false
    };

    const response = await loggedFetch(`${HORDE_API_BASE}/api/v2/generate/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': HORDE_API_KEY
      },
      body: JSON.stringify(submitPayload),
      signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Failed to submit Horde job');
      return { success: false, error: errorText };
    }

    const data = await response.json();

    logger.info({ jobId: hordeJob.id, reward: data.reward }, 'Horde job submitted successfully');

    return { success: true, reward: data.reward };
  } catch (error) {
    logger.error({ jobId: hordeJob.id, error: error.message }, 'Error submitting Horde job');
    return { success: false, error: error.message };
  }
}

/**
 * Main Horde worker loop iteration
 */
async function processHordeQueue() {
  if (!isRunning) {
    return;
  }

  if (currentJob) {
    logger.debug('Already processing a job, skipping poll');
    return;
  }

  const hordeJob = await popJob();

  if (!hordeJob) {
    return;
  }

  const result = await executeJob(hordeJob);

  await submitJob(hordeJob, result);
}

/**
 * Start the Horde client
 */
export function startHordeClient() {
  if (isRunning) {
    logger.info('Horde client already running');
    return;
  }

  logger.info({ apiBase: HORDE_API_BASE, workerName: WORKER_NAME, pollInterval: POLL_INTERVAL_MS }, 'Starting Horde client');

  isRunning = true;

  setTimeout(async () => {
    await processHordeQueue();
  }, 1000);

  pollInterval = setInterval(processHordeQueue, POLL_INTERVAL_MS);

  logger.info('Horde client started');
}

/**
 * Stop the Horde client
 */
export function stopHordeClient() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  isRunning = false;

  logger.info('Horde client stopped');
}

/**
 * Check if Horde client is running
 */
export function isHordeClientRunning() {
  return isRunning;
}

/**
 * Get current job being processed
 */
export function getCurrentHordeJob() {
  return currentJob;
}
