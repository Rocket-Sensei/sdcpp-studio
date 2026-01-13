/**
 * Tests for Queue Processor Service
 *
 * Tests queue processing functionality including:
 * - Starting and stopping the processor
 * - Processing different job types (generate, edit, variation)
 * - Model preparation and conflict resolution
 * - Error handling and crash detection
 * - Progress updates and status changes
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';

// Mock all dependencies
vi.mock('../backend/db/queries.js', () => ({
  claimNextPendingGeneration: vi.fn(),
  updateGenerationStatus: vi.fn(),
  updateGenerationProgress: vi.fn(),
  createGeneratedImage: vi.fn(),
  GenerationStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    MODEL_LOADING: 'model_loading',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  }
}));

vi.mock('../backend/services/modelManager.js', () => ({
  getModelManager: vi.fn(() => mockModelManager),
  ExecMode: {
    SERVER: 'server',
    CLI: 'cli',
    API: 'api'
  },
  ModelStatus: {
    STOPPED: 'stopped',
    STARTING: 'starting',
    RUNNING: 'running',
    STOPPING: 'stopping',
    ERROR: 'error'
  }
}));

vi.mock('../backend/services/imageService.js', () => ({
  generateImageDirect: vi.fn()
}));

vi.mock('../backend/services/cliHandler.js', () => ({
  cliHandler: {
    generateImage: vi.fn()
  }
}));

vi.mock('../backend/services/websocket.js', () => ({
  broadcastQueueEvent: vi.fn(),
  broadcastGenerationComplete: vi.fn()
}));

vi.mock('../backend/utils/logger.js', () => ({
  loggedFetch: vi.fn(),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  createGenerationLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import {
  claimNextPendingGeneration,
  updateGenerationStatus,
  updateGenerationProgress,
  createGeneratedImage,
  GenerationStatus
} from '../backend/db/queries.js';

import { getModelManager, ExecMode, ModelStatus } from '../backend/services/modelManager.js';
import { generateImageDirect } from '../backend/services/imageService.js';
import { cliHandler } from '../backend/services/cliHandler.js';
import { broadcastQueueEvent, broadcastGenerationComplete } from '../backend/services/websocket.js';
import { startQueueProcessor, stopQueueProcessor, getCurrentJob } from '../backend/services/queueProcessor.js';

// Mock model manager instance
const mockModelManager = {
  configLoaded: true,
  defaultModelId: 'default-model',
  loadConfig: vi.fn(),
  getModel: vi.fn((id) => ({
    id: id || 'test-model',
    name: 'Test Model',
    exec_mode: 'server',
    api: 'http://localhost:1234/v1',
    args: ['--steps', '20']
  })),
  getDefaultModelForType: vi.fn((type) => ({
    id: 'default-model',
    name: 'Default Model',
    exec_mode: 'server',
    api: 'http://localhost:1234/v1'
  })),
  isModelRunning: vi.fn(() => false),
  getRunningModels: vi.fn(() => []),
  startModel: vi.fn(async () => ({
    port: 1234,
    pid: 12345,
    status: ModelStatus.RUNNING
  })),
  stopModel: vi.fn(async () => true),
  getModelGenerationParams: vi.fn(() => ({
    cfg_scale: 7.0,
    sampling_method: 'euler',
    sample_steps: 20
  })),
  getModelStepsFromArgs: vi.fn(() => 20)
};

describe('Queue Processor - Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should start the queue processor', () => {
    startQueueProcessor(1000);

    expect(getCurrentJob()).toBeNull();
  });

  it('should not start multiple intervals', () => {
    startQueueProcessor(1000);
    startQueueProcessor(1000);

    // Should not error or create multiple intervals
    expect(getCurrentJob()).toBeNull();
  });

  it('should stop the queue processor', () => {
    startQueueProcessor(1000);
    stopQueueProcessor();

    expect(getCurrentJob()).toBeNull();
  });

  it('should load model config if not loaded', () => {
    mockModelManager.configLoaded = false;

    startQueueProcessor(1000);

    expect(mockModelManager.loadConfig).toHaveBeenCalled();
  });

  it('should continue even if model config fails to load', () => {
    mockModelManager.loadConfig.mockImplementationOnce(() => {
      throw new Error('Config load failed');
    });

    expect(() => startQueueProcessor(1000)).not.toThrow();
  });
});

describe('Queue Processor - Job Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should claim and process a pending job', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    // Wait for polling
    await vi.advanceTimersByTimeAsync(150);

    expect(claimNextPendingGeneration).toHaveBeenCalled();
    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.COMPLETED,
      expect.any(Object)
    );
  });

  it('should use job model if specified', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: 'specific-model',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getModel.mockReturnValue({
      id: 'specific-model',
      name: 'Specific Model',
      exec_mode: 'server',
      api: 'http://localhost:1234/v1'
    });
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(mockModelManager.getModel).toHaveBeenCalledWith('specific-model');
  });

  it('should use default model if job has no model', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: null,
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getDefaultModelForType.mockReturnValue({
      id: 'default-model',
      name: 'Default Model',
      exec_mode: 'server',
      api: 'http://localhost:1234/v1'
    });
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(mockModelManager.getDefaultModelForType).toHaveBeenCalledWith('generate');
  });

  it('should fail job if no model available', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: null,
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getDefaultModelForType.mockReturnValue(null);
    mockModelManager.defaultModelId = null;
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.FAILED,
      expect.objectContaining({
        error: expect.stringContaining('No model')
      })
    );
  });
});

describe('Queue Processor - Model Preparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should prepare server mode model', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: 'server-model',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getModel.mockReturnValue({
      id: 'server-model',
      name: 'Server Model',
      exec_mode: ExecMode.SERVER,
      api: 'http://localhost:1234/v1',
      args: ['--steps', '20']
    });
    mockModelManager.isModelRunning.mockReturnValue(false);
    mockModelManager.startModel.mockResolvedValue({
      port: 1234,
      pid: 12345
    });
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(mockModelManager.startModel).toHaveBeenCalledWith('server-model');
    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.MODEL_LOADING,
      expect.any(Object)
    );
  });

  it('should skip starting if model already running', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: 'server-model',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getModel.mockReturnValue({
      id: 'server-model',
      name: 'Server Model',
      exec_mode: ExecMode.SERVER,
      api: 'http://localhost:1234/v1'
    });
    mockModelManager.isModelRunning.mockReturnValue(true);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(mockModelManager.startModel).not.toHaveBeenCalled();
  });

  it('should stop running servers for CLI mode', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: 'cli-model',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getModel.mockReturnValue({
      id: 'cli-model',
      name: 'CLI Model',
      exec_mode: ExecMode.CLI,
      command: './bin/sd-cli',
      args: []
    });
    mockModelManager.getRunningModels.mockReturnValue([
      { id: 'other-server', name: 'Other Server' }
    ]);
    mockModelManager.stopModel.mockResolvedValue(true);
    cliHandler.generateImage.mockResolvedValue(Buffer.from('test'));
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(mockModelManager.stopModel).toHaveBeenCalled();
    expect(cliHandler.generateImage).toHaveBeenCalled();
  });
});

describe('Queue Processor - Job Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should process generate jobs', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(generateImageDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'a cat'
      }),
      'generate'
    );
  });

  it('should process edit jobs with input image', async () => {
    const job = {
      id: randomUUID(),
      type: 'edit',
      prompt: 'add sunglasses',
      input_image_path: '/tmp/input.png',
      input_image_mime_type: 'image/png',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(generateImageDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.any(Object)
      }),
      'edit'
    );
  });

  it('should fail edit job without input image', async () => {
    const job = {
      id: randomUUID(),
      type: 'edit',
      prompt: 'add sunglasses',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.FAILED,
      expect.objectContaining({
        error: expect.stringContaining('input_image_path')
      })
    );
  });

  it('should process variation jobs', async () => {
    const job = {
      id: randomUUID(),
      type: 'variation',
      prompt: 'a variation',
      input_image_path: '/tmp/input.png',
      input_image_mime_type: 'image/png',
      strength: 0.75,
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(generateImageDirect).toHaveBeenCalledWith(
      expect.objectContaining({
        image: expect.any(Object),
        strength: 0.75
      }),
      'variation'
    );
  });

  it('should fail unknown job types', async () => {
    const job = {
      id: randomUUID(),
      type: 'unknown',
      prompt: 'test',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.FAILED,
      expect.objectContaining({
        error: expect.stringContaining('Unknown job type')
      })
    );
  });
});

describe('Queue Processor - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should handle model not found error', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      model: 'nonexistent-model',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    mockModelManager.getModel.mockReturnValue(null);
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.FAILED,
      expect.objectContaining({
        error: expect.stringContaining('not found')
      })
    );
  });

  it('should handle API failure', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockRejectedValue(new Error('API request failed'));
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(updateGenerationStatus).toHaveBeenCalledWith(
      job.id,
      GenerationStatus.FAILED,
      expect.objectContaining({
        error: expect.stringContaining('API request failed')
      })
    );
  });

  it('should broadcast failure events', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockRejectedValue(new Error('Generation failed'));
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(broadcastQueueEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: job.id,
        status: GenerationStatus.FAILED
      }),
      'job_failed'
    );
  });
});

describe('Queue Processor - Progress Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should update progress through generation stages', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    // Check for different progress updates
    const progressCalls = updateGenerationProgress.mock.calls;
    expect(progressCalls.length).toBeGreaterThan(0);

    // Should have model loading progress
    expect(progressCalls.some(call => call[2].includes('Starting model'))).toBe(true);
  });

  it('should broadcast queue events on status changes', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockResolvedValue({
      data: [{ b64_json: Buffer.from('test').toString('base64') }]
    });
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);

    expect(broadcastQueueEvent).toHaveBeenCalled();
  });
});

describe('Queue Processor - Current Job Tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should return null when no job is processing', () => {
    startQueueProcessor(1000);

    expect(getCurrentJob()).toBeNull();
  });

  it('should return current job during processing', async () => {
    const job = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'a cat',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    claimNextPendingGeneration.mockReturnValue(job);
    generateImageDirect.mockImplementation(() => new Promise(resolve => {
      // Check current job during async operation
      expect(getCurrentJob()).toEqual(expect.objectContaining({
        id: job.id
      }));
      resolve({
        data: [{ b64_json: Buffer.from('test').toString('base64') }]
      });
    }));
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(100);

    await vi.advanceTimersByTimeAsync(150);
  });
});

describe('Queue Processor - Serial Execution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopQueueProcessor();
    vi.useRealTimers();
  });

  it('should only process one job at a time', async () => {
    const job1 = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'job 1',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    const job2 = {
      id: randomUUID(),
      type: 'generate',
      prompt: 'job 2',
      status: GenerationStatus.PENDING,
      created_at: Date.now()
    };

    // Return job1 first, then job2
    let callCount = 0;
    claimNextPendingGeneration.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return job1;
      if (callCount === 2) return job2;
      return null;
    });

    generateImageDirect.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => {
        resolve({
          data: [{ b64_json: Buffer.from('test').toString('base64') }]
        });
      }, 100);
    }));
    updateGenerationProgress.mockResolvedValue({});
    createGeneratedImage.mockResolvedValue({});
    updateGenerationStatus.mockResolvedValue({});

    startQueueProcessor(50);

    // Advance time enough for first job to start but not complete
    await vi.advanceTimersByTimeAsync(75);

    // Second job should not have been claimed yet
    expect(claimNextPendingGeneration).toHaveBeenCalledTimes(1);
  });
});
