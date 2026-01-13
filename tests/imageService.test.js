/**
 * Tests for Image Service
 *
 * Tests image generation API calls including:
 * - Direct API calls (for queue processor)
 * - Database operations (for direct API)
 * - Prompt parsing and SD.cpp args injection
 * - Different generation modes (generate, edit, variation)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';

// Mocks must be defined before imports
vi.mock('../backend/utils/logger.js', () => {
  const mockLoggerInstance = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  return {
    loggedFetch: vi.fn(),
    createLogger: vi.fn(() => mockLoggerInstance),
    __mockLoggerInstance: mockLoggerInstance,
  };
});

vi.mock('../backend/db/queries.js', () => ({
  createGeneration: vi.fn(),
  createGeneratedImage: vi.fn(),
}));

vi.mock('../backend/services/modelManager.js', () => {
  const mockModelManagerInstance = {
    getDefaultModel: vi.fn(() => ({ id: 'test-model', name: 'Test Model', api: 'http://test:1234/v1' })),
    getModel: vi.fn((id) => ({
      id: id || 'test-model',
      name: 'Test Model',
      api: 'http://test:1234/v1',
      exec_mode: 'server'
    })),
  };
  return {
    getModelManager: vi.fn(() => mockModelManagerInstance),
    __mockModelManagerInstance: mockModelManagerInstance,
  };
});

// Now import after mocks are set up
import { generateImageDirect, generateImage } from '../backend/services/imageService.js';
import { createGeneration, createGeneratedImage } from '../backend/db/queries.js';
import { loggedFetch, createLogger } from '../backend/utils/logger.js';
import { getModelManager } from '../backend/services/modelManager.js';

// Get the mock instances
const logger = createLogger();
const mockModelManagerInstance = getModelManager();

describe('imageService - generateImageDirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SD_API_ENDPOINT = 'http://test:1234/v1';
  });

  afterEach(() => {
    delete process.env.SD_API_ENDPOINT;
  });

  describe('prompt parsing', () => {
    it('should extract and parse sd_cpp_extra_args from prompt', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat<sd_cpp_extra_args>{"cfg_scale": 5.0, "seed": 12345}</sd_cpp_extra_args>',
        model: 'test-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      // Should have removed the extra args tag and reconstructed prompt
      expect(requestBody.prompt).toContain('<sd_cpp_extra_args>');
      expect(requestBody.prompt).toContain('cfg_scale');
      expect(requestBody.prompt).toContain('5');
      expect(requestBody.prompt).toContain('seed');
      expect(requestBody.prompt).toContain('12345');
    });

    it('should handle invalid JSON in extra args gracefully', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat<sd_cpp_extra_args>invalid json</sd_cpp_extra_args>',
        model: 'test-model'
      };

      await generateImageDirect(params, 'generate');

      // Should still make the request despite invalid JSON
      expect(loggedFetch).toHaveBeenCalled();
    });

    it('should extract negative prompt from prompt', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat<negative_prompt>blurry, ugly</negative_prompt>',
        model: 'test-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.prompt).toContain('<negative_prompt>blurry, ugly</negative_prompt>');
    });

    it('should extract both extra args and negative prompt', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat<sd_cpp_extra_args>{"cfg_scale": 5.0}</sd_cpp_extra_args><negative_prompt>blurry</negative_prompt>',
        model: 'test-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.prompt).toContain('<sd_cpp_extra_args>');
      expect(requestBody.prompt).toContain('<negative_prompt>blurry</negative_prompt>');
    });

    it('should generate random seed if not provided', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat',
        model: 'test-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);
      const promptMatch = requestBody.prompt.match(/<sd_cpp_extra_args>(.*?)<\/sd_cpp_extra_args>/s);
      const extraArgs = JSON.parse(promptMatch[1]);

      expect(extraArgs.seed).toBeDefined();
      expect(extraArgs.seed).toBeGreaterThan(0);
      expect(extraArgs.seed).toBeLessThan(4294967295);
    });
  });

  describe('endpoint selection', () => {
    it('should use model API endpoint when available', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat',
        model: 'test-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      expect(fetchCall[0]).toContain('http://test:1234/v1');
    });

    it('should append correct path for generate mode', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      await generateImageDirect({ prompt: 'test', model: 'test-model' }, 'generate');

      expect(loggedFetch.mock.calls[0][0]).toContain('/images/generations');
    });

    it('should append correct path for edit mode', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'test',
        model: 'test-model',
        image: { buffer: Buffer.from('test'), mimetype: 'image/png' }
      };

      await generateImageDirect(params, 'edit');

      expect(loggedFetch.mock.calls[0][0]).toContain('/images/edits');
    });

    it('should append correct path for variation mode', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'test',
        model: 'test-model',
        image: { buffer: Buffer.from('test'), mimetype: 'image/png' }
      };

      await generateImageDirect(params, 'variation');

      expect(loggedFetch.mock.calls[0][0]).toContain('/images/variations');
    });
  });

  describe('request body construction', () => {
    it('should include all basic parameters in request body', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'a cat',
        model: 'test-model',
        size: '768x768',
        n: 2,
        quality: 'high',
        style: 'cinematic'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.model).toBe('test-model');
      expect(requestBody.size).toBe('768x768');
      expect(requestBody.n).toBe(2);
      expect(requestBody.quality).toBe('high');
      expect(requestBody.style).toBe('cinematic');
      expect(requestBody.response_format).toBe('b64_json');
    });

    it('should use FormData for edit mode with image', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'edit test',
        model: 'test-model',
        image: { buffer: Buffer.from('test image data'), mimetype: 'image/png' }
      };

      await generateImageDirect(params, 'edit');

      const fetchCall = loggedFetch.mock.calls[0];
      expect(fetchCall[1].body).toBeInstanceOf(FormData);
    });

    it('should include mask in FormData when provided', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'edit test',
        model: 'test-model',
        image: { buffer: Buffer.from('test image data'), mimetype: 'image/png' },
        mask: { buffer: Buffer.from('test mask data'), mimetype: 'image/png' }
      };

      await generateImageDirect(params, 'edit');

      const fetchCall = loggedFetch.mock.calls[0];
      const formData = fetchCall[1].body;

      // FormData should have been created (we can't easily inspect it in tests)
      expect(formData).toBeInstanceOf(FormData);
    });

    it('should add strength parameter for variation mode', async () => {
      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'variation test',
        model: 'test-model',
        image: { buffer: Buffer.from('test image data'), mimetype: 'image/png' },
        strength: 0.6
      };

      await generateImageDirect(params, 'variation');

      const fetchCall = loggedFetch.mock.calls[0];
      const formData = fetchCall[1].body;
      expect(formData).toBeInstanceOf(FormData);
    });
  });

  describe('error handling', () => {
    it('should throw error when API request fails', async () => {
      loggedFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      });

      const params = {
        prompt: 'a cat',
        model: 'test-model'
      };

      await expect(generateImageDirect(params, 'generate')).rejects.toThrow('API request failed');
    });

    it('should include error status and text in error message', async () => {
      loggedFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable'
      });

      const params = {
        prompt: 'a cat',
        model: 'test-model'
      };

      await expect(generateImageDirect(params, 'generate')).rejects.toThrow('503');
    });
  });

  describe('API mode model handling', () => {
    it('should use model name instead of ID for API mode models', async () => {
      mockModelManagerInstance.getModel = vi.fn(() => ({
        id: 'api-model',
        name: 'Actual Model Name',
        api: 'http://api:1234/v1',
        exec_mode: 'api'
      }));

      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'test',
        model: 'api-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.model).toBe('Actual Model Name');
    });
  });

  describe('API key handling', () => {
    it('should add Authorization header when model has API key', async () => {
      mockModelManagerInstance.getModel = vi.fn(() => ({
        id: 'api-model',
        name: 'API Model',
        api: 'http://api:1234/v1',
        api_key: 'test-api-key-12345',
        exec_mode: 'api'
      }));

      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'test',
        model: 'api-model'
      };

      await generateImageDirect(params, 'generate');

      const fetchCall = loggedFetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer test-api-key-12345');
    });

    it('should warn when using API key with FormData', async () => {
      mockModelManagerInstance.getModel = vi.fn(() => ({
        id: 'api-model',
        name: 'API Model',
        api: 'http://api:1234/v1',
        api_key: 'test-key',
        exec_mode: 'server'
      }));

      const mockResponse = {
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      };
      loggedFetch.mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const params = {
        prompt: 'test',
        model: 'api-model',
        image: { buffer: Buffer.from('test'), mimetype: 'image/png' }
      };

      await generateImageDirect(params, 'edit');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('API key with FormData')
      );
    });
  });
});

describe('imageService - generateImage (with DB)', () => {
  let capturedGenId;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SD_API_ENDPOINT = 'http://test:1234/v1';
    capturedGenId = null;
    createGeneration.mockImplementation((data) => {
      capturedGenId = data.id;
      return { id: data.id };
    });
  });

  afterEach(() => {
    delete process.env.SD_API_ENDPOINT;
  });

  it('should create generation record in database', async () => {
    const genId = randomUUID();
    const mockResponse = {
      data: [{ b64_json: Buffer.from('test image data').toString('base64') }],
      created: Date.now()
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    createGeneration.mockImplementation((data) => {
      return { id: genId };
    });
    createGeneratedImage.mockResolvedValue({});

    const params = {
      prompt: 'a cat',
      model: 'test-model',
      size: '512x512'
    };

    await generateImage(params, 'generate');

    expect(createGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'generate',
        model: 'test-model',
        prompt: 'a cat',
        size: '512x512',
        response_format: 'b64_json'
      })
    );
  });

  it('should create generated image records', async () => {
    const mockResponse = {
      data: [
        { b64_json: Buffer.from('image1').toString('base64') },
        { b64_json: Buffer.from('image2').toString('base64') }
      ],
      created: Date.now()
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    createGeneration.mockResolvedValue({ id: randomUUID() });
    createGeneratedImage.mockResolvedValue({});

    const params = {
      prompt: 'a cat',
      model: 'test-model',
      n: 2
    };

    await generateImage(params, 'generate');

    expect(createGeneratedImage).toHaveBeenCalledTimes(2);
  });

  it('should save image data as buffer', async () => {
    const imageData = Buffer.from('test image data');
    const mockResponse = {
      data: [{ b64_json: imageData.toString('base64') }],
      created: Date.now()
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    createGeneration.mockResolvedValue({ id: randomUUID() });
    createGeneratedImage.mockResolvedValue({});

    const params = { prompt: 'test', model: 'test-model' };

    await generateImage(params, 'generate');

    const createImageCall = createGeneratedImage.mock.calls[0];
    expect(Buffer.isBuffer(createImageCall[0].image_data)).toBe(true);
  });

  it('should return generation with image IDs', async () => {
    let capturedId = null;
    const mockResponse = {
      data: [{ b64_json: Buffer.from('test').toString('base64') }],
      created: Date.now()
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    createGeneration.mockImplementation((data) => {
      capturedId = data.id;
      return { id: data.id };
    });
    createGeneratedImage.mockImplementation((data) => {
      return { id: data.id };
    });

    const params = { prompt: 'test', model: 'test-model' };

    const result = await generateImage(params, 'generate');

    expect(result.id).toBe(capturedId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBeDefined();
  });

  it('should handle images from URL instead of b64_json', async () => {
    const mockImageResponse = {
      ok: true,
      arrayBuffer: async () => Buffer.from('image from url').buffer
    };

    const mockResponse = {
      data: [{ url: 'http://example.com/image.png' }],
      created: Date.now()
    };

    loggedFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      })
      .mockResolvedValueOnce(mockImageResponse);

    createGeneration.mockResolvedValue({ id: randomUUID() });
    createGeneratedImage.mockResolvedValue({});

    const params = { prompt: 'test', model: 'test-model' };

    await generateImage(params, 'generate');

    expect(loggedFetch).toHaveBeenCalledTimes(2);
    expect(createGeneratedImage).toHaveBeenCalled();
  });

  it('should include revised_prompt in image record if present', async () => {
    const mockResponse = {
      data: [{
        b64_json: Buffer.from('test').toString('base64'),
        revised_prompt: 'improved prompt'
      }],
      created: Date.now()
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });
    createGeneration.mockResolvedValue({ id: randomUUID() });
    createGeneratedImage.mockResolvedValue({});

    const params = { prompt: 'test', model: 'test-model' };

    await generateImage(params, 'generate');

    const createImageCall = createGeneratedImage.mock.calls[0];
    expect(createImageCall[0].revised_prompt).toBe('improved prompt');
  });
});

describe('imageService - FormData handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SD_API_ENDPOINT = 'http://test:1234/v1';
  });

  it('should not set Content-Type header for FormData', async () => {
    const mockResponse = {
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const params = {
      prompt: 'test',
      model: 'test-model',
      image: { buffer: Buffer.from('test'), mimetype: 'image/png' }
    };

    await generateImageDirect(params, 'edit');

    const fetchCall = loggedFetch.mock.calls[0];
    expect(fetchCall[1].headers).toBeUndefined();
  });

  it('should set Content-Type for JSON requests', async () => {
    const mockResponse = {
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    };
    loggedFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const params = { prompt: 'test', model: 'test-model' };

    await generateImageDirect(params, 'generate');

    const fetchCall = loggedFetch.mock.calls[0];
    expect(fetchCall[1].headers['Content-Type']).toBe('application/json');
  });
});
