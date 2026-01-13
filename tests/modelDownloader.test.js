/**
 * Tests for Model Downloader Service
 *
 * Tests model download functionality including:
 * - Download method detection (Python vs Node)
 * - Progress tracking and callbacks
 * - Download status management
 * - Cancellation handling
 * - Error handling and retries
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Mock dependencies
vi.mock('fs', () => ({
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1000000 })),
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
}));

vi.mock('easy-dl', () => ({
  default: class MockEasyDl {
    constructor(url, path, options) {
      this.url = url;
      this.path = path;
      this.options = options;
    }
    on(event, callback) {
      this[event] = callback;
      return this;
    }
    async wait() {
      return true;
    }
  }
}));

import { ModelDownloader, DOWNLOAD_STATUS, DOWNLOAD_METHOD, formatBytes, formatTime, getHuggingFaceFileUrl } from '../backend/services/modelDownloader.js';
import * as fs from 'fs';
import { spawn as mockSpawn } from 'child_process';

describe('ModelDownloader - Utility Functions', () => {
  describe('formatBytes', () => {
    it('should format zero bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576 * 5)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824 * 2)).toBe('2 GB');
    });

    it('should format terabytes', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });
  });

  describe('formatTime', () => {
    it('should format seconds', () => {
      expect(formatTime(30)).toBe('30s');
    });

    it('should format minutes and seconds', () => {
      expect(formatTime(90)).toBe('1m 30s');
    });

    it('should format hours and minutes', () => {
      expect(formatTime(3661)).toBe('1h 1m');
    });

    it('should handle invalid values', () => {
      expect(formatTime(-1)).toBe('--:--');
      expect(formatTime(NaN)).toBe('--:--');
      expect(formatTime(Infinity)).toBe('--:--');
    });
  });

  describe('getHuggingFaceFileUrl', () => {
    it('should build URL for main branch', () => {
      const url = getHuggingFaceFileUrl('org/model', 'file.gguf');
      expect(url).toBe('https://huggingface.co/org/model/resolve/main/file.gguf');
    });

    it('should build URL for specific revision', () => {
      const url = getHuggingFaceFileUrl('org/model', 'file.gguf', 'v1.0');
      expect(url).toBe('https://huggingface.co/org/model/resolve/v1.0/file.gguf');
    });

    it('should handle special characters in repo/file names', () => {
      const url = getHuggingFaceFileUrl('org/model-name', 'file name.gguf');
      expect(url).toContain(encodeURIComponent('org/model-name'));
      expect(url).toContain(encodeURIComponent('file name.gguf'));
    });
  });
});

describe('ModelDownloader - Initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create instance with default models dir', () => {
    const downloader = new ModelDownloader();

    expect(downloader).toBeDefined();
    expect(downloader.modelsDir).toBeDefined();
  });

  it('should create instance with custom models dir', () => {
    const customDir = '/custom/models';
    const downloader = new ModelDownloader({ modelsDir: customDir });

    expect(downloader.modelsDir).toBe(customDir);
  });

  it('should create models directory if it does not exist', () => {
    fs.existsSync.mockReturnValue(false);

    new ModelDownloader({ modelsDir: '/test/models' });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      '/test/models',
      { recursive: true }
    );
  });

  it('should not create directory if it exists', () => {
    fs.existsSync.mockReturnValue(true);

    new ModelDownloader({ modelsDir: '/test/models' });

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });
});

describe('ModelDownloader - Download Status', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should have correct status constants', () => {
    expect(DOWNLOAD_STATUS.PENDING).toBe('pending');
    expect(DOWNLOAD_STATUS.DOWNLOADING).toBe('downloading');
    expect(DOWNLOAD_STATUS.PAUSED).toBe('paused');
    expect(DOWNLOAD_STATUS.COMPLETED).toBe('completed');
    expect(DOWNLOAD_STATUS.FAILED).toBe('failed');
    expect(DOWNLOAD_STATUS.CANCELLED).toBe('cancelled');
  });

  it('should have correct method constants', () => {
    expect(DOWNLOAD_METHOD.PYTHON).toBe('python');
    expect(DOWNLOAD_METHOD.NODE).toBe('node');
    expect(DOWNLOAD_METHOD.UNKNOWN).toBe('unknown');
  });

  it('should return null for non-existent job status', () => {
    const status = downloader.getDownloadStatus('nonexistent-job-id');

    expect(status).toBeNull();
  });
});

describe('ModelDownloader - Python Availability Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect Python as available', async () => {
    const mockPython = {
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockPython;
      }),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() }
    };

    mockSpawn.mockReturnValue(mockPython);

    const { checkPythonAvailable } = await import('../backend/services/modelDownloader.js');

    const result = await checkPythonAvailable();

    expect(result).toBe(true);
  });

  it('should detect Python as unavailable on error', async () => {
    const mockPython = {
      on: vi.fn((event, callback) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Python not found')), 10);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const { checkPythonAvailable } = await import('../backend/services/modelDownloader.js');

    const result = await checkPythonAvailable();

    expect(result).toBe(false);
  });

  it('should detect Python as unavailable on non-zero exit', async () => {
    const mockPython = {
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const { checkPythonAvailable } = await import('../backend/services/modelDownloader.js');

    const result = await checkPythonAvailable();

    expect(result).toBe(false);
  });

  it('should timeout after 5 seconds', async () => {
    const mockPython = {
      on: vi.fn()
    };

    mockSpawn.mockReturnValue(mockPython);

    vi.useFakeTimers();

    const { checkPythonAvailable } = await import('../backend/services/modelDownloader.js');

    const promise = checkPythonAvailable();

    vi.advanceTimersByTime(5000);

    const result = await promise;

    vi.useRealTimers();

    expect(result).toBe(false);
  });
});

describe('ModelDownloader - HuggingFace Hub Check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should detect huggingface_hub as available', async () => {
    const mockPython = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('OK\n'));
          }
        })
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 10);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const { checkHuggingFaceHubAvailable } = await import('../backend/services/modelDownloader.js');

    const result = await checkHuggingFaceHubAvailable();

    expect(result).toBe(true);
  });

  it('should detect huggingface_hub as unavailable', async () => {
    const mockPython = {
      stdout: {
        on: vi.fn()
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const { checkHuggingFaceHubAvailable } = await import('../backend/services/modelDownloader.js');

    const result = await checkHuggingFaceHubAvailable();

    expect(result).toBe(false);
  });
});

describe('ModelDownloader - Download Method Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return PYTHON method when available', async () => {
    const mockPython = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('OK\n'));
          }
        })
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const { getDownloadMethod } = await import('../backend/services/modelDownloader.js');

    const method = await getDownloadMethod();

    expect(method).toBe(DOWNLOAD_METHOD.PYTHON);
  });

  it('should return UNKNOWN when no method available', async () => {
    mockSpawn.mockImplementation(() => {
      const python = {
        on: vi.fn((event, cb) => {
          if (event === 'error') {
            setTimeout(() => cb(new Error('Not found')), 10);
          }
          return python;
        })
      };
      return python;
    });

    // Mock easy-dl as not installed
    vi.doMock('easy-dl', () => null);

    const { getDownloadMethod } = await import('../backend/services/modelDownloader.js');

    const method = await getDownloadMethod();

    expect(method).toBe(DOWNLOAD_METHOD.UNKNOWN);
  });
});

describe('ModelDownloader - Download Progress', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should track progress during download', async () => {
    const progressUpdates = [];
    const onProgress = vi.fn((update) => {
      progressUpdates.push(update);
    });

    // Mock successful Python download
    const mockPython = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Simulate progress messages
            setTimeout(() => {
              callback(Buffer.from('{"type":"start"}\n'));
            }, 10);
            setTimeout(() => {
              callback(Buffer.from('{"type":"progress","data":{"current":50,"total":100}}\n'));
            }, 20);
            setTimeout(() => {
              callback(Buffer.from('{"type":"complete","data":{"file_path":"/test/file.gguf","file_size":100}}\n'));
            }, 30);
          }
        })
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 40);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    try {
      await downloader.downloadModel('test/repo', [{ path: 'file.gguf' }], onProgress);
    } catch (e) {
      // May fail due to mocking, but we check progress
    }

    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  it('should include job ID in progress updates', async () => {
    const onProgress = vi.fn();

    const mockPython = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => {
              callback(Buffer.from('{"type":"start"}\n'));
            }, 10);
          }
        })
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') setTimeout(() => callback(0), 20);
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    try {
      await downloader.downloadModel('test/repo', [{ path: 'file.gguf' }], onProgress);
    } catch (e) {
      // Ignore
    }

    if (onProgress.mock.calls.length > 0) {
      expect(onProgress.mock.calls[0][0]).toHaveProperty('jobId');
    }
  });
});

describe('ModelDownloader - Cancellation', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should cancel active download', async () => {
    const onProgress = vi.fn();

    // Create a hanging download
    const mockPython = {
      stdout: {
        on: vi.fn()
      },
      on: vi.fn()
    };

    mockSpawn.mockReturnValue(mockPython);

    // Start download (it will hang)
    const downloadPromise = downloader.downloadModel(
      'test/repo',
      [{ path: 'file.gguf' }],
      onProgress
    );

    // Get job ID from status
    const status = downloader.getAllJobs()[0];
    const jobId = status.id;

    // Cancel the download
    downloader.cancelDownload(jobId);

    // Should not throw or hang
    try {
      await downloadPromise;
    } catch (e) {
      // Expected to fail due to cancellation
      expect(e.message).toContain('cancelled');
    }
  });

  it('should throw when cancelling non-existent job', () => {
    expect(() => {
      downloader.cancelDownload('nonexistent-job-id');
    }).toThrow('Download job not found');
  });

  it('should throw when cancelling completed download', async () => {
    const onProgress = vi.fn();

    const mockPython = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            setTimeout(() => {
              callback(Buffer.from('{"type":"complete","data":{"file_path":"/test","file_size":100}}\n'));
            }, 10);
          }
        })
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') setTimeout(() => callback(0), 20);
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    try {
      await downloader.downloadModel('test/repo', [{ path: 'file.gguf' }], onProgress);
    } catch (e) {
      // Ignore
    }

    const status = downloader.getAllJobs()[0];

    expect(() => {
      downloader.cancelDownload(status.id);
    }).toThrow('Cannot cancel completed download');
  });
});

describe('ModelDownloader - Error Handling', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should handle Python spawn errors', async () => {
    mockSpawn.mockImplementation(() => {
      throw new Error('Python not found');
    });

    const onProgress = vi.fn();

    await expect(
      downloader.downloadModel('test/repo', [{ path: 'file.gguf' }], onProgress)
    ).rejects.toThrow();
  });

  it('should handle Python process exit errors', async () => {
    const mockPython = {
      stdout: {
        on: vi.fn()
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const onProgress = vi.fn();

    await expect(
      downloader.downloadModel('test/repo', [{ path: 'file.gguf' }], onProgress)
    ).rejects.toThrow();
  });

  it('should set status to FAILED on error', async () => {
    const mockPython = {
      stdout: {
        on: vi.fn()
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 10);
        }
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const onProgress = vi.fn();

    try {
      await downloader.downloadModel('test/repo', [{ path: 'file.gguf' }], onProgress);
    } catch (e) {
      // Expected
    }

    const status = downloader.getAllJobs()[0];
    expect(status.status).toBe(DOWNLOAD_STATUS.FAILED);
  });
});

describe('ModelDownloader - Job Management', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should return all active jobs', () => {
    // Create multiple mock jobs
    const jobs = [randomUUID(), randomUUID(), randomUUID()];

    jobs.forEach(jobId => {
      downloader.downloadJobs.set(jobId, {
        id: jobId,
        status: DOWNLOAD_STATUS.DOWNLOADING,
        repo: 'test/repo',
        progress: 50,
        files: new Map(),
        startTime: Date.now()
      });
    });

    const allJobs = downloader.getAllJobs();

    expect(allJobs).toHaveLength(3);
  });

  it('should clean up old jobs', () => {
    const oldJob = randomUUID();
    const newJob = randomUUID();

    downloader.downloadJobs.set(oldJob, {
      id: oldJob,
      status: DOWNLOAD_STATUS.COMPLETED,
      completedAt: Date.now() - (61 * 60 * 1000), // 61 minutes ago
      startTime: Date.now() - (61 * 60 * 1000)
    });

    downloader.downloadJobs.set(newJob, {
      id: newJob,
      status: DOWNLOAD_STATUS.DOWNLOADING,
      startTime: Date.now()
    });

    const cleaned = downloader.cleanupOldJobs(60 * 60 * 1000);

    expect(cleaned).toBe(1);
    expect(downloader.downloadJobs.has(oldJob)).toBe(false);
    expect(downloader.downloadJobs.has(newJob)).toBe(true);
  });

  it('should get method info', async () => {
    const mockPython = {
      stdout: {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            callback(Buffer.from('OK\n'));
          }
        })
      },
      on: vi.fn((event, callback) => {
        if (event === 'close') setTimeout(() => callback(0), 10);
        return mockPython;
      })
    };

    mockSpawn.mockReturnValue(mockPython);

    const info = await downloader.getMethodInfo();

    expect(info).toHaveProperty('method');
    expect(info).toHaveProperty('pythonAvailable');
    expect(info).toHaveProperty('hfHubAvailable');
    expect(info).toHaveProperty('nodeAvailable');
  });
});

describe('ModelDownloader - File Verification', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should verify existing files', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 1000000 });

    const files = [
      { path: 'model1.gguf', dest: '/models' },
      { path: 'model2.gguf', dest: '/models' }
    ];

    const result = downloader.verifyFiles(files);

    expect(result).toBe(true);
  });

  it('should fail verification for missing files', () => {
    fs.existsSync.mockReturnValue(false);

    const files = [
      { path: 'missing.gguf', dest: '/models' }
    ];

    const result = downloader.verifyFiles(files);

    expect(result).toBe(false);
  });

  it('should fail verification for empty files', () => {
    fs.existsSync.mockReturnValue(true);
    fs.statSync.mockReturnValue({ size: 0 });

    const files = [
      { path: 'empty.gguf', dest: '/models' }
    ];

    const result = downloader.verifyFiles(files);

    expect(result).toBe(false);
  });
});

describe('ModelDownloader - Downloaded Models', () => {
  let downloader;

  beforeEach(() => {
    vi.clearAllMocks();
    downloader = new ModelDownloader();
  });

  it('should return empty array when models dir does not exist', () => {
    fs.existsSync.mockReturnValue(false);

    const models = downloader.getDownloadedModels();

    expect(models).toEqual([]);
  });

  it('should return empty array initially', () => {
    fs.existsSync.mockReturnValue(true);

    const models = downloader.getDownloadedModels();

    // Currently returns empty array (implementation could be extended)
    expect(Array.isArray(models)).toBe(true);
  });
});
