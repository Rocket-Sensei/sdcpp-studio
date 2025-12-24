import { randomUUID } from 'crypto';
import { createGeneration, createGeneratedImage } from '../db/queries.js';
import { getModelManager } from './modelManager.js';
import { loggedFetch } from '../utils/logger.js';

const modelManager = getModelManager();
const SD_API_ENDPOINT = process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1';

function generateRandomSeed() {
  return Math.floor(Math.random() * 4294967295);
}

/**
 * Direct API call without database operations - for queue processor
 */
export async function generateImageDirect(params, mode = 'generate') {
  const isFormData = mode === 'edit' || mode === 'variation';

  // Parse SD-specific extra args from prompt
  let processedPrompt = params.prompt || '';
  let extraArgs = {};

  // DEBUG: Log image buffer info for FormData
  if (isFormData && params.image) {
    console.log(`[ImageService] Image buffer size: ${params.image.buffer.length}, mimetype: ${params.image.mimetype}`);
    console.log(`[ImageService] Image buffer first 32 bytes (hex): ${params.image.buffer.slice(0, 32).toString('hex')}`);
  }

  const extraArgsMatch = processedPrompt.match(/<sd_cpp_extra_args>(.*?)<\/sd_cpp_extra_args>/s);
  if (extraArgsMatch) {
    try {
      extraArgs = JSON.parse(extraArgsMatch[1]);
      processedPrompt = processedPrompt.replace(/<sd_cpp_extra_args>.*?<\/sd_cpp_extra_args>/s, '').trim();
    } catch (e) {
      console.error('Failed to parse extra args:', e);
    }
  }

  // Extract negative prompt if present
  let negativePrompt = params.negative_prompt || '';
  const negPromptMatch = processedPrompt.match(/<negative_prompt>(.*?)<\/negative_prompt>/s);
  if (negPromptMatch) {
    negativePrompt = negPromptMatch[1];
    processedPrompt = processedPrompt.replace(/<negative_prompt>.*?<\/negative_prompt>/s, '').trim();
  }

  // Generate random seed if not provided
  if (!extraArgs.seed) {
    extraArgs.seed = generateRandomSeed();
  }

  // Reconstruct prompt with extra args
  const finalPrompt = `${processedPrompt}<sd_cpp_extra_args>${JSON.stringify(extraArgs)}</sd_cpp_extra_args>`;

  let requestBody;

  if (isFormData && params.image) {
    // For edit/variation with image upload - use native FormData
    const formData = new FormData();

    // Build prompt string with negative prompt if present
    let promptString = finalPrompt;
    if (negativePrompt) {
      promptString = `${finalPrompt}<negative_prompt>${negativePrompt}</negative_prompt>`;
    }

    formData.append('model', params.model || 'sd-cpp-local'); // Note: legacy fallback, should use actual model ID from params
    formData.append('prompt', promptString);

    // Add image - Node.js native FormData requires wrapping Buffer in Blob
    // Blob constructor accepts an array of Buffers and optional type
    const imageBlob = new Blob([params.image.buffer], { type: params.image.mimetype || 'image/png' });
    formData.append('image[]', imageBlob, 'image.png');

    formData.append('n', params.n || 1);
    formData.append('size', params.size || '512x512');
    formData.append('response_format', 'b64_json');

    if (params.mask) {
      // Add mask - Node.js native FormData requires wrapping Buffer in Blob
      const maskBlob = new Blob([params.mask.buffer], { type: params.mask.mimetype || 'image/png' });
      formData.append('mask', maskBlob, 'mask.png');
    }

    requestBody = formData;
    // Don't set Content-Type header - let fetch set it with boundary
  } else {
    // For text-to-image
    // Build prompt string with negative prompt if present
    let promptString = finalPrompt;
    if (negativePrompt) {
      promptString = `${finalPrompt}<negative_prompt>${negativePrompt}</negative_prompt>`;
    }

    requestBody = {
      model: params.model || 'sd-cpp-local',
      prompt: promptString,
      n: params.n || 1,
      size: params.size || '512x512',
      response_format: 'b64_json'
    };

    // Add optional parameters
    if (params.quality) requestBody.quality = params.quality;
    if (params.style) requestBody.style = params.style;
    if (params.user) requestBody.user = params.user;
  }

  // Determine endpoint - use model's configured API if available
  const modelId = params.model || null;
  let baseEndpoint = SD_API_ENDPOINT;
  let modelConfig = null;

  if (modelId) {
    modelConfig = modelManager.getModel(modelId);
    if (modelConfig && modelConfig.api) {
      baseEndpoint = modelConfig.api;
      console.log(`[ImageService] Using model API endpoint: ${baseEndpoint}`);
    }
  }

  let endpoint = baseEndpoint;
  if (mode === 'edit') {
    endpoint += '/images/edits';
  } else if (mode === 'variation') {
    endpoint += '/images/variations';
  } else {
    endpoint += '/images/generations';
  }

  // For API mode, update the model name to use the actual model name
  // For server/CLI mode, use the internal ID
  if (modelConfig && modelConfig.exec_mode === 'api' && !isFormData) {
    requestBody.model = modelConfig.name;
  }

  // Build headers - add API key if configured
  let headers;
  if (isFormData) {
    // FormData case - let fetch set Content-Type with boundary
    headers = undefined;
    // Note: FormData with native fetch doesn't support custom headers well
    // API key support for FormData is limited in current implementation
    if (modelConfig && modelConfig.api_key) {
      console.warn('[ImageService] API key with FormData not fully supported, consider using JSON mode');
    }
  } else {
    // JSON case
    headers = { 'Content-Type': 'application/json' };
    if (modelConfig && modelConfig.api_key) {
      headers['Authorization'] = `Bearer ${modelConfig.api_key}`;
      console.log(`[ImageService] Using API key for authentication`);
    }
  }

  // Make API request
  const response = await loggedFetch(endpoint, {
    method: 'POST',
    headers,
    body: isFormData ? requestBody : JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

export async function generateImage(params, mode = 'generate') {
  const generationId = randomUUID();
  const isFormData = mode === 'edit' || mode === 'variation';

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

  // Extract negative prompt if present
  let negativePrompt = params.negative_prompt || '';
  const negPromptMatch = processedPrompt.match(/<negative_prompt>(.*?)<\/negative_prompt>/s);
  if (negPromptMatch) {
    negativePrompt = negPromptMatch[1];
    processedPrompt = processedPrompt.replace(/<negative_prompt>.*?<\/negative_prompt>/s, '').trim();
  }

  // Generate random seed if not provided
  if (!extraArgs.seed) {
    extraArgs.seed = generateRandomSeed();
  }

  // Reconstruct prompt with extra args
  const finalPrompt = `${processedPrompt}<sd_cpp_extra_args>${JSON.stringify(extraArgs)}</sd_cpp_extra_args>`;

  let requestBody;

  if (isFormData && params.image) {
    // For edit/variation with image upload - use native FormData
    const formData = new FormData();

    // Build prompt string with negative prompt if present
    let promptString = finalPrompt;
    if (negativePrompt) {
      promptString = `${finalPrompt}<negative_prompt>${negativePrompt}</negative_prompt>`;
    }

    formData.append('model', params.model || 'sd-cpp-local'); // Note: legacy fallback, should use actual model ID from params
    formData.append('prompt', promptString);

    // Add image - Node.js native FormData requires wrapping Buffer in Blob
    // Blob constructor accepts an array of Buffers and optional type
    const imageBlob = new Blob([params.image.buffer], { type: params.image.mimetype || 'image/png' });
    formData.append('image[]', imageBlob, 'image.png');

    formData.append('n', params.n || 1);
    formData.append('size', params.size || '512x512');
    formData.append('response_format', 'b64_json');

    if (params.mask) {
      // Add mask - Node.js native FormData requires wrapping Buffer in Blob
      const maskBlob = new Blob([params.mask.buffer], { type: params.mask.mimetype || 'image/png' });
      formData.append('mask', maskBlob, 'mask.png');
    }

    requestBody = formData;
    // Don't set Content-Type header - let fetch set it with boundary
  } else {
    // For text-to-image
    // Build prompt string with negative prompt if present
    let promptString = finalPrompt;
    if (negativePrompt) {
      promptString = `${finalPrompt}<negative_prompt>${negativePrompt}</negative_prompt>`;
    }

    requestBody = {
      model: params.model || 'sd-cpp-local',
      prompt: promptString,
      n: params.n || 1,
      size: params.size || '512x512',
      response_format: 'b64_json'
    };

    // Add optional parameters
    if (params.quality) requestBody.quality = params.quality;
    if (params.style) requestBody.style = params.style;
    if (params.user) requestBody.user = params.user;
  }

  // Determine endpoint - use model's configured API if available
  const modelId = params.model || null;
  let baseEndpoint = SD_API_ENDPOINT;
  let modelConfig = null;

  if (modelId) {
    modelConfig = modelManager.getModel(modelId);
    if (modelConfig && modelConfig.api) {
      baseEndpoint = modelConfig.api;
      console.log(`[ImageService] Using model API endpoint: ${baseEndpoint}`);
    }
  }

  let endpoint = baseEndpoint;
  if (mode === 'edit') {
    endpoint += '/images/edits';
  } else if (mode === 'variation') {
    endpoint += '/images/variations';
  } else {
    endpoint += '/images/generations';
  }

  // For API mode, update the model name to use the actual model name
  // For server/CLI mode, use the internal ID
  if (modelConfig && modelConfig.exec_mode === 'api' && !isFormData) {
    requestBody.model = modelConfig.name;
  }

  // Build headers - add API key if configured
  let headers;
  if (isFormData) {
    // FormData case - let fetch set Content-Type with boundary
    headers = undefined;
    // Note: FormData with native fetch doesn't support custom headers well
    // API key support for FormData is limited in current implementation
    if (modelConfig && modelConfig.api_key) {
      console.warn('[ImageService] API key with FormData not fully supported, consider using JSON mode');
    }
  } else {
    // JSON case
    headers = { 'Content-Type': 'application/json' };
    if (modelConfig && modelConfig.api_key) {
      headers['Authorization'] = `Bearer ${modelConfig.api_key}`;
      console.log(`[ImageService] Using API key for authentication`);
    }
  }

  // Make API request
  const response = await loggedFetch(endpoint, {
    method: 'POST',
    headers,
    body: isFormData ? requestBody : JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${errorText}`);
  }

  const result = await response.json();

  // Save to database
  await createGeneration({
    id: generationId,
    type: mode,
    model: params.model || 'sd-cpp-local', // Note: legacy fallback, should use actual model ID
    prompt: processedPrompt,
    negative_prompt: negativePrompt,
    size: params.size || '512x512',
    seed: extraArgs.seed.toString(),
    n: params.n || 1,
    quality: params.quality || null,
    style: params.style || null,
    response_format: 'b64_json',
    user_id: params.user || null
  });

  // Save images to disk
  const images = [];
  for (let i = 0; i < result.data.length; i++) {
    const imageData = result.data[i];
    let buffer;

    if (imageData.b64_json) {
      buffer = Buffer.from(imageData.b64_json, 'base64');
    } else if (imageData.url) {
      const imageResponse = await loggedFetch(imageData.url);
      buffer = Buffer.from(await imageResponse.arrayBuffer());
    }

    const imageId = randomUUID();
    await createGeneratedImage({
      id: imageId,
      generation_id: generationId,
      index_in_batch: i,
      image_data: buffer,
      mime_type: 'image/png',
      width: parseInt(params.size?.split('x')[0]) || 512,
      height: parseInt(params.size?.split('x')[1]) || 512,
      revised_prompt: imageData.revised_prompt || null
    });

    images.push({
      id: imageId,
      index: i,
      revised_prompt: imageData.revised_prompt || null
    });
  }

  return {
    id: generationId,
    created: result.created || Date.now(),
    data: images,
    usage: result.usage || null
  };
}
